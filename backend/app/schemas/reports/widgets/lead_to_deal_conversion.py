from __future__ import annotations

from typing import Literal

from app.schemas.reports.widgets._base import WidgetConfigBase


class LeadToDealConversionConfig(WidgetConfigBase):
    """% of companies created in the range that got at least one deal."""

    type: Literal["lead_to_deal_conversion"] = "lead_to_deal_conversion"
    breakdown: Literal["none", "by_owner"] = "none"
