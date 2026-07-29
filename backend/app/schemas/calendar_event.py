from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import AwareDatetime, BaseModel, Field, model_validator

from app.db.models.enums import GoogleSyncStatus


class CalendarEventCreate(BaseModel):
    # Optional: an event can be booked before anyone knows which deal it
    # belongs to, and linked afterwards via CalendarEventUpdate.
    deal_id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    location: str | None = Field(default=None, max_length=200)
    # AwareDatetime: naive timestamps are ambiguous (whose midnight?) and
    # would crash comparisons against the timestamptz columns.
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    # Mirror the event into the creator's Google Calendar. When no usable
    # connection exists (missing or `sync_broken`), the CRM event is still
    # saved but lands with `google_sync_status=error` — the write never 400s.
    add_to_google: bool = False

    @model_validator(mode="after")
    def _ends_after_starts(self) -> CalendarEventCreate:
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


class CalendarEventUpdate(BaseModel):
    # Tri-state, and `exclude_unset` is what tells the cases apart: absent =
    # leave the link alone, a UUID = attach/move, explicit null = detach.
    deal_id: uuid.UUID | None = None
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
    deal_id: uuid.UUID | None
    # Denormalized so the calendar page can label chips without N+1 fetches.
    # None for an event that isn't attached to a deal.
    deal_name: str | None
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
