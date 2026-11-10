import csv
import io

import pytest
from fastapi.testclient import TestClient

from backend.main import app


RESULT_HEADER = "student_id,school_id,textbook_id,topic_id,pre_score,post_score\n"
TOPIC_HEADER = "topic_id,topic_name,current_hours,min_hours,max_hours\n"
RESULTS = RESULT_HEADER + "0001,01,A,001,40,58.5\n0002,02,B,001,55,72\n"
TOPICS = TOPIC_HEADER + '001,"Графики, таблицы",4,3,6\n002,Уравнения,5,3,7\n'


@pytest.fixture
def datasets_db(monkeypatch, tmp_path):
    path = tmp_path / "datasets.sqlite3"
    monkeypatch.setenv("CURRICULUM_DATASETS_DB", str(path))
    monkeypatch.setenv("CURRICULUM_PLANS_DB", str(tmp_path / "plans.sqlite3"))
    return path


def upload(client, results=RESULTS, topics=TOPICS):
    return client.post(
        "/api/datasets",
        files={
            "results": ("results.csv", results, "text/csv"),
            "topics": ("topics.csv", topics, "text/csv"),
        },
    )


def test_uploaded_dataset_persists_and_drives_all_endpoints(datasets_db):
    with TestClient(app) as client:
        response = upload(client, results="\ufeff" + RESULTS)
        assert response.status_code == 201
        dataset = response.json()
        assert dataset["is_demo"] is False and dataset["school_ids"] == ["01", "02"]
        other = upload(client, results=RESULT_HEADER + "0001,03,C,001,60,100\n").json()
        assert other["dataset_id"] not in (dataset["dataset_id"], "demo")

    assert datasets_db.is_file()
    prefix = f"/api/datasets/{dataset['dataset_id']}"
    with TestClient(app) as client:
        response = client.get(prefix + "/overview")
        assert response.status_code == 200
        overview = response.json()
        assert overview["dataset"] == dataset
        assert overview["student_count"] == 2
        assert overview["scores"] == {"result_count": 2, "post_score_avg": 65.25, "below_threshold_pct": 50.0}
        assert client.get(prefix + "/overview", params={"school_id": "01"}).json()["student_count"] == 1
        assert client.get(prefix + "/overview", params={"school_id": "03"}).status_code == 404
        assert client.get(f"/api/datasets/{other['dataset_id']}/overview").json()["student_count"] == 1
        assert client.get("/api/datasets/demo/overview").json()["student_count"] == 2000

        topics = client.get(prefix + "/topics").json()
        assert len(topics["heatmap"]) == 4
        assert topics["topics"][0]["topic_name"] == "Графики, таблицы"
        assert topics["topics"][1]["scores"] == {
            "result_count": 0, "post_score_avg": None, "below_threshold_pct": None,
        }
        comparison = client.get(prefix + "/textbook-comparison", params={"topic_id": "001"}).json()
        assert [group["textbook_id"] for group in comparison["groups"]] == ["A", "B"]
        assert comparison["comparisons"][0]["status"] == "insufficient_data"
        assert client.get(prefix + "/textbook-comparison", params={"topic_id": "002"}).json()["groups"] == []

        response = client.post(prefix + "/plans", json={"school_id": "01"})
        assert response.status_code == 201
        plan = response.json()
        assert plan["school_id"] == "01" and plan["status"] == "no_changes"
        assert plan["current_total_hours"] == plan["proposed_total_hours"] == 9
        response = client.get(prefix + f"/plans/{plan['plan_id']}/export")
        assert response.status_code == 200
        assert [row["topic_id"] for row in csv.DictReader(io.StringIO(response.text))] == ["001", "002"]
        wrong_dataset = client.get(f"/api/datasets/{other['dataset_id']}/plans/{plan['plan_id']}/export")
        assert wrong_dataset.status_code == 404 and wrong_dataset.json()["code"] == "plan_not_found"


@pytest.mark.parametrize(
    ("results", "topics", "file", "row", "field"),
    [
        (RESULTS.replace("58.5", "101"), TOPICS, "results", 2, "post_score"),
        (RESULTS.replace("58.5", "NaN"), TOPICS, "results", 2, "post_score"),
        (RESULTS.replace("A,001", "A,999"), TOPICS, "results", 2, "topic_id"),
        (RESULTS + "0001,01,A,001,40,59\n", TOPICS, "results", 4, "topic_id"),
        (RESULTS + "0001,02,A,002,40,59\n", TOPICS, "results", 4, "school_id"),
        (RESULTS + "0001,01,B,002,40,59\n", TOPICS, "results", 4, "textbook_id"),
        (RESULTS, TOPICS.replace("4,3,6", "4,5,6"), "topics", 2, None),
        (RESULTS, TOPICS + "001,Дубль,3,2,5\n", "topics", 4, "topic_id"),
        (RESULTS.replace("pre_score", "post_score", 1), TOPICS, "results", 1, None),
        (b"\xff", TOPICS, "results", None, None),
        (RESULT_HEADER, TOPICS, "results", None, None),
    ],
)
def test_invalid_upload_returns_row_details_without_saving(datasets_db, results, topics, file, row, field):
    with TestClient(app) as client:
        response = upload(client, results=results, topics=topics)
    assert response.status_code == 422
    error = response.json()
    assert error["code"] == "invalid_csv"
    detail = error["details"][0]
    assert detail["file"] == file
    assert detail.get("row") == row
    assert detail.get("field") == field
    assert detail["message"]
    assert not datasets_db.exists()
