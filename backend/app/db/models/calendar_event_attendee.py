from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.contact import Contact
    from app.db.models.user import User


class CalendarEventAttendee(Base):
    """One attendee row per event participant — a contact or a teammate.

    No email/name snapshots: values join live from the contact/user row, so
    deleting either cascades the attendee away and erasure has nothing extra
    to scrub. Google payloads skip attendees whose row has no email.
    """

    __tablename__ = "calendar_event_attendees"
    __table_args__ = (
        CheckConstraint(
            "(contact_id IS NULL) != (user_id IS NULL)",
            name="ck_calendar_event_attendees_one_subject",
        ),
        UniqueConstraint("event_id", "contact_id", name="uq_event_attendee_contact"),
        UniqueConstraint("event_id", "user_id", name="uq_event_attendee_user"),
        Index("ix_calendar_event_attendees_event_id", "event_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("calendar_events.id", ondelete="CASCADE"),
        nullable=False,
    )
    contact_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE")
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )

    contact: Mapped[Contact | None] = relationship()
    user: Mapped[User | None] = relationship()
