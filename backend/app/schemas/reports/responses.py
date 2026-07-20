"""Typed response shapes for widget endpoints.

One model per widget so the generated OpenAPI is precise (no Any
unions in the frontend types). Shared types live at the top.

The `comparison` object is the previous-period delta the frontend
needs to render the up/down indicator without a second request.
`sparkline` is a list of daily buckets across the requested range —
the frontend renders an inline mini-chart inside the tile.

Per REPORTS_TASK §6.1.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict


class _BaseResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class SparklineBucket(_BaseResponse):
    bucket_date: date
    value: Decimal | int


class Comparison(_BaseResponse):
    value: Decimal | int
    delta_pct: float | None
    previous_from: date
    previous_to: date


class PipelineValueResponse(_BaseResponse):
    """Sum of open deals + comparison vs. previous period of equal length."""

    value: Decimal
    currency: str
    sparkline: list[SparklineBucket]
    comparison: Comparison | None


class DealsWonResponse(_BaseResponse):
    """Count + total value of closed-won deals in range."""

    count: int
    value: Decimal
    currency: str
    sparkline: list[SparklineBucket]
    comparison: Comparison | None


class WinRateResponse(_BaseResponse):
    """won_count / (won_count + lost_count) × 100, or None when no closes."""

    value: float | None
    won_count: int
    lost_count: int
    comparison: Comparison | None


class AvgDealSizeResponse(_BaseResponse):
    """Mean Deal.value across the configured scope."""

    value: Decimal
    currency: str
    sample_count: int
    comparison: Comparison | None


class NewCompaniesBreakdownItem(_BaseResponse):
    owner_user_id: uuid.UUID | None
    owner_name: str
    count: int


class NewCompaniesResponse(_BaseResponse):
    """Count of `Company` rows created in range."""

    value: int
    sparkline: list[SparklineBucket]
    comparison: Comparison | None
    breakdown: list[NewCompaniesBreakdownItem]


class SalesCycleLengthResponse(_BaseResponse):
    """Days between Company.created_at and Deal.closed_at for won deals."""

    value: float | None  # primary number per `metric` config (mean | median)
    median_days: float | None
    mean_days: float | None
    sample_count: int


class LeadConversionBreakdownItem(_BaseResponse):
    owner_user_id: uuid.UUID | None
    owner_name: str
    converted: int
    total: int


class LeadToDealConversionResponse(_BaseResponse):
    value: float | None
    converted_count: int
    total_count: int
    comparison: Comparison | None
    breakdown: list[LeadConversionBreakdownItem]


class LostReasonItem(_BaseResponse):
    reason: str
    count: int
    value: Decimal


class LostReasonsBreakdownResponse(_BaseResponse):
    items: list[LostReasonItem]
    total_count: int
    total_value: Decimal
    currency: str


class SalesLeaderboardItem(_BaseResponse):
    user_id: uuid.UUID | None
    name: str
    metric_value: Decimal | float | int


class SalesLeaderboardResponse(_BaseResponse):
    items: list[SalesLeaderboardItem]
    metric: str  # echoes the request's metric config
    # Echoes org currency so the frontend can format `won_value`
    # entries as money. Other metrics (count, percent) ignore it.
    currency: str


class RepActivityItem(_BaseResponse):
    user_id: uuid.UUID | None
    name: str
    deals_added: int


class RepActivityResponse(_BaseResponse):
    items: list[RepActivityItem]


class StaleDealItem(_BaseResponse):
    deal_id: uuid.UUID
    deal_name: str
    company_id: uuid.UUID
    company_name: str
    stage_name: str
    value: Decimal
    currency: str
    owner_user_id: uuid.UUID | None
    owner_name: str
    days_since_change: int


class StaleDealsResponse(_BaseResponse):
    items: list[StaleDealItem]
    threshold_days: int


class CompanyAtRiskItem(_BaseResponse):
    company_id: uuid.UUID
    company_name: str
    owner_user_id: uuid.UUID | None
    owner_name: str
    days_until_freeing: int
    last_activity_at: date | None


class CompaniesAtRiskResponse(_BaseResponse):
    items: list[CompanyAtRiskItem]
    threshold_days: int


class WeightedPipelineResponse(_BaseResponse):
    """Probability-weighted open pipeline + the unweighted sum for context."""

    value: Decimal
    open_value: Decimal
    currency: str
    comparison: Comparison | None


class ForecastBucket(_BaseResponse):
    kind: Literal["overdue", "month", "later", "no_date"]
    year_month: str | None  # "YYYY-MM", set only when kind == "month"
    count: int
    value: Decimal
    weighted_value: Decimal


class SalesForecastResponse(_BaseResponse):
    """Open-deal value bucketed by expected close month (6-month horizon)."""

    buckets: list[ForecastBucket]
    currency: str
    total_value: Decimal
    total_weighted_value: Decimal


class WonVsPaidResponse(_BaseResponse):
    """Paid/unpaid split of deals won in the window. `paid_pct` is None
    when nothing was won (no denominator)."""

    won_count: int
    paid_count: int
    won_value: Decimal
    paid_value: Decimal
    unpaid_value: Decimal
    paid_pct: float | None
    currency: str
