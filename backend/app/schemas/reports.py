from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class KpiSummary(BaseModel):
    """Reports snapshot for the caller (and their visibility scope)."""

    currency: str
    open_deal_count: int
    open_pipeline_value: Decimal
    won_this_month_count: int
    won_this_month_value: Decimal


class LeaderboardRow(BaseModel):
    user_id: uuid.UUID
    name: str
    won_count: int
    won_value: Decimal


class Leaderboard(BaseModel):
    currency: str
    from_date: date
    to_date: date
    rows: list[LeaderboardRow]


class LossReasonRow(BaseModel):
    lost_reason: str
    count: int
    total_value: Decimal


class LossReasons(BaseModel):
    currency: str
    from_date: date
    to_date: date
    rows: list[LossReasonRow]


class VelocityByStage(BaseModel):
    stage_id: uuid.UUID
    stage_name: str
    avg_days_in_stage: float | None
    deal_count: int


class Velocity(BaseModel):
    from_date: date
    to_date: date
    stages: list[VelocityByStage]
