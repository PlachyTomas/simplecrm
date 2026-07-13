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


class WidgetConfigBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Optional per-widget date preset. Used by the home dashboard, where
    # each widget carries its own range (there's no global filter bar).
    # Storage only — no endpoint logic reads it; the client resolves the
    # preset to a concrete from/to. The Reports page ignores it (its
    # global filter bar wins). None → client treats as `last_30_days`.
    date_preset: (
        Literal[
            "last_7_days",
            "last_30_days",
            "this_quarter",
            "this_year",
            "last_12_months",
        ]
        | None
    ) = None
