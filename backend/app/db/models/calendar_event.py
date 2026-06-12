from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import GoogleSyncStatus

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
    deal_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("deals.id", ondelete="CASCADE"),
        nullable=False,
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
