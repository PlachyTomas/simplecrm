from __future__ import annotations

from typing import Literal

from app.schemas.reports.widgets._base import WidgetConfigBase


class WinRateConfig(WidgetConfigBase):
    """won_count / (won_count + lost_count) × 100. No tunable knobs."""

    type: Literal["win_rate"] = "win_rate"
