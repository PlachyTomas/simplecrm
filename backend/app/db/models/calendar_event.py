from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.calendar_event_attendee import CalendarEventAttendee
from app.db.models.enums import GoogleSyncStatus
from app.db.models.event_label import EventLabel, calendar_event_labels

if TYPE_CHECKING:
    from app.db.models.deal import Deal
    from app.db.models.organization import Organization
    from app.db.models.user import User


class CalendarEvent(Base):
    """A scheduled event attached to a deal (meeting, call, demo, …).

    Local-first: this row is the source of truth. When the owner opted in,
    a copy lives in their Google Calendar — `google_event_id` links the two
    so edits/deletes propagate. Deleting the deal cascades its events.
    """

    __tablename__ = "calendar_events"
    __table_args__ = (
        CheckConstraint("ends_at > starts_at", name="ck_calendar_events_ends_after_starts"),
        Index("ix_calendar_events_organization_id", "organization_id"),
        Index("ix_calendar_events_deal_id", "deal_id"),
        Index("ix_calendar_events_owner_user_id", "owner_user_id"),
        Index("ix_calendar_events_starts_at", "starts_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Nullable: not every meeting starts life attached to a deal. A user can
    # block out a call first and link the deal once they know which one it is.
    deal_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("deals.id", ondelete="CASCADE"),
    )
    # The creator — whose Google Calendar the event mirrors into. SET NULL
    # keeps the event on the org calendar when the user is removed.
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(200))

    all_day: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # [{"method": "popup"|"email", "minutes": int}] — max 5, enforced in the
    # schema layer; Google fires these, the CRM has no notifier of its own.
    reminders: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    meet_requested: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    meet_url: Mapped[str | None] = mapped_column(String(1024))

    # Stored UTC; the frontend renders in the browser's zone and Google
    # renders in the viewer's calendar zone.
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    google_event_id: Mapped[str | None] = mapped_column(String(1024))
    google_sync_status: Mapped[GoogleSyncStatus] = mapped_column(
        Enum(GoogleSyncStatus, name="google_sync_status"),
        nullable=False,
        default=GoogleSyncStatus.not_synced,
        server_default="not_synced",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    organization: Mapped[Organization] = relationship()
    deal: Mapped[Deal] = relationship()
    owner: Mapped[User | None] = relationship()
    # CRM-only: labels are never pushed into the Google payload. Lazy by
    # default like the rest of this model — every read path in
    # `api/v1/events.py` eager-loads them (`selectinload`) because an async
    # lazy-load after a commit raises MissingGreenlet.
    labels: Mapped[list[EventLabel]] = relationship(
        secondary=calendar_event_labels,
        order_by=EventLabel.name,
    )
    attendees: Mapped[list[CalendarEventAttendee]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True
    )
