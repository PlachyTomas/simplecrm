"""Reports / configurable widget dashboard schemas.

Per-widget config schemas live under `widgets/`; `DashboardConfig`
glues them into a discriminated union with overlap/bounds/max-widgets
validation.
"""

# Legacy report schemas (kpi-summary / leaderboard / loss-reasons /
# pipeline-velocity / team-leaderboard / my-summary). Kept in-tree so
# the salesperson dashboard and existing tests stay green; the new
# widget endpoints (R2+) live alongside under widgets/.
from app.schemas.reports.legacy import (
    KpiSummary,
    Leaderboard,
    LeaderboardRow,
    LossReasonRow,
    LossReasons,
    MySummary,
    TeamLeaderboard,
    TeamLeaderboardRow,
    TeamMetric,
    Velocity,
    VelocityByStage,
)

from app.schemas.reports.dashboard import (
    GRID_COLUMNS,
    MAX_WIDGETS,
    DashboardConfig,
    DateRangeFilter,
    GlobalFilters,
    WidgetConfig,
    WidgetEntry,
    WidgetPosition,
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
    SalesLeaderboardConfig,
    StaleDealsConfig,
    WidgetType,
    WinRateConfig,
)

__all__ = [
    "AvgDealSizeConfig",
    "CompaniesAtRiskConfig",
    "DashboardConfig",
    "DateRangeFilter",
    "DealsWonConfig",
    "GRID_COLUMNS",
    "GlobalFilters",
    "KpiSummary",
    "Leaderboard",
    "LeaderboardRow",
    "LeadToDealConversionConfig",
    "LossReasonRow",
    "LossReasons",
    "LostReasonsBreakdownConfig",
    "MAX_WIDGETS",
    "MySummary",
    "NewCompaniesConfig",
    "PipelineValueConfig",
    "RepActivityConfig",
    "SalesCycleLengthConfig",
    "SalesLeaderboardConfig",
    "StaleDealsConfig",
    "TeamLeaderboard",
    "TeamLeaderboardRow",
    "TeamMetric",
    "Velocity",
    "VelocityByStage",
    "WidgetConfig",
    "WidgetEntry",
    "WidgetPosition",
    "WidgetType",
    "WinRateConfig",
]
