"""Shared base for widget config Pydantic models.

The discriminator field (`type`) lives on each subclass as a Literal,
which is what Pydantic v2 expects for `Field(discriminator='type')`
unions. Subclasses set their own `type` Literal and any widget-specific
fields. The empty common base keeps `extra='forbid'` consistent so
clients can't smuggle unknown keys into a config blob.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

DatePreset = Literal[
    "last_7_days",
    "last_30_days",
    "this_quarter",
    "this_year",
    "last_12_months",
]


class WidgetConfigBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Legacy per-widget date preset. Storage only — kept so configs saved
    # before the home dashboard's GLOBAL range picker still load; no UI
    # writes or reads it anymore (HomeDashboardConfig.date_preset wins).
    date_preset: DatePreset | None = None
