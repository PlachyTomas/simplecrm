from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.db.models.enums import SalesGoalMetric


class SalesGoalIn(BaseModel):
    """Create/update body. `user_id = None` means an org-wide goal."""

    user_id: uuid.UUID | None = None
    # Any date inside the month is accepted and normalized to its first day,
    # so a client can post `2026-07-27` without doing calendar maths.
    period_month: date
    metric: SalesGoalMetric
    target_value: Decimal = Field(ge=Decimal("0"), le=Decimal("999999999999"))

    @field_validator("period_month")
    @classmethod
    def _first_of_month(cls, value: date) -> date:
        return value.replace(day=1)


class SalesGoalProgress(BaseModel):
    """A goal plus what has actually happened this month.

    `actual` is never stored — it is computed from the same `won_in_window`
    helper the `deals_won` report widget uses, so goal and report agree by
    construction. For `won_count` it is a whole number carried in the same
    Decimal field as `won_value`.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID | None = None
    # Denormalized so the settings list and the widget can label a goal
    # without a second request. None for org-wide goals.
    user_name: str | None = None
    period_month: date
    metric: SalesGoalMetric
    target_value: Decimal
    actual_value: Decimal
    # 0..∞ (not clamped at 100 — beating a target is worth showing).
    progress_pct: float
    currency: str
    created_at: datetime
    updated_at: datetime


class SalesGoalList(BaseModel):
    items: list[SalesGoalProgress]
