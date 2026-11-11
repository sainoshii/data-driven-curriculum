import io
import json

import pytest
from fastapi.testclient import TestClient

from backend import plan_draft
from backend.main import app
from backend.plans import Plan


@pytest.fixture
def demo_client(monkeypatch, tmp_path):
    monkeypatch.delenv("CURRICULUM_OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("CURRICULUM_PLANS_DB", str(tmp_path / "plans.sqlite3"))
    plan_draft.generate_intro.cache_clear()
    plan_draft.request_times.clear()
    with TestClient(app) as client:
        yield client
    plan_draft.generate_intro.cache_clear()
    plan_draft.request_times.clear()


def test_manual_draft_uses_saved_plan_and_falls_back_without_key(demo_client):
    prefix = "/api/datasets/demo/plans"
    auto = demo_client.post(prefix, json={}).json()
    manual = demo_client.post(
        f"{prefix}/{auto['plan_id']}/transfers",
        json={"from_topic_id": "T08", "to_topic_id": "T11", "hours": 1},
    ).json()

    response = demo_client.post(f"{prefix}/{manual['plan_id']}/explanation-draft")
    assert response.status_code == 200
    assert response.json()["source"] == "template"
    assert "119 → 119 ч" in response.json()["text"]
    assert manual["explanation"] in response.json()["text"]
    assert demo_client.post(f"{prefix}/missing/explanation-draft").status_code == 404


def test_model_intro_keeps_facts_and_only_sends_demo_data(demo_client, monkeypatch):
    monkeypatch.setenv("CURRICULUM_OPENAI_API_KEY", "test-key")
    requests = []

    def respond(request, *, timeout):
        requests.append(json.loads(request.data))
        return io.BytesIO(json.dumps({
            "status": "completed",
            "output": [{"type": "message", "content": [{
                "type": "output_text",
                "text": "Предлагаю обсудить резерв времени и проверить границы по темам.",
            }]}],
        }).encode())

    monkeypatch.setattr(plan_draft, "urlopen", respond)
    prefix = "/api/datasets/demo/plans"
    plan = demo_client.post(prefix, json={"school_id": "S01"}).json()
    draft = demo_client.post(f"{prefix}/{plan['plan_id']}/explanation-draft").json()
    assert draft["source"] == "openai"
    assert draft["text"].startswith("Предлагаю обсудить")
    assert "96,25% ниже 60 баллов" in draft["text"]
    assert len(requests) == 1
    assert requests[0]["store"] is False
    assert plan["plan_id"] not in requests[0]["input"]
    assert plan_draft.build_plan_draft(Plan.model_validate(plan), is_demo=False).source == "template"
    assert len(requests) == 1


def test_provider_timeout_returns_a_template(demo_client, monkeypatch):
    monkeypatch.setenv("CURRICULUM_OPENAI_API_KEY", "test-key")

    def timeout(*args, **kwargs):
        raise TimeoutError

    monkeypatch.setattr(plan_draft, "urlopen", timeout)
    prefix = "/api/datasets/demo/plans"
    plan = demo_client.post(prefix, json={}).json()
    draft = demo_client.post(f"{prefix}/{plan['plan_id']}/explanation-draft").json()
    assert draft["source"] == "template"
    assert "119 → 119 ч" in draft["text"]
