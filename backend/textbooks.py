from collections import defaultdict
from itertools import combinations
from typing import Literal

import pandas as pd
from pydantic import BaseModel


MIN_GROUP_SIZE = 20


class TextbookGroup(BaseModel):
    textbook_id: str
    student_count: int
    pre_score_avg: float
    post_score_avg: float
    gain_avg: float


class MatchedComparison(BaseModel):
    left_textbook_id: str
    right_textbook_id: str
    left_student_count: int
    right_student_count: int
    status: Literal["ok", "insufficient_data"]
    gain_difference: float | None


class TextbookComparison(BaseModel):
    dataset_id: str
    school_id: str | None
    topic_id: str
    groups: list[TextbookGroup]
    comparisons: list[MatchedComparison]


def build_textbook_comparison(
    results: pd.DataFrame, *, dataset_id: str, topic_id: str, school_id: str | None
) -> TextbookComparison:
    rows = results.assign(
        gain=results["post_score"] - results["pre_score"],
        pre_band=pd.cut(results["pre_score"], bins=[0, 40, 60, float("inf")], right=False, labels=False),
    )
    groups = [
        TextbookGroup(
            textbook_id=book_id,
            student_count=len(group),
            pre_score_avg=float(group["pre_score"].mean()),
            post_score_avg=float(group["post_score"].mean()),
            gain_avg=float(group["gain"].mean()),
        )
        for book_id, group in rows.groupby("textbook_id", sort=True)
    ]

    cohorts: dict[tuple[str, int], dict[str, tuple[int, float]]] = defaultdict(dict)
    for (school, band, book_id), gains in rows.groupby(["school_id", "pre_band", "textbook_id"])["gain"]:
        if len(gains) >= MIN_GROUP_SIZE:
            cohorts[school, band][book_id] = (len(gains), float(gains.mean()))

    comparisons = []
    for left, right in combinations(groups, 2):
        left_count = right_count = 0
        weighted_difference = 0.0
        for cohort in cohorts.values():
            if left.textbook_id in cohort and right.textbook_id in cohort:
                left_size, left_gain = cohort[left.textbook_id]
                right_size, right_gain = cohort[right.textbook_id]
                left_count += left_size
                right_count += right_size
                weighted_difference += (left_gain - right_gain) * (left_size + right_size)
        total = left_count + right_count
        comparisons.append(
            MatchedComparison(
                left_textbook_id=left.textbook_id,
                right_textbook_id=right.textbook_id,
                left_student_count=left_count,
                right_student_count=right_count,
                status="ok" if total else "insufficient_data",
                gain_difference=weighted_difference / total if total else None,
            )
        )

    return TextbookComparison(
        dataset_id=dataset_id, school_id=school_id, topic_id=topic_id, groups=groups, comparisons=comparisons
    )
