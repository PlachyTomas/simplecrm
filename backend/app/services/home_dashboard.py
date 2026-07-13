"""The role-aware default layout for the editable home dashboard.

Computed per-user at GET time (spec §2). Unlike the reports default, the
home default depends on the caller: the invite card only appears for
admins / users who `can_invite`, and the team analytics (leaderboard +
velocity) only for admins/managers or when the org opted salespeople into
leaderboard visibility.

Widget ids are stable `default_<type>` placeholders until the user saves a
real (ULID-keyed) layout, so React keying and stale-entry detection during
edit mode stay consistent. `mobileOrder` mirrors the desktop insertion
order.
"""

from __future__ import annotations

from app.db.models import Organization, User
from app.db.models.enums import UserRole
from app.schemas.home_dashboard import (
    ActionNewDealConfig,
    HomeDashboardConfig,
    HomeWidgetEntry,
    InviteTeammatesConfig,
    KpiOpenDealsConfig,
    KpiPipelineValueConfig,
    KpiRevenueMonthConfig,
    KpiWonMonthConfig,
    VelocityConfig,
    WidgetPosition,
)
from app.schemas.reports.widgets import SalesLeaderboardConfig


def default_home_dashboard_config(
    user: User, organization: Organization | None
) -> HomeDashboardConfig:
    widgets: list[HomeWidgetEntry] = [
        # First row: the 4 KPI tiles (w=3, h=2 each, y=0).
        HomeWidgetEntry(
            id="default_kpi_open_deals",
            position=WidgetPosition(x=0, y=0, w=3, h=2),
            config=KpiOpenDealsConfig(),
        ),
        HomeWidgetEntry(
            id="default_kpi_pipeline_value",
            position=WidgetPosition(x=3, y=0, w=3, h=2),
            config=KpiPipelineValueConfig(),
        ),
        HomeWidgetEntry(
            id="default_kpi_won_month",
            position=WidgetPosition(x=6, y=0, w=3, h=2),
            config=KpiWonMonthConfig(),
        ),
        HomeWidgetEntry(
            id="default_kpi_revenue_month",
            position=WidgetPosition(x=9, y=0, w=3, h=2),
            config=KpiRevenueMonthConfig(),
        ),
        # Next row: the new-deal quick action (w=3, h=1, y=2).
        HomeWidgetEntry(
            id="default_action_new_deal",
            position=WidgetPosition(x=0, y=2, w=3, h=1),
            config=ActionNewDealConfig(),
        ),
    ]
    y = 3

    # Invite card — only for admins or users with `can_invite`.
    if user.role is UserRole.admin or user.can_invite:
        widgets.append(
            HomeWidgetEntry(
                id="default_invite_teammates",
                position=WidgetPosition(x=0, y=y, w=12, h=3),
                config=InviteTeammatesConfig(),
            )
        )
        y += 3

    # Team analytics (leaderboard + velocity) — only for admins/managers or
    # when the org opted salespeople into leaderboard visibility.
    org_shows_leaderboard = bool(
        organization is not None and organization.show_leaderboard_to_salespeople
    )
    if user.role in (UserRole.admin, UserRole.manager) or org_shows_leaderboard:
        widgets.append(
            HomeWidgetEntry(
                id="default_sales_leaderboard",
                position=WidgetPosition(x=0, y=y, w=6, h=4),
                config=SalesLeaderboardConfig(),
            )
        )
        widgets.append(
            HomeWidgetEntry(
                id="default_velocity",
                position=WidgetPosition(x=6, y=y, w=6, h=4),
                config=VelocityConfig(),
            )
        )

    return HomeDashboardConfig(
        version=1,
        widgets=widgets,
        mobile_order=[w.id for w in widgets],
    )
