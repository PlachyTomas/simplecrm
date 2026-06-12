from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import AwareDatetime, BaseModel, Field, model_validator

from app.db.models.enums import GoogleSyncStatus


class CalendarEventCreate(BaseModel):
    deal_id: uuid.UUID
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    location: str | None = Field(default=None, max_length=200)
    # AwareDatetime: naive timestamps are ambiguous (whose midnight?) and
    # would crash comparisons against the timestamptz columns.
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    # Mirror the event into the creator's Google Calendar. Requires a
    # connection; the endpoint 400s with `google_calendar_not_connected`.
    add_to_google: bool = False

    @model_validator(mode="after")
    def _ends_after_starts(self) -> CalendarEventCreate:
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


class CalendarEventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    location: str | None = Field(default=None, max_length=200)
    starts_at: AwareDatetime | None = None
    ends_at: AwareDatetime | None = None
    # None = keep current sync state; True/False = add/remove the Google copy.
    add_to_google: bool | None = None


class CalendarEventOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    deal_id: uuid.UUID
    # Denormalized so the calendar page can label chips without N+1 fetches.
    deal_name: str
    owner_user_id: uuid.UUID | None
    title: str
    description: str | None
    location: str | None
    starts_at: datetime
    ends_at: datetime
    google_event_id: str | None
    google_sync_status: GoogleSyncStatus
    created_at: datetime
    updated_at: datetime
