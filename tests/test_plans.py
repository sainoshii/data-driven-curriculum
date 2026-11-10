import csv
import io
from collections import Counter

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.plans import build_plan


@pytest.fixture
def plans_db(monkeypatch, tmp_path):
    path = tmp_path / "plans.sqlite3"
    monkeypatch.setenv("CURRICULUM_PLANS_DB", str(path))
    return path


def test_demo_plan_respects_limits_and_exports_after_restart(plans_db):
    with TestClient(app) as client:
        response = client.post("/api/datasets/demo/plans", json={})
        assert response.status_code == 201
        plan = response.json()
        limits = app.state.demo.topics.set_index("topic_id")
        assert plan["school_id"] is None and plan["status"] == "recommended"
        assert len(plan["items"]) == 25

        movement = Counter()
        for transfer in plan["transfers"]:
            assert transfer["hours"] > 0
            assert transfer["from_topic_id"] != transfer["to_topic_id"]
            movement[transfer["from_topic_id"]] -= transfer["hours"]
            movement[transfer["to_topic_id"]] += transfer["hours"]
        for item in plan["items"]:
            limit = limits.loc[item["topic_id"]]
            assert item["current_hours"] == limit["current_hours"]
            assert limit["min_hours"] <= item["proposed_hours"] <= limit["max_hours"]
            assert item["proposed_hours"] - item["current_hours"] == item["delta_hours"] == movement[item["topic_id"]]
            assert abs(item["delta_hours"]) <= 2
            if item["delta_hours"] > 0:
                assert item["scores"]["below_threshold_pct"] >= 50
            elif item["delta_hours"] < 0:
                assert item["scores"]["below_threshold_pct"] <= 10
        assert sum(item["current_hours"] for item in plan["items"]) == plan["current_total_hours"]
        assert sum(item["proposed_hours"] for item in plan["items"]) == plan["proposed_total_hours"]
        assert plan["current_total_hours"] == plan["proposed_total_hours"]

    assert plans_db.is_file()
    with TestClient(app) as client:
        response = client.get(f"/api/datasets/demo/plans/{plan['plan_id']}/export")
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/csv; charset=utf-8"
        assert response.headers["content-disposition"] == 'attachment; filename="plan.csv"'
        reader = csv.DictReader(io.StringIO(response.text))
        rows = list(reader)
        assert reader.fieldnames == ["topic_id", "topic_name", "current_hours", "proposed_hours", "delta_hours", "reason"]
        assert rows == [{key: str(item[key]) for key in reader.fieldnames} for item in plan["items"]]


def test_school_plan_and_errors(plans_db):
    with TestClient(app) as client:
        response = client.post("/api/datasets/demo/plans", json={"school_id": "S01"})
        assert response.status_code == 201
        plan = response.json()
        assert plan["school_id"] == "S01"
        assert all(item["scores"]["result_count"] == 400 for item in plan["items"])
        assert client.post("/api/datasets/demo/plans", json={"school_id": "missing"}).json()["code"] == "school_not_found"
        for invalid in ({"school_id": None}, {"school_id": ""}, {"extra": 1}):
            response = client.post("/api/datasets/demo/plans", json=invalid)
            assert response.status_code == 422 and response.json()["code"] == "invalid_request"
        response = client.get("/api/datasets/demo/plans/missing/export")
        assert response.status_code == 404 and response.json()["code"] == "plan_not_found"
        response = client.get(f"/api/datasets/missing/plans/{plan['plan_id']}/export")
        assert response.status_code == 404 and response.json()["code"] == "dataset_not_found"


def test_limited_reserve_goes_to_hardest_topic():
    catalog = pd.DataFrame(
        [("A", "Резерв", 4, 3, 6), ("B", "Сложная", 4, 3, 6), ("C", "Средняя", 4, 3, 6)],
        columns=["topic_id", "topic_name", "current_hours", "min_hours", "max_hours"],
    )
    rows = pd.DataFrame(
        [("A", 90)] * 20 + [("B", 50)] * 20 + [("C", 50)] * 15 + [("C", 60)] * 5,
        columns=["topic_id", "post_score"],
    )
    plan = build_plan(catalog, rows, dataset_id="sample", school_id=None)
    assert [(t.from_topic_id, t.to_topic_id, t.hours) for t in plan.transfers] == [("A", "B", 1)]
    assert [item.proposed_hours for item in plan.items] == [3, 5, 4]

    # Removing one observation from the donor drops it below the minimum.
    plan = build_plan(catalog, rows.iloc[1:], dataset_id="sample", school_id=None)
    assert plan.status == "no_changes"
    assert plan.transfers == []
    assert all(item.delta_hours == 0 for item in plan.items)


def test_manual_transfer_saves_a_balanced_variant_with_its_own_export(plans_db):
    prefix = "/api/datasets/demo/plans"
    with TestClient(app) as client:
        original = client.post(prefix, json={}).json()
        original_url = f"{prefix}/{original['plan_id']}"
        original_csv = client.get(f"{original_url}/export").text
        response = client.post(
            f"{original_url}/transfers", json={"from_topic_id": "T08", "to_topic_id": "T11", "hours": 1}
        )
        assert response.status_code == 201
        revised = response.json()
        assert revised["plan_id"] != original["plan_id"]
        assert revised["current_total_hours"] == revised["proposed_total_hours"] == 119
        assert revised["school_id"] == original["school_id"]
        assert "Ручной перенос" in revised["explanation"]

        before = {item["topic_id"]: item for item in original["items"]}
        after = {item["topic_id"]: item for item in revised["items"]}
        assert after["T08"]["proposed_hours"] == before["T08"]["proposed_hours"] - 1
        assert after["T11"]["proposed_hours"] == before["T11"]["proposed_hours"] + 1
        assert all(after[topic] == item for topic, item in before.items() if topic not in {"T08", "T11"})

        movement = Counter()
        for transfer in revised["transfers"]:
            movement[transfer["from_topic_id"]] -= transfer["hours"]
            movement[transfer["to_topic_id"]] += transfer["hours"]
        assert all(item["delta_hours"] == movement[topic] for topic, item in after.items())
        assert client.get(f"{original_url}/export").text == original_csv
        new_csv = client.get(f"{prefix}/{revised['plan_id']}/export")
        assert new_csv.status_code == 200
        rows = {row["topic_id"]: row for row in csv.DictReader(io.StringIO(new_csv.text))}
        assert int(rows["T11"]["proposed_hours"]) == after["T11"]["proposed_hours"]
        assert rows["T11"]["reason"] == after["T11"]["reason"]

        for source, target, hours in [("T01", "T11", 1), ("T08", "T11", 2), ("T08", "T08", 1), ("T08", "T11", 0)]:
            response = client.post(
                f"{original_url}/transfers", json={"from_topic_id": source, "to_topic_id": target, "hours": hours}
            )
            assert response.status_code == 422 and response.json()["code"] == "invalid_request"
