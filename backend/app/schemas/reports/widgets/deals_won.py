from __future__ import annotations

from typing import Literal

from app.schemas.reports.widgets._base import WidgetConfigBase


class DealsWonConfig(WidgetConfigBase):
    """Count + total value of deals closed-won in the date range."""

    type: Literal["deals_won"] = "deals_won"
    display: Literal["count", "value", "both"] = "both"
