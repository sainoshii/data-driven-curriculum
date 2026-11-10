import csv
import io
import sqlite3
from collections.abc import Iterator
from contextlib import closing, contextmanager
from pathlib import Path
from typing import Annotated, Literal
from uuid import uuid4

import pandas as pd
from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.metrics import MASTERY_THRESHOLD, Scores, summarize


MIN_RESULTS = 20
NEEDS_HOURS_PCT = 50
CAN_SPARE_HOURS_PCT = 10
MAX_HOUR_SHIFT = 2


class PlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    school_id: Annotated[str | None, Field(min_length=1)] = None

    @field_validator("school_id")
    @classmethod
    def validate_school_id(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("Чтобы выбрать все школы, уберите поле school_id.")
        return value


class PlanItem(BaseModel):
    topic_id: str
    topic_name: str
    current_hours: int
    proposed_hours: int
    delta_hours: int
    scores: Scores
    reason: str


class Transfer(BaseModel):
    from_topic_id: str
    to_topic_id: str
    hours: int


class Plan(BaseModel):
    dataset_id: str
    plan_id: str
    school_id: str | None
    mastery_threshold: int
    status: Literal["recommended", "no_changes"]
    explanation: str
    current_total_hours: int
    proposed_total_hours: int
    items: list[PlanItem]
    transfers: list[Transfer]


def build_plan(
    catalog: pd.DataFrame, results: pd.DataFrame, *, dataset_id: str, school_id: str | None
) -> Plan:
    scores_by_topic = {
        topic_id: summarize(scores) for topic_id, scores in results.groupby("topic_id")["post_score"]
    }
    empty = Scores(result_count=0, post_score_avg=None, below_threshold_pct=None)
    items = {}
    donors = []
    recipients = []
    for topic in catalog.sort_values("topic_id").itertuples(index=False):
        scores = scores_by_topic.get(topic.topic_id, empty)
        pct = scores.below_threshold_pct
        reason = "Нет допустимого переноса по заданным правилам."
        if scores.result_count < MIN_RESULTS or pct is None:
            reason = "Недостаточно результатов для рекомендации."
        elif pct >= NEEDS_HOURS_PCT and topic.current_hours < topic.max_hours:
            room = min(MAX_HOUR_SHIFT, topic.max_hours - topic.current_hours)
            recipients.append((-pct, topic.topic_id, room))
        elif pct <= CAN_SPARE_HOURS_PCT and topic.current_hours > topic.min_hours:
            room = min(MAX_HOUR_SHIFT, topic.current_hours - topic.min_hours)
            donors.append((pct, topic.topic_id, room))

        items[topic.topic_id] = PlanItem(
            topic_id=topic.topic_id,
            topic_name=topic.topic_name,
            current_hours=topic.current_hours,
            proposed_hours=topic.current_hours,
            delta_hours=0,
            scores=scores,
            reason=reason,
        )

    remaining = {topic_id: room for _, topic_id, room in sorted(donors)}
    transfers = []
    for _, target_id, need in sorted(recipients):
        for source_id, available in remaining.items():
            if not need:
                break
            hours = min(need, available)
            if hours:
                remaining[source_id] -= hours
                need -= hours
                items[source_id].delta_hours -= hours
                items[target_id].delta_hours += hours
                transfers.append(Transfer(from_topic_id=source_id, to_topic_id=target_id, hours=hours))

    for item in items.values():
        item.proposed_hours += item.delta_hours
        if item.delta_hours:
            pct = item.scores.below_threshold_pct
            action = "Добавить часы для проработки темы." if item.delta_hours > 0 else "Передать резерв часов сложной теме."
            item.reason = f"{pct:.1f}% результатов ниже порога ({item.scores.result_count} результатов). {action}"

    return Plan(
        dataset_id=dataset_id,
        plan_id=uuid4().hex,
        school_id=school_id,
        mastery_threshold=MASTERY_THRESHOLD,
        status="recommended" if transfers else "no_changes",
        explanation=(
            "Часы перенесены из хорошо освоенных тем в сложные. Общий бюджет сохранён."
            if transfers
            else "В выбранном срезе нет допустимых переносов с учётом результатов и границ часов."
        ),
        current_total_hours=sum(item.current_hours for item in items.values()),
        proposed_total_hours=sum(item.proposed_hours for item in items.values()),
        items=list(items.values()),
        transfers=transfers,
    )


class PlanStore:
    def __init__(self, path: Path):
        self.path = path

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute(
                """CREATE TABLE IF NOT EXISTS plans (
                    dataset_id TEXT NOT NULL,
                    plan_id TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    PRIMARY KEY (dataset_id, plan_id)
                )"""
            )
            yield db

    def save(self, plan: Plan) -> None:
        with self.connection() as db:
            db.execute(
                "INSERT INTO plans (dataset_id, plan_id, payload) VALUES (?, ?, ?)",
                (plan.dataset_id, plan.plan_id, plan.model_dump_json()),
            )

    def load(self, dataset_id: str, plan_id: str) -> Plan | None:
        if not self.path.is_file():
            return None
        with self.connection() as db:
            row = db.execute(
                "SELECT payload FROM plans WHERE dataset_id = ? AND plan_id = ?", (dataset_id, plan_id)
            ).fetchone()
        return Plan.model_validate_json(row[0]) if row is not None else None


def export_csv(plan: Plan) -> str:
    fields = ("topic_id", "topic_name", "current_hours", "proposed_hours", "delta_hours", "reason")
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    for item in plan.items:
        writer.writerow(item.model_dump(include=set(fields)))
    return output.getvalue()
