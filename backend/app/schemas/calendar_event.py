from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, Field, model_validator

from app.db.models.enums import GoogleSyncStatus
from app.schemas.event_label import EventLabelBrief


class EventReminder(BaseModel):
    method: Literal["popup", "email"] = "popup"
    # Google Calendar's own bound: up to 4 weeks before the event.
    minutes: int = Field(ge=0, le=40320)


class AttendeeBrief(BaseModel):
    id: uuid.UUID  # the contact/user id, not the join-row id
    kind: Literal["contact", "user"]
    name: str
    email: str | None


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
    # Org-shared labels to attach. Ids outside the caller's org (or unknown)
    # are a 400, same as `deal_id`. CRM-only — never pushed to Google.
    label_ids: list[uuid.UUID] = Field(default_factory=list)
    all_day: bool = False
    reminders: list[EventReminder] = Field(default_factory=list, max_length=5)
    meet_requested: bool = False
    attendee_contact_ids: list[uuid.UUID] = Field(default_factory=list)
    attendee_user_ids: list[uuid.UUID] = Field(default_factory=list)

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
    # Tri-state on `exclude_unset` like `deal_id`: absent = labels unchanged,
    # `[]` = clear them all, a list = replace the set with exactly those.
    label_ids: list[uuid.UUID] | None = None
    all_day: bool | None = None
    reminders: list[EventReminder] | None = Field(default=None, max_length=5)
    meet_requested: bool | None = None
    # Tri-state on `exclude_unset` like `label_ids`: absent = attendees
    # unchanged, `[]` = clear them all, a list = replace with exactly those.
    attendee_contact_ids: list[uuid.UUID] | None = None
    attendee_user_ids: list[uuid.UUID] | None = None


class CalendarEventOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    deal_id: uuid.UUID | None
    # Denormalized so the calendar page can label chips without N+1 fetches.
    # None for an event that isn't attached to a deal.
    deal_name: str | None
    # The deal's company, derived — events have no company FK of their own,
    # so both are None whenever `deal_id` is None.
    company_id: uuid.UUID | None = None
    company_name: str | None = None
    owner_user_id: uuid.UUID | None
    title: str
    description: str | None
    location: str | None
    starts_at: datetime
    ends_at: datetime
    all_day: bool
    reminders: list[EventReminder] = Field(default_factory=list)
    google_event_id: str | None
    google_sync_status: GoogleSyncStatus
    # Google's `hangoutLink`, captured on a successful insert — None until
    # (and unless) the event was pushed with `meet_requested`.
    meet_url: str | None
    # Name-ordered so the first entry is a stable choice for the chip tint.
    labels: list[EventLabelBrief] = Field(default_factory=list)
    attendees: list[AttendeeBrief] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
