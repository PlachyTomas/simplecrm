from __future__ import annotations

from typing import Literal

from app.schemas.reports.widgets._base import WidgetConfigBase


class SalesLeaderboardConfig(WidgetConfigBase):
    """Bar chart of reps ranked by a configurable metric."""

    type: Literal["sales_leaderboard"] = "sales_leaderboard"
    metric: Literal["won_count", "won_value", "win_rate", "deals_added"] = "won_value"
