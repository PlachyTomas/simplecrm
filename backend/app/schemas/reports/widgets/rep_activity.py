from __future__ import annotations

from typing import Literal

from app.schemas.reports.widgets._base import WidgetConfigBase


class RepActivityConfig(WidgetConfigBase):
    """Pipeline-starvation early-warning: new deals added per rep."""

    type: Literal["rep_activity"] = "rep_activity"
