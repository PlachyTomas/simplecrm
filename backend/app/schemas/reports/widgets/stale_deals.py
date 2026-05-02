from __future__ import annotations

from typing import Literal

from app.schemas.reports.widgets._base import WidgetConfigBase


class StaleDealsConfig(WidgetConfigBase):
    """Open deals whose stage hasn't moved for at least `threshold` days."""

    type: Literal["stale_deals"] = "stale_deals"
    threshold: Literal[30, 60, 90] = 60
