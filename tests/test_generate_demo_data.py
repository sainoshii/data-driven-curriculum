import csv
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean

import pytest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "generate_demo_data.py"


def run_generator(output_dir):
    subprocess.run([sys.executable, str(SCRIPT), "--output-dir", str(output_dir)], check=True)


def read_csv(path):
    with path.open(encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        return reader.fieldnames, list(reader)


@pytest.fixture(scope="module")
def demo_dir(tmp_path_factory):
    output_dir = tmp_path_factory.mktemp("demo")
    run_generator(output_dir)
    return output_dir


@pytest.fixture(scope="module")
def results(demo_dir):
    _, rows = read_csv(demo_dir / "results.csv")
    for row in rows:
        row["pre_score"] = int(row["pre_score"])
        row["post_score"] = int(row["post_score"])
    return rows


@pytest.fixture(scope="module")
def topics(demo_dir):
    _, rows = read_csv(demo_dir / "topics.csv")
    return {row["topic_name"]: row for row in rows}


def test_csv_structure_and_population(demo_dir, results):
    result_fields, _ = read_csv(demo_dir / "results.csv")
    topic_fields, topic_rows = read_csv(demo_dir / "topics.csv")
    assert result_fields == ["student_id", "school_id", "textbook_id", "topic_id", "pre_score", "post_score"]
    assert topic_fields == ["topic_id", "topic_name", "current_hours", "min_hours", "max_hours"]

    topic_ids = {row["topic_id"] for row in topic_rows}
    assert len(topic_rows) == len(topic_ids) == 25
    assert len({row["topic_name"] for row in topic_rows}) == 25
    for row in topic_rows:
        assert 0 <= int(row["min_hours"]) <= int(row["current_hours"]) <= int(row["max_hours"])

    pairs = {(row["student_id"], row["topic_id"]) for row in results}
    assert len(results) == len(pairs) == 50_000
    assert {row["topic_id"] for row in results} == topic_ids
    students = defaultdict(set)
    for row in results:
        assert 0 <= row["pre_score"] <= 100
        assert 0 <= row["post_score"] <= 100
        students[row["student_id"]].add((row["school_id"], row["textbook_id"]))

    assert len(students) == 2_000
    assert all(len(assignment) == 1 for assignment in students.values())
    cohort_sizes = Counter(pair for assignment in students.values() for pair in assignment)
    schools = {school for school, _ in cohort_sizes}
    assert len(schools) == 5
    assert {book for _, book in cohort_sizes} == {"A", "B", "C"}
    for school in schools:
        assert sum(cohort_sizes[school, book] for book in ("A", "B", "C")) == 400
        assert all(cohort_sizes[school, book] >= 130 for book in ("A", "B", "C"))


def test_generation_is_reproducible(demo_dir, tmp_path):
    other_dir = tmp_path / "second-run"
    run_generator(other_dir)
    for name in ("results.csv", "topics.csv"):
        assert (demo_dir / name).read_bytes() == (other_dir / name).read_bytes()


def test_hard_topics_and_hours_reserve(results, topics):
    scores = defaultdict(list)
    for row in results:
        scores[row["topic_id"]].append(row["post_score"])
    below_threshold = {
        topic_id: mean(score < 60 for score in post_scores)
        for topic_id, post_scores in scores.items()
    }
    hard_topics = (
        "Разложение многочлена на множители",
        "Системы линейных уравнений",
        "Геометрические доказательства",
    )
    hardest_ids = sorted(below_threshold, key=below_threshold.get, reverse=True)[:3]
    assert set(hardest_ids) == {topics[name]["topic_id"] for name in hard_topics}
    for name in hard_topics:
        topic = topics[name]
        assert below_threshold[topic["topic_id"]] >= 0.65
        assert int(topic["max_hours"]) - int(topic["current_hours"]) >= 2

    easy_topics = [topic for topic in topics.values() if below_threshold[topic["topic_id"]] <= 0.10]
    reserve = sum(int(topic["current_hours"]) - int(topic["min_hours"]) for topic in easy_topics)
    assert reserve >= 6


def test_schools_have_distinct_starting_levels(results):
    scores = defaultdict(list)
    for row in results:
        scores[row["school_id"]].append(row["pre_score"])
    school_means = [mean(scores[school]) for school in sorted(scores)]
    assert all(higher - lower >= 3 for lower, higher in zip(school_means, school_means[1:]))
    assert school_means[-1] - school_means[0] >= 16


@pytest.fixture(scope="module")
def mean_gains(results):
    gains = defaultdict(list)
    for row in results:
        group = (row["topic_id"], row["school_id"], row["textbook_id"])
        gains[group].append(row["post_score"] - row["pre_score"])
    return {group: mean(scores) for group, scores in gains.items()}


@pytest.mark.parametrize(
    ("topic_name", "preferred_book"),
    [
        ("Линейные уравнения", "A"),
        ("Текстовые задачи на уравнения", "A"),
        ("Параллельные прямые", "B"),
        ("Признаки равенства треугольников", "B"),
        ("Таблицы и графики данных", "C"),
        ("Среднее, медиана и размах", "C"),
    ],
)
def test_textbook_advantage_within_each_school(topics, mean_gains, topic_name, preferred_book):
    topic_id = topics[topic_name]["topic_id"]
    schools = {school for _, school, _ in mean_gains}
    for school in schools:
        preferred_gain = mean_gains[topic_id, school, preferred_book]
        for book in {"A", "B", "C"} - {preferred_book}:
            assert preferred_gain - mean_gains[topic_id, school, book] >= 6


@pytest.mark.parametrize("topic_name", ["Свойства степеней", "Сумма углов треугольника"])
def test_neutral_topics_have_similar_gains(topics, mean_gains, topic_name):
    topic_id = topics[topic_name]["topic_id"]
    schools = {school for _, school, _ in mean_gains}
    for school in schools:
        gains = [mean_gains[topic_id, school, book] for book in ("A", "B", "C")]
        assert max(gains) - min(gains) <= 3
