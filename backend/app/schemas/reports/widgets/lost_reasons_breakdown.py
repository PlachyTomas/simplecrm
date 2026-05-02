from __future__ import annotations

from typing import Literal

from app.schemas.reports.widgets._base import WidgetConfigBase


class LostReasonsBreakdownConfig(WidgetConfigBase):
    """Horizontal bar chart of lost-deal reasons. Long tail collapses to Ostatní."""

    type: Literal["lost_reasons_breakdown"] = "lost_reasons_breakdown"
    display: Literal["count", "value"] = "count"
