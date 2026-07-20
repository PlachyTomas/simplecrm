from __future__ import annotations

from typing import Literal

from app.schemas.reports.widgets._base import WidgetConfigBase


class WonVsPaidConfig(WidgetConfigBase):
    """Paid vs. unpaid split of deals won in the date range."""

    type: Literal["won_vs_paid"] = "won_vs_paid"
