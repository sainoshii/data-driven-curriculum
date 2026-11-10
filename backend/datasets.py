import csv
import io
import json
import sqlite3
from collections.abc import Iterator
from contextlib import closing, contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO
from uuid import uuid4

import pandas as pd
from pydantic import BaseModel


MAX_FILE_BYTES = 5 * 1024 * 1024
RESULT_FIELDS = ("student_id", "school_id", "textbook_id", "topic_id", "pre_score", "post_score")
TOPIC_FIELDS = ("topic_id", "topic_name", "current_hours", "min_hours", "max_hours")


class Dataset(BaseModel):
    dataset_id: str
    is_demo: bool
    school_ids: list[str]


@dataclass(frozen=True)
class DatasetData:
    metadata: Dataset
    results: pd.DataFrame
    topics: pd.DataFrame

    def results_for_school(self, school_id: str | None) -> pd.DataFrame:
        if school_id is None:
            return self.results
        return self.results[self.results["school_id"] == school_id]


def make_dataset(dataset_id: str, results: pd.DataFrame, topics: pd.DataFrame, *, is_demo: bool) -> DatasetData:
    return DatasetData(
        metadata=Dataset(dataset_id=dataset_id, is_demo=is_demo, school_ids=sorted(results["school_id"].unique().tolist())),
        results=results.merge(topics[["topic_id", "topic_name"]], on="topic_id", validate="many_to_one"),
        topics=topics,
    )


class InvalidCSV(ValueError):
    def __init__(self, file: str, message: str, *, row: int | None = None, field: str | None = None):
        super().__init__(message)
        self.file = file
        self.row = row
        self.field = field


def records(source: BinaryIO, file: str, columns: tuple[str, ...]) -> Iterator[tuple[int, dict[str, str]]]:
    raw = source.read(MAX_FILE_BYTES + 1)
    if len(raw) > MAX_FILE_BYTES:
        raise InvalidCSV(file, "Размер файла превышает 5 МиБ.")
    try:
        content = raw.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise InvalidCSV(file, "Сохраните CSV в кодировке UTF-8.") from error

    reader = csv.reader(io.StringIO(content, newline=""), strict=True)
    row_number = 1
    has_data = False
    try:
        header = next(reader, [])
        if len(header) != len(columns) or set(header) != set(columns):
            raise InvalidCSV(file, "Ожидаемые столбцы: " + ", ".join(columns), row=1)
        row_number = 2
        for row in reader:
            if row:
                if len(row) != len(header):
                    raise InvalidCSV(file, "Число полей не совпадает с заголовком.", row=row_number)
                has_data = True
                yield row_number, dict(zip(header, (cell.strip() for cell in row)))
            row_number += 1
    except csv.Error as error:
        raise InvalidCSV(file, "Не удалось прочитать запись CSV.", row=row_number) from error
    if not has_data:
        raise InvalidCSV(file, "В файле должна быть хотя бы одна запись.")


def validate_topics(source: BinaryIO) -> list[dict]:
    topics = []
    topic_ids = set()
    for row, fields in records(source, "topics", TOPIC_FIELDS):
        for field in ("topic_id", "topic_name"):
            if not fields[field]:
                raise InvalidCSV("topics", "Поле не должно быть пустым.", row=row, field=field)
        topic_id = fields["topic_id"]
        if topic_id in topic_ids:
            raise InvalidCSV("topics", "Тема повторяется.", row=row, field="topic_id")
        topic_ids.add(topic_id)

        hours = {}
        for field in ("current_hours", "min_hours", "max_hours"):
            try:
                hours[field] = int(fields[field])
            except ValueError as error:
                raise InvalidCSV("topics", "Часы должны быть целым числом.", row=row, field=field) from error
        if not 0 <= hours["min_hours"] <= hours["current_hours"] <= hours["max_hours"]:
            raise InvalidCSV("topics", "Требуется 0 ≤ min_hours ≤ current_hours ≤ max_hours.", row=row)
        topics.append({"topic_id": topic_id, "topic_name": fields["topic_name"], **hours})
    return topics


def validate_results(source: BinaryIO, topic_ids: set[str]) -> list[dict]:
    results = []
    assignments = {}
    student_topics = set()
    for row, fields in records(source, "results", RESULT_FIELDS):
        ids = {field: fields[field] for field in ("student_id", "school_id", "textbook_id", "topic_id")}
        for field, value in ids.items():
            if not value:
                raise InvalidCSV("results", "Поле не должно быть пустым.", row=row, field=field)
        student_id, topic_id = ids["student_id"], ids["topic_id"]
        if topic_id not in topic_ids:
            raise InvalidCSV("results", "Такой темы нет в topics.csv.", row=row, field="topic_id")
        pair = (student_id, topic_id)
        if pair in student_topics:
            raise InvalidCSV("results", "Пара ученик–тема повторяется.", row=row, field="topic_id")
        student_topics.add(pair)

        assignment = (ids["school_id"], ids["textbook_id"])
        original = assignments.setdefault(student_id, assignment)
        if original != assignment:
            field = "school_id" if original[0] != assignment[0] else "textbook_id"
            raise InvalidCSV("results", "Школа и учебник ученика должны быть постоянными.", row=row, field=field)

        scores = {}
        for field in ("pre_score", "post_score"):
            try:
                score = float(fields[field])
            except ValueError as error:
                raise InvalidCSV("results", "Ожидается балл от 0 до 100.", row=row, field=field) from error
            if not 0 <= score <= 100:
                raise InvalidCSV("results", "Ожидается балл от 0 до 100.", row=row, field=field)
            scores[field] = score
        results.append({**ids, **scores})
    return results


class DatasetStore:
    def __init__(self, path: Path):
        self.path = path

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute(
                """CREATE TABLE IF NOT EXISTS datasets (
                    dataset_id TEXT PRIMARY KEY,
                    results TEXT NOT NULL,
                    topics TEXT NOT NULL
                )"""
            )
            yield db

    def save(self, results: list[dict], topics: list[dict]) -> Dataset:
        dataset_id = uuid4().hex
        with self.connection() as db:
            db.execute(
                "INSERT INTO datasets (dataset_id, results, topics) VALUES (?, ?, ?)",
                (dataset_id, json.dumps(results, ensure_ascii=False), json.dumps(topics, ensure_ascii=False)),
            )
        return Dataset(dataset_id=dataset_id, is_demo=False, school_ids=sorted({row["school_id"] for row in results}))

    def load(self, dataset_id: str) -> DatasetData | None:
        if not self.path.is_file():
            return None
        with self.connection() as db:
            row = db.execute("SELECT results, topics FROM datasets WHERE dataset_id = ?", (dataset_id,)).fetchone()
        if row is None:
            return None
        results = pd.DataFrame(json.loads(row[0]))
        topics = pd.DataFrame(json.loads(row[1]), dtype=object)
        return make_dataset(dataset_id, results, topics, is_demo=False)
