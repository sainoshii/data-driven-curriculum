import json
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
def test_invalid_overview_requests_return_contract_errors(client, dataset_id, params, status, code):
    response = client.get(f"/api/datasets/{dataset_id}/overview", params=params)
    assert response.status_code == status
    error = response.json()
    assert error["code"] == code
    assert error["message"]
    assert isinstance(error["details"], list)
