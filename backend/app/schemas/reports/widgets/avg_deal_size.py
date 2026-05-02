from __future__ import annotations

from typing import Literal

from app.schemas.reports.widgets._base import WidgetConfigBase


class AvgDealSizeConfig(WidgetConfigBase):
    """Mean Deal.value over a scoped subset of deals."""

    type: Literal["avg_deal_size"] = "avg_deal_size"
    scope: Literal["won", "open"] = "won"
