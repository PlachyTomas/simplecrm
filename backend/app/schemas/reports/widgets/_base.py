"""Shared base for widget config Pydantic models.

The discriminator field (`type`) lives on each subclass as a Literal,
which is what Pydantic v2 expects for `Field(discriminator='type')`
unions. Subclasses set their own `type` Literal and any widget-specific
fields. The empty common base keeps `extra='forbid'` consistent so
clients can't smuggle unknown keys into a config blob.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class WidgetConfigBase(BaseModel):
    model_config = ConfigDict(extra="forbid")
