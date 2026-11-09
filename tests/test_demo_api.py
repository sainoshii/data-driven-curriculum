import json
from dataclasses import replace
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.textbooks import build_textbook_comparison


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


def test_topics_keeps_missing_cells_and_uses_a_strict_threshold(client):
    demo = app.state.demo
    sample = demo.results[
        (demo.results["school_id"] == "S01") & (demo.results["topic_id"] == "T01")
    ].head(2).assign(post_score=[59, 60])
    app.state.demo = replace(demo, results=sample)
    try:
        response = client.get("/api/datasets/demo/topics")
    finally:
        app.state.demo = demo
    assert response.status_code == 200
    payload = response.json()
    topics = {topic["topic_id"]: topic["scores"] for topic in payload["topics"]}
    heatmap = {(cell["school_id"], cell["topic_id"]): cell["scores"] for cell in payload["heatmap"]}
    missing = {"result_count": 0, "post_score_avg": None, "below_threshold_pct": None}

    assert len(topics) == 25 and len(heatmap) == 125
    assert topics["T01"] == {"result_count": 2, "post_score_avg": 59.5, "below_threshold_pct": 50.0}
    assert heatmap[("S01", "T01")] == topics["T01"]
    assert heatmap[("S02", "T01")] == topics["T02"] == missing


@pytest.mark.parametrize(
    ("topic_id", "school_id", "student_count", "expected_leader"),
    [("T09", None, 2000, "A"), ("T19", "S01", 400, "B"), ("T15", "S02", 400, "C")],
)
def test_textbook_comparison_matches_demo_patterns(client, topic_id, school_id, student_count, expected_leader):
    params = {"topic_id": topic_id}
    if school_id is not None:
        params["school_id"] = school_id
    response = client.get("/api/datasets/demo/textbook-comparison", params=params)
    assert response.status_code == 200
    payload = response.json()
    assert payload["dataset_id"] == "demo"
    assert payload["topic_id"] == topic_id and payload["school_id"] == school_id
    assert {group["textbook_id"] for group in payload["groups"]} == {"A", "B", "C"}
    assert sum(group["student_count"] for group in payload["groups"]) == student_count

    comparisons = payload["comparisons"]
    assert len(comparisons) == 3
    for pair in comparisons:
        assert pair["status"] == "ok"
        if pair["left_textbook_id"] == expected_leader:
            assert pair["gain_difference"] > 5
        elif pair["right_textbook_id"] == expected_leader:
            assert pair["gain_difference"] < -5


@pytest.mark.parametrize(
    ("params", "status", "code"),
    [
        ({}, 422, "invalid_request"),
        ({"topic_id": ""}, 422, "invalid_request"),
        ({"topic_id": "missing"}, 404, "topic_not_found"),
        ({"topic_id": "T09", "school_id": "missing"}, 404, "school_not_found"),
    ],
)
def test_textbook_comparison_checks_topic_and_school(client, params, status, code):
    response = client.get("/api/datasets/demo/textbook-comparison", params=params)
    assert response.status_code == status
    assert response.json()["code"] == code


def test_matched_textbook_comparison_excludes_small_cohorts_and_uses_pooled_weights():
    records = []
    for school, book, pre, gain, count in (
        ("S01", "A", 39, 30, 20),
        ("S01", "B", 39, 20, 20),
        ("S02", "A", 60, 6, 40),
        ("S02", "B", 60, 10, 20),
        ("S01", "A", 40, 40, 19),
        ("S01", "B", 40, 0, 30),
        ("S03", "A", 39, 50, 30),
        ("S04", "B", 39, 0, 30),
        ("S01", "C", 39, 10, 19),
    ):
        records.extend((school, book, pre, pre + gain) for _ in range(count))
    rows = pd.DataFrame(records, columns=["school_id", "textbook_id", "pre_score", "post_score"])
    comparison = build_textbook_comparison(rows, dataset_id="sample", topic_id="T01", school_id=None)
    ab, ac, bc = comparison.comparisons
    assert (ab.left_textbook_id, ab.right_textbook_id) == ("A", "B")
    assert (ab.left_student_count, ab.right_student_count) == (60, 40)
    assert ab.status == "ok" and ab.gain_difference == pytest.approx(1.6)
    for pair in (ac, bc):
        assert pair.status == "insufficient_data"
        assert pair.gain_difference is None
        assert (pair.left_student_count, pair.right_student_count) == (0, 0)
