from __future__ import annotations

from typing import Literal

from app.schemas.reports.widgets._base import WidgetConfigBase


class NewCompaniesConfig(WidgetConfigBase):
    """Count of `Company` rows created in the date range."""

    type: Literal["new_companies"] = "new_companies"
    breakdown: Literal["none", "by_owner"] = "none"
