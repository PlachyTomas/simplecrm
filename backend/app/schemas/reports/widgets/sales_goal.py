from __future__ import annotations

from typing import Literal

from app.schemas.reports.widgets._base import WidgetConfigBase


class SalesGoalConfig(WidgetConfigBase):
    """This month's progress toward a sales goal.

    Always the *current* month — a goal is a monthly commitment, so the
    dashboard's global date filter deliberately doesn't apply. `scope` picks
    which goal the tile follows: the viewer's own, or the org-wide one.
    """

    type: Literal["sales_goal"] = "sales_goal"
    scope: Literal["mine", "organization"] = "mine"
    metric: Literal["won_value", "won_count"] = "won_value"
