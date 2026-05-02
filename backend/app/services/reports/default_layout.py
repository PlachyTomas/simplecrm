"""The default 8-widget layout for first-time visitors.

REPORTS_TASK §6.3 specifies the exact starter set. We return it as a
`DashboardConfig` instance so the API can ship it (with by_alias=True)
to the frontend and the frontend can render with no extra mapping.

Widget IDs are generated client-side as ULIDs once the user makes a
modification — until then the API can return stable placeholder IDs
(`default_<n>`) so the React keying and the stale-entry detection
during edit mode behave consistently.
"""

from __future__ import annotations

from app.schemas.reports import (
    CompaniesAtRiskConfig,
    DashboardConfig,
    DealsWonConfig,
    LostReasonsBreakdownConfig,
    PipelineValueConfig,
    SalesLeaderboardConfig,
    StaleDealsConfig,
    WidgetEntry,
    WidgetPosition,
    WinRateConfig,
)
from app.schemas.reports.widgets import AvgDealSizeConfig


def default_dashboard_config() -> DashboardConfig:
    return DashboardConfig.model_validate(
        {
            "version": 1,
            "widgets": [
                WidgetEntry(
                    id="default_pipeline_value",
                    position=WidgetPosition(x=0, y=0, w=3, h=2),
                    config=PipelineValueConfig(),
                ),
                WidgetEntry(
                    id="default_deals_won",
                    position=WidgetPosition(x=3, y=0, w=3, h=2),
                    config=DealsWonConfig(),
                ),
                WidgetEntry(
                    id="default_win_rate",
                    position=WidgetPosition(x=6, y=0, w=3, h=2),
                    config=WinRateConfig(),
                ),
                WidgetEntry(
                    id="default_avg_deal_size",
                    position=WidgetPosition(x=9, y=0, w=3, h=2),
                    config=AvgDealSizeConfig(),
                ),
                WidgetEntry(
                    id="default_sales_leaderboard",
                    position=WidgetPosition(x=0, y=2, w=6, h=4),
                    config=SalesLeaderboardConfig(),
                ),
                WidgetEntry(
                    id="default_lost_reasons_breakdown",
                    position=WidgetPosition(x=6, y=2, w=6, h=4),
                    config=LostReasonsBreakdownConfig(),
                ),
                WidgetEntry(
                    id="default_stale_deals",
                    position=WidgetPosition(x=0, y=6, w=6, h=4),
                    config=StaleDealsConfig(),
                ),
                WidgetEntry(
                    id="default_companies_at_risk",
                    position=WidgetPosition(x=6, y=6, w=6, h=4),
                    config=CompaniesAtRiskConfig(),
                ),
            ],
        }
    )
