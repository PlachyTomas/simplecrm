from __future__ import annotations

from typing import Literal

from app.schemas.reports.widgets._base import WidgetConfigBase


class PipelineValueConfig(WidgetConfigBase):
    """Sum of open `Deal.value` in the date range. Optional grouping."""

    type: Literal["pipeline_value"] = "pipeline_value"
    group_by: Literal["none", "stage", "owner"] = "none"
