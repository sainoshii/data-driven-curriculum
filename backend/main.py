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

from backend.textbooks import TextbookComparison, build_textbook_comparison
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


class HeatmapCell(BaseModel):
    school_id: str
    topic_id: str
    scores: Scores


class Topics(BaseModel):
    dataset_id: str
    school_id: str | None
    mastery_threshold: int
    topics: list[TopicScores]
    heatmap: list[HeatmapCell]


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
    topics: pd.DataFrame

    def results_for_school(self, school_id: str | None) -> pd.DataFrame:
        if school_id is None:
            return self.results
        return self.results[self.results["school_id"] == school_id]


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
        topics=topics,
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


def scope_error(demo: DemoData, dataset_id: str, school_id: str | None) -> ApiError | None:
    if dataset_id != demo.metadata.dataset_id:
        return ApiError(code="dataset_not_found", message="Набор не найден.", details=[])
    if school_id is not None and school_id not in demo.metadata.school_ids:
        return ApiError(code="school_not_found", message="Школа не найдена.", details=[])
    return None


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
    error = scope_error(demo, dataset_id, school_id)
    if error is not None:
        return error_response(404, error)

    results = demo.results_for_school(school_id)
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


@app.get(
    "/api/datasets/{dataset_id}/topics",
    operation_id="getTopics",
    response_model=Topics,
    responses={404: {"model": ApiError}, 422: {"model": ApiError}},
)
def get_topics(
    request: Request,
    dataset_id: str,
    school_id: Annotated[str | None, Query(min_length=1)] = None,
) -> Topics | JSONResponse:
    demo: DemoData = request.app.state.demo
    error = scope_error(demo, dataset_id, school_id)
    if error is not None:
        return error_response(404, error)

    results = demo.results_for_school(school_id)
    topic_scores = {
        topic_id: summarize(scores)
        for topic_id, scores in results.groupby("topic_id")["post_score"]
    }
    heatmap_scores = {
        key: summarize(scores)
        for key, scores in results.groupby(["school_id", "topic_id"])["post_score"]
    }
    catalog = list(
        demo.topics.sort_values("topic_id")[["topic_id", "topic_name"]].itertuples(index=False, name=None)
    )
    school_ids = demo.metadata.school_ids if school_id is None else [school_id]
    empty = Scores(result_count=0, post_score_avg=None, below_threshold_pct=None)

    return Topics(
        dataset_id=dataset_id,
        school_id=school_id,
        mastery_threshold=MASTERY_THRESHOLD,
        topics=[
            TopicScores(topic_id=topic_id, topic_name=name, scores=topic_scores.get(topic_id, empty))
            for topic_id, name in catalog
        ],
        heatmap=[
            HeatmapCell(
                school_id=current_school,
                topic_id=topic_id,
                scores=heatmap_scores.get((current_school, topic_id), empty),
            )
            for current_school in school_ids
            for topic_id, _ in catalog
        ],
    )


@app.get(
    "/api/datasets/{dataset_id}/textbook-comparison",
    operation_id="compareTextbooks",
    response_model=TextbookComparison,
    responses={404: {"model": ApiError}, 422: {"model": ApiError}},
)
def compare_textbooks(
    request: Request,
    dataset_id: str,
    topic_id: Annotated[str, Query(min_length=1)],
    school_id: Annotated[str | None, Query(min_length=1)] = None,
) -> TextbookComparison | JSONResponse:
    demo: DemoData = request.app.state.demo
    error = scope_error(demo, dataset_id, school_id)
    if error is not None:
        return error_response(404, error)
    if not demo.topics["topic_id"].eq(topic_id).any():
        return error_response(404, ApiError(code="topic_not_found", message="Тема не найдена.", details=[]))

    results = demo.results_for_school(school_id)
    return build_textbook_comparison(
        results[results["topic_id"] == topic_id], dataset_id=dataset_id, topic_id=topic_id, school_id=school_id
    )
