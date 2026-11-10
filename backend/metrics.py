import pandas as pd
from pydantic import BaseModel


MASTERY_THRESHOLD = 60


class Scores(BaseModel):
    result_count: int
    post_score_avg: float | None
    below_threshold_pct: float | None


def summarize(scores: pd.Series) -> Scores:
    count = len(scores)
    return Scores(
        result_count=count,
        post_score_avg=float(scores.mean()) if count else None,
        below_threshold_pct=100 * int((scores < MASTERY_THRESHOLD).sum()) / count if count else None,
    )
