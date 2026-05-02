from __future__ import annotations

import enum
import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class TeamMetric(str, enum.Enum):
    """Metric the manager can pick on the team-vs-team leaderboard.

    Stored as a string enum so it round-trips cleanly through the
    `?metric=` query parameter and the OpenAPI spec.
    """

    won_value = "won_value"
    won_count = "won_count"
    open_pipeline_value = "open_pipeline_value"
    conversion_rate = "conversion_rate"
    avg_cycle_days = "avg_cycle_days"


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


class TeamLeaderboardRow(BaseModel):
    team_id: uuid.UUID
    team_name: str
    manager_user_id: uuid.UUID | None
    manager_name: str | None
    member_count: int
    won_count: int
    won_value: Decimal
    open_pipeline_value: Decimal
    conversion_rate: float | None
    avg_cycle_days: float | None


class TeamLeaderboard(BaseModel):
    currency: str
    from_date: date
    to_date: date
    metric: TeamMetric
    rows: list[TeamLeaderboardRow]


class MySummary(BaseModel):
    """Personal salesperson rollup for the date window.

    `companies_added` counts `Company` rows the caller owns whose
    `created_at` falls in the window — i.e. "leads I added to the
    pipeline". `conversion_rate` is `null` when the user closed no
    deals in the window (zero denominator).
    """

    currency: str
    from_date: date
    to_date: date
    companies_added: int
    deals_won_count: int
    deals_won_value: Decimal
    conversion_rate: float | None
    avg_cycle_days: float | None
