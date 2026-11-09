from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Annotated

import pandas as pd
from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from scripts.generate_demo_data import generate


DEMO_ID = "demo"
MASTERY_THRESHOLD = 60


class Dataset(BaseModel):
    dataset_id: str
    is_demo: bool
    school_ids: list[str]


class Scores(BaseModel):
    result_count: int
    post_score_avg: float | None
    below_threshold_pct: float | None


class TopicScores(BaseModel):
    topic_id: str
    topic_name: str
    scores: Scores


class Overview(BaseModel):
    dataset: Dataset
    school_id: str | None
    mastery_threshold: int
    student_count: int
    scores: Scores
    hardest_topics: list[TopicScores]


class ErrorDetail(BaseModel):
    field: str
    message: str


class ApiError(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail]


@dataclass(frozen=True)
class DemoData:
    metadata: Dataset
    results: pd.DataFrame


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Build the demo independently of user files and keep it in memory.
    with TemporaryDirectory(prefix="curriculum-demo-") as directory:
        output_dir = Path(directory)
        generate(output_dir)
        results = pd.read_csv(
            output_dir / "results.csv",
            dtype={key: str for key in ("student_id", "school_id", "topic_id")},
        )
        topics = pd.read_csv(output_dir / "topics.csv", dtype={"topic_id": str})
    app.state.demo = DemoData(
        metadata=Dataset(
            dataset_id=DEMO_ID,
            is_demo=True,
            school_ids=sorted(results["school_id"].unique().tolist()),
        ),
        results=results.merge(topics[["topic_id", "topic_name"]], on="topic_id", validate="many_to_one"),
    )
    yield


app = FastAPI(title="Data-Driven Curriculum API", lifespan=lifespan)


def error_response(status: int, error: ApiError) -> JSONResponse:
    return JSONResponse(status_code=status, content=error.model_dump())


@app.exception_handler(RequestValidationError)
async def invalid_request(_request: Request, exc: RequestValidationError) -> JSONResponse:
    return error_response(
        422,
        ApiError(
            code="invalid_request",
            message="Проверьте параметры запроса.",
            details=[
                ErrorDetail(field=".".join(map(str, item["loc"][1:])), message=item["msg"])
                for item in exc.errors()
            ],
        ),
    )


def summarize(scores: pd.Series) -> Scores:
    count = len(scores)
    return Scores(
        result_count=count,
        post_score_avg=float(scores.mean()) if count else None,
        below_threshold_pct=100 * int((scores < MASTERY_THRESHOLD).sum()) / count if count else None,
    )


@app.post("/api/datasets/demo", operation_id="openDemoDataset")
def open_demo_dataset(request: Request) -> Dataset:
    return request.app.state.demo.metadata


@app.get(
    "/api/datasets/{dataset_id}/overview",
    operation_id="getOverview",
    response_model=Overview,
    responses={404: {"model": ApiError}, 422: {"model": ApiError}},
)
def get_overview(
    request: Request,
    dataset_id: str,
    school_id: Annotated[str | None, Query(min_length=1)] = None,
) -> Overview | JSONResponse:
    demo: DemoData = request.app.state.demo
    if dataset_id != demo.metadata.dataset_id:
        return error_response(404, ApiError(code="dataset_not_found", message="Набор не найден.", details=[]))
    if school_id is not None and school_id not in demo.metadata.school_ids:
        return error_response(404, ApiError(code="school_not_found", message="Школа не найдена.", details=[]))

    results = demo.results
    if school_id is not None:
        results = results[results["school_id"] == school_id]

    topics = [
        TopicScores(topic_id=topic_id, topic_name=name, scores=summarize(group["post_score"]))
        for (topic_id, name), group in results.groupby(["topic_id", "topic_name"])
    ]
    topics.sort(key=lambda topic: (-(topic.scores.below_threshold_pct or 0), topic.topic_id))
    return Overview(
        dataset=demo.metadata,
        school_id=school_id,
        mastery_threshold=MASTERY_THRESHOLD,
        student_count=int(results["student_id"].nunique()),
        scores=summarize(results["post_score"]),
        hardest_topics=topics[:3],
    )
