import json
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app


EXAMPLES = Path(__file__).resolve().parents[1] / "contracts" / "examples"


def read_example(name):
    return json.loads((EXAMPLES / f"{name}.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_demo_returns_the_same_dataset_when_opened_again(client):
    expected = read_example("demo-dataset")
    for _ in range(2):
        response = client.post("/api/datasets/demo")
        assert response.status_code == 200
        assert response.json() == expected


@pytest.mark.parametrize(
    ("params", "example"),
    [({}, "demo-overview"), ({"school_id": "S01"}, "demo-overview-s01")],
)
def test_overview_matches_generated_contract_examples(client, params, example):
    dataset_id = client.post("/api/datasets/demo").json()["dataset_id"]
    response = client.get(f"/api/datasets/{dataset_id}/overview", params=params)
    assert response.status_code == 200
    actual = response.json()
    expected = read_example(example)

    actual_topics = actual.pop("hardest_topics")
    expected_topics = expected.pop("hardest_topics")
    assert actual.pop("scores") == pytest.approx(expected.pop("scores"), abs=0.00005)
    assert actual == expected
    assert len(actual_topics) == len(expected_topics) == 3
    for actual_topic, expected_topic in zip(actual_topics, expected_topics):
        assert actual_topic.pop("scores") == pytest.approx(expected_topic.pop("scores"), abs=0.00005)
        assert actual_topic == expected_topic


@pytest.mark.parametrize(
    ("dataset_id", "params", "status", "code"),
    [
        ("missing", {}, 404, "dataset_not_found"),
        ("demo", {"school_id": "missing"}, 404, "school_not_found"),
        ("demo", {"school_id": ""}, 422, "invalid_request"),
    ],
)
@pytest.mark.parametrize("route", ["overview", "topics"])
def test_invalid_analytics_requests_return_contract_errors(client, dataset_id, params, status, code, route):
    response = client.get(f"/api/datasets/{dataset_id}/{route}", params=params)
    assert response.status_code == status
    error = response.json()
    assert error["code"] == code
    assert error["message"]
    assert isinstance(error["details"], list)


@pytest.mark.parametrize(
    ("params", "school_count", "students_per_topic", "overview_example"),
    [({}, 5, 2000, "demo-overview"), ({"school_id": "S01"}, 1, 400, "demo-overview-s01")],
)
def test_topics_and_heatmap_use_the_same_scope(client, params, school_count, students_per_topic, overview_example):
    response = client.get("/api/datasets/demo/topics", params=params)
    assert response.status_code == 200
    payload = response.json()
    assert payload["dataset_id"] == "demo"
    assert payload["school_id"] == params.get("school_id")
    assert payload["mastery_threshold"] == 60

    topics = {topic["topic_id"]: topic for topic in payload["topics"]}
    assert len(payload["topics"]) == len(topics) == 25
    assert all(topic["scores"]["result_count"] == students_per_topic for topic in topics.values())

    schools = set(read_example("demo-dataset")["school_ids"]) if not params else {params["school_id"]}
    heatmap = {(cell["school_id"], cell["topic_id"]): cell["scores"] for cell in payload["heatmap"]}
    assert len(payload["heatmap"]) == len(heatmap) == school_count * 25
    assert set(heatmap) == {(school, topic_id) for school in schools for topic_id in topics}
    assert all(cell["result_count"] == 400 for cell in heatmap.values())

    for expected in read_example(overview_example)["hardest_topics"]:
        topic = topics[expected["topic_id"]]
        assert topic["topic_name"] == expected["topic_name"]
        assert topic["scores"] == pytest.approx(expected["scores"], abs=0.00005)
    if school_count == 1:
        assert all(heatmap[("S01", topic_id)] == topic["scores"] for topic_id, topic in topics.items())


def test_topics_keeps_missing_cells_and_uses_a_strict_threshold(client, monkeypatch):
    demo = app.state.demo
    sample = demo.results[
        (demo.results["school_id"] == "S01") & (demo.results["topic_id"] == "T01")
    ].head(2).assign(post_score=[59, 60])
    monkeypatch.setattr(app.state, "demo", replace(demo, results=sample))

    response = client.get("/api/datasets/demo/topics")
    assert response.status_code == 200
    payload = response.json()
    topics = {topic["topic_id"]: topic["scores"] for topic in payload["topics"]}
    heatmap = {(cell["school_id"], cell["topic_id"]): cell["scores"] for cell in payload["heatmap"]}
    missing = {"result_count": 0, "post_score_avg": None, "below_threshold_pct": None}

    assert len(topics) == 25 and len(heatmap) == 125
    assert topics["T01"] == {"result_count": 2, "post_score_avg": 59.5, "below_threshold_pct": 50.0}
    assert heatmap[("S01", "T01")] == topics["T01"]
    assert heatmap[("S02", "T01")] == topics["T02"] == missing
