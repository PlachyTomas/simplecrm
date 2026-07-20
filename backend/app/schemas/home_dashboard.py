"""HomeDashboardConfig — the user's persisted editable home dashboard.

Mirrors `app.schemas.reports.dashboard.DashboardConfig`, sharing its grid
primitives (`WidgetPosition`, the overlap check, the 12-col / 20-widget
caps). The home catalog is the 12 report widget configs plus 10 home-only
configs (4 KPI tiles, 4 quick actions, invite card, velocity), unioned on
the `type` discriminator.

Validation rules (spec §2):
- Reject unknown widget types (discriminated union).
- Reject invalid config values (per-widget Literal fields).
- Reject overlapping positions on the 12-col grid.
- Reject more than 20 widgets.
- Reject invalid grid positions (`x + w > 12`, negatives, `h < 1`).
- `extra="forbid"` everywhere.
- `mobileOrder` ids must be a subset of the widget ids, with no
  duplicates (unknown or repeated id → 422).
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.reports.dashboard import (
    GRID_COLUMNS,
    MAX_WIDGETS,
    WidgetPosition,
    _rects_overlap,  # shared half-open-rectangle overlap check
)
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
    SalesForecastConfig,
    SalesLeaderboardConfig,
    StaleDealsConfig,
    WeightedPipelineConfig,
    WinRateConfig,
    WonVsPaidConfig,
)
from app.schemas.reports.widgets._base import WidgetConfigBase

# ---------------------------------------------------------------------------
# Home-only widget configs. No extra fields (they inherit the optional
# `date_preset` from WidgetConfigBase); the `type` Literal is the
# discriminator.
# ---------------------------------------------------------------------------


class KpiOpenDealsConfig(WidgetConfigBase):
    type: Literal["kpi_open_deals"] = "kpi_open_deals"


class KpiPipelineValueConfig(WidgetConfigBase):
    type: Literal["kpi_pipeline_value"] = "kpi_pipeline_value"


class KpiWonMonthConfig(WidgetConfigBase):
    type: Literal["kpi_won_month"] = "kpi_won_month"


class KpiRevenueMonthConfig(WidgetConfigBase):
    type: Literal["kpi_revenue_month"] = "kpi_revenue_month"


class ActionNewDealConfig(WidgetConfigBase):
    type: Literal["action_new_deal"] = "action_new_deal"


class ActionNewCompanyConfig(WidgetConfigBase):
    type: Literal["action_new_company"] = "action_new_company"


class ActionNewContactConfig(WidgetConfigBase):
    type: Literal["action_new_contact"] = "action_new_contact"


class ActionNewActivityConfig(WidgetConfigBase):
    type: Literal["action_new_activity"] = "action_new_activity"


class InviteTeammatesConfig(WidgetConfigBase):
    type: Literal["invite_teammates"] = "invite_teammates"


class VelocityConfig(WidgetConfigBase):
    type: Literal["velocity"] = "velocity"


# Discriminated union: the 12 report configs + the 10 home-only configs.
# Pydantic picks the right subclass off `type`; unknown types fail
# validation instead of silently coercing.
HomeWidgetConfig = Annotated[
    PipelineValueConfig
    | WeightedPipelineConfig
    | NewCompaniesConfig
    | DealsWonConfig
    | WonVsPaidConfig
    | SalesForecastConfig
    | WinRateConfig
    | AvgDealSizeConfig
    | SalesCycleLengthConfig
    | LeadToDealConversionConfig
    | LostReasonsBreakdownConfig
    | SalesLeaderboardConfig
    | RepActivityConfig
    | StaleDealsConfig
    | CompaniesAtRiskConfig
    | KpiOpenDealsConfig
    | KpiPipelineValueConfig
    | KpiWonMonthConfig
    | KpiRevenueMonthConfig
    | ActionNewDealConfig
    | ActionNewCompanyConfig
    | ActionNewContactConfig
    | ActionNewActivityConfig
    | InviteTeammatesConfig
    | VelocityConfig,
    Field(discriminator="type"),
]


class HomeWidgetEntry(BaseModel):
    """One widget on the home dashboard.

    `id` is a client-generated ULID for user-saved layouts and a stable
    `default_<type>` placeholder for the server-computed default. We only
    require a non-empty string ≤64 chars — the client is the sole writer.
    """

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64)
    position: WidgetPosition
    config: HomeWidgetConfig


class HomeDashboardConfig(BaseModel):
    """The full persisted shape of `User.home_dashboard_config`.

    Empty `{}` is valid input — the API treats it as "use the role-aware
    default layout" and returns the defaults instead.
    """

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    version: Literal[1] = 1
    widgets: list[HomeWidgetEntry] = Field(default_factory=list)
    # Mobile stack order — a list of widget ids. Desktop uses (y, x); the
    # mobile view reorders independently without touching positions.
    mobile_order: list[str] = Field(default_factory=list, alias="mobileOrder")

    @model_validator(mode="after")
    def _check_widgets(self) -> HomeDashboardConfig:
        if len(self.widgets) > MAX_WIDGETS:
            raise ValueError(f"too many widgets: {len(self.widgets)} > {MAX_WIDGETS} max")
        # Reject overlapping positions. Each footprint is the rectangle
        # [x, x+w) × [y, y+h); check pairwise overlap.
        for i, a in enumerate(self.widgets):
            for b in self.widgets[i + 1 :]:
                if _rects_overlap(a.position, b.position):
                    raise ValueError(
                        f"overlapping widget positions: widget id={a.id} and id={b.id}"
                    )
        # Reject duplicate widget ids — they break per-widget mutations and
        # the React keying contract.
        ids = [w.id for w in self.widgets]
        if len(set(ids)) != len(ids):
            raise ValueError("widget ids must be unique within a dashboard")
        # mobileOrder: no duplicates, and every id must reference a widget.
        if len(set(self.mobile_order)) != len(self.mobile_order):
            raise ValueError("mobileOrder must not contain duplicate ids")
        id_set = set(ids)
        for mid in self.mobile_order:
            if mid not in id_set:
                raise ValueError(f"mobileOrder references unknown widget id={mid}")
        return self


__all__ = [
    "GRID_COLUMNS",
    "MAX_WIDGETS",
    "ActionNewActivityConfig",
    "ActionNewCompanyConfig",
    "ActionNewContactConfig",
    "ActionNewDealConfig",
    "HomeDashboardConfig",
    "HomeWidgetConfig",
    "HomeWidgetEntry",
    "InviteTeammatesConfig",
    "KpiOpenDealsConfig",
    "KpiPipelineValueConfig",
    "KpiRevenueMonthConfig",
    "KpiWonMonthConfig",
    "VelocityConfig",
    "WidgetPosition",
]
