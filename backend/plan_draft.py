import json
from collections import deque
from functools import lru_cache
from logging import getLogger
from os import environ
from re import search
from threading import Lock
from time import monotonic
from typing import Literal
from urllib.request import Request, urlopen

from pydantic import BaseModel

from backend.plans import Plan, PlanItem


logger = getLogger(__name__)
request_times: deque[float] = deque()
request_lock = Lock()


class PlanDraft(BaseModel):
    text: str
    source: Literal["openai", "template"]


def evidence(item: PlanItem, threshold: int) -> str:
    scores = item.scores
    if scores.below_threshold_pct is None:
        return "нет данных по порогу"
    share = f"{scores.below_threshold_pct:.2f}".rstrip("0").rstrip(".").replace(".", ",")
    return f"{share}% ниже {threshold} баллов, выборка {scores.result_count}"


def plan_facts(plan: Plan) -> str:
    lines = [
        f"Срез — {plan.school_id or 'все школы'}.",
        f"Бюджет до и после — {plan.current_total_hours} → {plan.proposed_total_hours} ч.",
        plan.explanation,
    ]
    items = {item.topic_id: item for item in plan.items}
    for transfer in plan.transfers[:3]:
        source = items[transfer.from_topic_id]
        target = items[transfer.to_topic_id]
        lines.append(
            f"Из темы «{source.topic_name}» в тему «{target.topic_name}» — {transfer.hours} ч. "
            f"Исходная тема — {evidence(source, plan.mastery_threshold)}. "
            f"Целевая тема — {evidence(target, plan.mastery_threshold)}."
        )
    if len(plan.transfers) > 3:
        lines.append(f"Остальные переносы в полном плане — {len(plan.transfers) - 3}.")
    return "\n".join(lines)


@lru_cache(maxsize=64)
def generate_intro(facts: str) -> str:
    with request_lock:
        now = monotonic()
        while request_times and now - request_times[0] >= 60:
            request_times.popleft()
        if len(request_times) >= 12:
            raise ValueError("Draft request limit reached")
        request_times.append(now)

    payload = {
        "model": "gpt-6-luna",
        "reasoning": {"effort": "none"},
        "instructions": (
            "Напиши вступление к черновику пояснения для школьного методиста по предоставленному плану. "
            "Дай один короткий абзац на русском. Укажи, какое решение предстоит обсудить и что проверить. "
            "Числа и переносы будут приведены отдельно. Не добавляй цифры, новые переносы, прогнозы и оценки учебников. "
            "Если план оставляет часы без изменений, предложи обсудить основания этого решения."
        ),
        "input": facts,
        "max_output_tokens": 300,
        "store": False,
    }
    request = Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {environ['CURRICULUM_OPENAI_API_KEY']}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urlopen(request, timeout=8) as response:
        result = json.load(response)
    if result["status"] != "completed":
        raise ValueError("Incomplete model response")
    intro = " ".join(
        part["text"].strip()
        for item in result["output"]
        if item["type"] == "message"
        for part in item["content"]
        if part["type"] == "output_text"
    )
    if not intro or len(intro) > 700 or search(r"\d", intro):
        raise ValueError("Invalid plan draft introduction")
    return intro


def build_plan_draft(plan: Plan, *, is_demo: bool) -> PlanDraft:
    facts = plan_facts(plan)
    if is_demo and environ.get("CURRICULUM_OPENAI_API_KEY"):
        try:
            return PlanDraft(text=f"{generate_intro(facts)}\n\n{facts}", source="openai")
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
            logger.warning("Using the plan draft template (%s)", type(error).__name__)
    return PlanDraft(text=f"К обсуждению с методистом\n\n{facts}", source="template")
