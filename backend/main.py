from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from os import environ
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Annotated

import pandas as pd
from fastapi import Depends, FastAPI, File, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.datasets import Dataset, DatasetData, DatasetStore, InvalidCSV, make_dataset, validate_results, validate_topics
from backend.metrics import MASTERY_THRESHOLD, Scores, summarize
from backend.plans import (
    InvalidTransfer,
    Plan,
    PlanRequest,
    PlanStore,
    TransferRequest,
    apply_manual_transfer,
    build_plan,
    export_csv,
)
from backend.textbooks import TextbookComparison, build_textbook_comparison
from scripts.generate_demo_data import generate


DEMO_ID = "demo"
PUBLIC_DEMO = environ.get("CURRICULUM_PUBLIC_DEMO") == "1"
DEFAULT_PLANS_DB = Path(__file__).resolve().parents[1] / "data" / "plans.sqlite3"
DEFAULT_DATASETS_DB = DEFAULT_PLANS_DB.with_name("datasets.sqlite3")


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
    message: str
    field: str | None = None
    file: str | None = None
    row: int | None = None


class ApiError(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail]


@dataclass
class ApiFailure(Exception):
    status: int
    error: ApiError


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
    app.state.demo = make_dataset(DEMO_ID, results, topics, is_demo=True)
    if not PUBLIC_DEMO:
        app.state.datasets = DatasetStore(Path(environ.get("CURRICULUM_DATASETS_DB", str(DEFAULT_DATASETS_DB))))
    app.state.plans = PlanStore(Path(environ.get("CURRICULUM_PLANS_DB", str(DEFAULT_PLANS_DB))))
    yield


app = FastAPI(
    title="Data-Driven Curriculum API",
    lifespan=lifespan,
    openapi_url=None if PUBLIC_DEMO else "/openapi.json",
)


def error_response(status: int, error: ApiError) -> JSONResponse:
    return JSONResponse(status_code=status, content=error.model_dump(exclude_none=True))


if PUBLIC_DEMO:
    @app.middleware("http")
    async def block_upload(request: Request, call_next):
        if request.method == "POST" and request.url.path.rstrip("/") == "/api/datasets":
            return error_response(403, ApiError(
                code="uploads_disabled", message="Публичная версия работает на демонстрационных данных.", details=[],
            ))
        return await call_next(request)


@app.get("/healthz", include_in_schema=False)
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.exception_handler(ApiFailure)
async def api_failure(_request: Request, exc: ApiFailure) -> JSONResponse:
    return error_response(exc.status, exc.error)


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


def resolve_dataset(request: Request, dataset_id: str) -> DatasetData:
    if dataset_id == DEMO_ID:
        return request.app.state.demo
    dataset = None if PUBLIC_DEMO else request.app.state.datasets.load(dataset_id)
    if dataset is None:
        raise ApiFailure(404, ApiError(code="dataset_not_found", message="Набор не найден.", details=[]))
    return dataset


ResolvedDataset = Annotated[DatasetData, Depends(resolve_dataset)]


def select_school(dataset: DatasetData, school_id: str | None) -> pd.DataFrame:
    if school_id is not None and school_id not in dataset.metadata.school_ids:
        raise ApiFailure(404, ApiError(code="school_not_found", message="Школа не найдена.", details=[]))
    return dataset.results_for_school(school_id)


@app.post("/api/datasets/demo", operation_id="openDemoDataset")
def open_demo_dataset(request: Request) -> Dataset:
    return request.app.state.demo.metadata


@app.post(
    "/api/datasets",
    operation_id="uploadDataset",
    status_code=201,
    responses={422: {"model": ApiError}},
)
def upload_dataset(
    request: Request,
    results: Annotated[UploadFile, File()],
    topics: Annotated[UploadFile, File()],
) -> Dataset:
    try:
        topic_rows = validate_topics(topics.file)
        result_rows = validate_results(results.file, {row["topic_id"] for row in topic_rows})
    except InvalidCSV as exc:
        raise ApiFailure(
            422,
            ApiError(
                code="invalid_csv",
                message="Проверьте входные CSV.",
                details=[ErrorDetail(file=exc.file, row=exc.row, field=exc.field, message=str(exc))],
            ),
        ) from exc
    return request.app.state.datasets.save(result_rows, topic_rows)


@app.get(
    "/api/datasets/{dataset_id}/overview",
    operation_id="getOverview",
    response_model=Overview,
    responses={404: {"model": ApiError}, 422: {"model": ApiError}},
)
def get_overview(
    dataset: ResolvedDataset,
    school_id: Annotated[str | None, Query(min_length=1)] = None,
) -> Overview:
    results = select_school(dataset, school_id)
    topics = [
        TopicScores(topic_id=topic_id, topic_name=name, scores=summarize(group["post_score"]))
        for (topic_id, name), group in results.groupby(["topic_id", "topic_name"])
    ]
    topics.sort(key=lambda topic: (-(topic.scores.below_threshold_pct or 0), topic.topic_id))
    return Overview(
        dataset=dataset.metadata,
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
    dataset: ResolvedDataset,
    school_id: Annotated[str | None, Query(min_length=1)] = None,
) -> Topics:
    results = select_school(dataset, school_id)
    topic_scores = {
        topic_id: summarize(scores)
        for topic_id, scores in results.groupby("topic_id")["post_score"]
    }
    heatmap_scores = {
        key: summarize(scores)
        for key, scores in results.groupby(["school_id", "topic_id"])["post_score"]
    }
    catalog = list(
        dataset.topics.sort_values("topic_id")[["topic_id", "topic_name"]].itertuples(index=False, name=None)
    )
    school_ids = dataset.metadata.school_ids if school_id is None else [school_id]
    empty = Scores(result_count=0, post_score_avg=None, below_threshold_pct=None)

    return Topics(
        dataset_id=dataset.metadata.dataset_id,
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
    dataset: ResolvedDataset,
    topic_id: Annotated[str, Query(min_length=1)],
    school_id: Annotated[str | None, Query(min_length=1)] = None,
) -> TextbookComparison:
    results = select_school(dataset, school_id)
    if not dataset.topics["topic_id"].eq(topic_id).any():
        raise ApiFailure(404, ApiError(code="topic_not_found", message="Тема не найдена.", details=[]))

    return build_textbook_comparison(
        results[results["topic_id"] == topic_id],
        dataset_id=dataset.metadata.dataset_id,
        topic_id=topic_id,
        school_id=school_id,
    )


@app.post(
    "/api/datasets/{dataset_id}/plans",
    operation_id="createPlan",
    response_model=Plan,
    status_code=201,
    responses={404: {"model": ApiError}, 422: {"model": ApiError}},
)
def create_plan(request: Request, dataset: ResolvedDataset, body: PlanRequest) -> Plan:
    plan = build_plan(
        dataset.topics,
        select_school(dataset, body.school_id),
        dataset_id=dataset.metadata.dataset_id,
        school_id=body.school_id,
    )
    request.app.state.plans.save(plan)
    return plan


@app.post(
    "/api/datasets/{dataset_id}/plans/{plan_id}/transfers",
    operation_id="transferPlanHours",
    response_model=Plan,
    status_code=201,
    responses={404: {"model": ApiError}, 422: {"model": ApiError}},
)
def transfer_plan_hours(request: Request, dataset: ResolvedDataset, plan_id: str, body: TransferRequest) -> Plan:
    store: PlanStore = request.app.state.plans
    original = store.load(dataset.metadata.dataset_id, plan_id)
    if original is None:
        raise ApiFailure(404, ApiError(code="plan_not_found", message="План не найден.", details=[]))

    try:
        plan = apply_manual_transfer(original, dataset.topics, body)
    except InvalidTransfer as exc:
        raise ApiFailure(422, ApiError(code="invalid_request", message=str(exc), details=[])) from exc
    store.save(plan)
    return plan


@app.get(
    "/api/datasets/{dataset_id}/plans/{plan_id}/export",
    operation_id="exportPlan",
    response_class=Response,
    responses={
        200: {"content": {"text/csv": {"schema": {"type": "string"}}}},
        404: {"model": ApiError},
    },
)
def export_plan(request: Request, dataset: ResolvedDataset, plan_id: str) -> Response:
    plan = request.app.state.plans.load(dataset.metadata.dataset_id, plan_id)
    if plan is None:
        return error_response(404, ApiError(code="plan_not_found", message="План не найден.", details=[]))
    return Response(
        content=export_csv(plan),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="plan.csv"'},
    )


frontend_dir = environ.get("CURRICULUM_FRONTEND_DIR")
if frontend_dir:
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
