"""Per-widget config schemas + the `WidgetType` Literal.

Each widget config is its own `BaseModel` so the discriminated-union
approach in `DashboardConfig` (R0.3) gives Pydantic enough info to
parse user input into the correct shape. The `WidgetType` Literal is
the discriminator.
"""

from typing import Literal

from app.schemas.reports.widgets.avg_deal_size import AvgDealSizeConfig
from app.schemas.reports.widgets.companies_at_risk import CompaniesAtRiskConfig
from app.schemas.reports.widgets.deals_won import DealsWonConfig
from app.schemas.reports.widgets.lead_to_deal_conversion import (
    LeadToDealConversionConfig,
)
from app.schemas.reports.widgets.lost_reasons_breakdown import (
    LostReasonsBreakdownConfig,
)
from app.schemas.reports.widgets.new_companies import NewCompaniesConfig
from app.schemas.reports.widgets.pipeline_value import PipelineValueConfig
from app.schemas.reports.widgets.rep_activity import RepActivityConfig
from app.schemas.reports.widgets.sales_cycle_length import SalesCycleLengthConfig
from app.schemas.reports.widgets.sales_leaderboard import SalesLeaderboardConfig
from app.schemas.reports.widgets.stale_deals import StaleDealsConfig
from app.schemas.reports.widgets.win_rate import WinRateConfig

WidgetType = Literal[
    "pipeline_value",
    "new_companies",
    "deals_won",
    "win_rate",
    "avg_deal_size",
    "sales_cycle_length",
    "lead_to_deal_conversion",
    "lost_reasons_breakdown",
    "sales_leaderboard",
    "rep_activity",
    "stale_deals",
    "companies_at_risk",
]

__all__ = [
    "AvgDealSizeConfig",
    "CompaniesAtRiskConfig",
    "DealsWonConfig",
    "LeadToDealConversionConfig",
    "LostReasonsBreakdownConfig",
    "NewCompaniesConfig",
    "PipelineValueConfig",
    "RepActivityConfig",
    "SalesCycleLengthConfig",
    "SalesLeaderboardConfig",
    "StaleDealsConfig",
    "WidgetType",
    "WinRateConfig",
]
