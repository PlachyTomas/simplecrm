from __future__ import annotations

from typing import Literal

from app.schemas.reports.widgets._base import WidgetConfigBase


class CompaniesAtRiskConfig(WidgetConfigBase):
    """Companies whose `ownership_expires_at` is within `threshold` days."""

    type: Literal["companies_at_risk"] = "companies_at_risk"
    threshold: Literal[30, 14, 7] = 30
