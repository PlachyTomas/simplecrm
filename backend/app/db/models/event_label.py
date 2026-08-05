from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    Table,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.organization import Organization

# Join table for the many-to-many between calendar events and labels. A plain
# Core table (no extra payload columns), so the association carries nothing
# beyond the pair itself. Both sides CASCADE: deleting an event or a label
# drops the links, never the counterpart row.
calendar_event_labels = Table(
    "calendar_event_labels",
    Base.metadata,
    Column(
        "event_id",
        PgUUID(as_uuid=True),
        ForeignKey("calendar_events.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "label_id",
        PgUUID(as_uuid=True),
        ForeignKey("event_labels.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    # The composite PK already indexes (event_id, label_id); the reverse
    # lookup ("how many events use this label?") needs its own index.
    Index("ix_calendar_event_labels_label_id", "label_id"),
)


class EventLabel(Base):
    """An org-shared, colored tag for calendar events (call / meeting / …).

    Org vocabulary rather than a personal preference: everyone in the org
    picks from the same list, any member may add one inline from the event
    form, and only admins may rename, recolor or delete. Three defaults are
    seeded per org (`services/event_labels.create_default_event_labels`) —
    ordinary rows with no "is_default" flag, so they can be renamed or
    deleted like any other.

    Colors come from a fixed 8-hex palette validated at the API edge
    (`schemas/event_label.EVENT_LABEL_COLORS`); the column mirrors
    `stages.color` (String(9), so `#RRGGBBAA` would still fit).
    """

    __tablename__ = "event_labels"
    __table_args__ = (
        Index("ix_event_labels_organization_id", "organization_id"),
        # Case-insensitive uniqueness per org: "Hovor" and "hovor" are the
        # same label, so the picker can never show two rows that read alike.
        Index(
            "uq_event_labels_org_name_lower",
            "organization_id",
            text("lower(name)"),
            unique=True,
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(String(50), nullable=False)
    color: Mapped[str] = mapped_column(String(9), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    organization: Mapped[Organization] = relationship()
