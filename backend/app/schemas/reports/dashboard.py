"""DashboardConfig — the user's persisted widget layout.

Validation rules (REPORTS_TASK §6.2 server-side validation):
- Reject unknown widget types (covered by the discriminated union).
- Reject invalid config values (per-widget; Pydantic enforces Literal
  fields).
- Reject overlapping positions on the 12-col grid.
- Reject more than 20 widgets per dashboard.
- Reject invalid grid positions (`x + w > 12`, `h < 1`, x/y/w/h
  negative).
"""

from __future__ import annotations

import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.reports.widgets import (
    AvgDealSizeConfig,
    CompaniesAtRiskConfig,
    DealsWonConfig,
    LeadToDealConversionConfig,
    LostReasonsBreakdownConfig,
    NewCompaniesConfig,
    PipelineValueConfig,
    RepActivityConfig,
    SalesCycleLengthConfig,
    SalesLeaderboardConfig,
    StaleDealsConfig,
    WinRateConfig,
)

# Discriminated union: Pydantic picks the right subclass off the `type`
# field. Unknown types fail validation with a clear message instead of
# silently coercing into one of the variants.
WidgetConfig = Annotated[
    PipelineValueConfig
    | NewCompaniesConfig
    | DealsWonConfig
    | WinRateConfig
    | AvgDealSizeConfig
    | SalesCycleLengthConfig
    | LeadToDealConversionConfig
    | LostReasonsBreakdownConfig
    | SalesLeaderboardConfig
    | RepActivityConfig
    | StaleDealsConfig
    | CompaniesAtRiskConfig,
    Field(discriminator="type"),
]


GRID_COLUMNS = 12
MAX_WIDGETS = 20


class WidgetPosition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: int = Field(ge=0, le=GRID_COLUMNS - 1)
    y: int = Field(ge=0)
    w: int = Field(ge=1, le=GRID_COLUMNS)
    h: int = Field(ge=1)

    @model_validator(mode="after")
    def _check_within_grid(self) -> "WidgetPosition":
        if self.x + self.w > GRID_COLUMNS:
            raise ValueError(
                f"widget extends past column {GRID_COLUMNS}: x={self.x} + w={self.w}"
            )
        return self


class WidgetEntry(BaseModel):
    """One widget on the dashboard.

    `id` is a client-generated ULID. We don't enforce ULID format
    server-side because the client is the only writer; we just
    require it to be a non-empty string.
    """

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64)
    position: WidgetPosition
    config: WidgetConfig


class DateRangeFilter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    preset: Literal[
        "last_7_days",
        "last_30_days",
        "this_quarter",
        "this_year",
        "last_12_months",
        "custom",
    ] = "last_30_days"
    # Required only when preset == "custom"; checked in the model
    # validator below.
    from_: str | None = Field(default=None, alias="from")
    to: str | None = None

    @model_validator(mode="after")
    def _custom_requires_dates(self) -> "DateRangeFilter":
        if self.preset == "custom" and (self.from_ is None or self.to is None):
            raise ValueError(
                'preset="custom" requires both `from` and `to` ISO dates'
            )
        return self


class GlobalFilters(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date_range: DateRangeFilter = Field(
        default_factory=DateRangeFilter, alias="dateRange"
    )
    team_id: uuid.UUID | None = Field(default=None, alias="teamId")
    owner_user_id: uuid.UUID | None = Field(default=None, alias="ownerUserId")


class DashboardConfig(BaseModel):
    """The full persisted shape of `User.reports_dashboard_config`.

    Empty `{}` is valid input — the API treats it as "use the default
    layout" and returns the defaults instead.
    """

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    version: Literal[1] = 1
    widgets: list[WidgetEntry] = Field(default_factory=list)
    global_filters: GlobalFilters = Field(
        default_factory=GlobalFilters, alias="globalFilters"
    )

    @model_validator(mode="after")
    def _check_widgets(self) -> "DashboardConfig":
        if len(self.widgets) > MAX_WIDGETS:
            raise ValueError(
                f"too many widgets: {len(self.widgets)} > {MAX_WIDGETS} max"
            )
        # Reject overlapping positions. We treat each widget's footprint as
        # the rectangle [x, x+w) × [y, y+h) and check pairwise overlap.
        for i, a in enumerate(self.widgets):
            for b in self.widgets[i + 1 :]:
                if _rects_overlap(a.position, b.position):
                    raise ValueError(
                        "overlapping widget positions: "
                        f"widget id={a.id} and id={b.id}"
                    )
        # Reject duplicate widget IDs — they would break per-widget
        # mutations and the React keying contract.
        ids = [w.id for w in self.widgets]
        if len(set(ids)) != len(ids):
            raise ValueError("widget ids must be unique within a dashboard")
        return self


def _rects_overlap(a: WidgetPosition, b: WidgetPosition) -> bool:
    """Half-open rectangle overlap: [x, x+w) × [y, y+h)."""

    return (
        a.x < b.x + b.w
        and b.x < a.x + a.w
        and a.y < b.y + b.h
        and b.y < a.y + a.h
    )
