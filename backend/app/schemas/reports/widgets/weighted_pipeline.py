from __future__ import annotations

from typing import Literal

from app.schemas.reports.widgets._base import WidgetConfigBase


class WeightedPipelineConfig(WidgetConfigBase):
    """Open `Deal.value` × stage probability (or per-deal override) in range."""

    type: Literal["weighted_pipeline"] = "weighted_pipeline"
