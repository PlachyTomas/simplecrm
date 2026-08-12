from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.db.models.enums import ActivityEntityType, ActivityType
from app.schemas.event_label import EventLabelBrief


class ActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    entity_type: ActivityEntityType
    entity_id: uuid.UUID
    user_id: uuid.UUID | None
    # Denormalized actor name so the timeline can render "Kdo" without a
    # per-row user fetch. Nullable: the acting user may have been deleted
    # (user_id SET NULL) or the event is system-generated.
    user_name: str | None = None
    activity_type: ActivityType
    payload: dict[str, Any]
    created_at: datetime
    # When it happened (user-settable on manual entries). `created_at` stays
    # the write stamp; timelines sort on this one.
    occurred_at: datetime
    # The kind chip, from the org's shared calendar-label vocabulary.
    label: EventLabelBrief | None = None
    # Computed per request: this row is a manual entry AND the caller either
    # wrote it or is an admin. Keeps the role rule out of the frontend.
    can_edit: bool = False


class ActivityUpdate(BaseModel):
    """Partial edit of a hand-logged activity.

    Omitting a field leaves it alone; sending an explicit `null` clears it.
    The two are told apart by `model_fields_set`, which is why every field
    defaults to `None` rather than to a sentinel. `occurred_at` is the one
    exception — the column is NOT NULL, so an explicit `null` there is a 422
    raised by the endpoint rather than a silent no-op.
    """

    model_config = ConfigDict(extra="forbid")

    label_id: uuid.UUID | None = None
    body: str | None = Field(default=None, max_length=2000)
    occurred_at: datetime | None = None

    @field_validator("body")
    @classmethod
    def _trim_body(cls, value: str | None) -> str | None:
        """Whitespace-only text clears the note — "   " is not a description."""
        if value is None:
            return None
        return value.strip() or None
