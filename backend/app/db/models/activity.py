from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, Enum, ForeignKey, Index, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import ActivityEntityType, ActivityType

if TYPE_CHECKING:
    from app.db.models.event_label import EventLabel
    from app.db.models.organization import Organization
    from app.db.models.user import User


class Activity(Base):
    """Polymorphic audit log for user-visible events.

    `entity_type` + `entity_id` identify the subject. No FK is declared on
    `entity_id` because the polymorphic link fans out to three different
    tables; the service layer validates the pair on insert.
    """

    __tablename__ = "activities"
    __table_args__ = (
        Index("ix_activities_entity", "entity_type", "entity_id"),
        Index("ix_activities_created_at", "created_at"),
        Index("ix_activities_organization_id", "organization_id"),
        Index("ix_activities_user_id", "user_id"),
        Index("ix_activities_company_id", "company_id"),
        Index("ix_activities_entity_occurred", "entity_type", "entity_id", "occurred_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )

    entity_type: Mapped[ActivityEntityType] = mapped_column(
        Enum(ActivityEntityType, name="activity_entity_type"),
        nullable=False,
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)

    # Denormalized parent-company link so the company timeline can surface
    # everything about a company AND its deals/events/emails in one query.
    # Nullable: org-level activities (subscription_change) have no company.
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="SET NULL"),
    )

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )

    activity_type: Mapped[ActivityType] = mapped_column(
        Enum(ActivityType, name="activity_type"),
        nullable=False,
    )
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    # When the thing happened, as opposed to when the row was written.
    # User-settable for manual entries; equal to `created_at` for everything
    # the system logs. Timelines order by this so a backdated entry lands in
    # the right place. Keeps a server default — see migration a4b5c6d7e8f9.
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # The action's kind, drawn from the org-shared calendar-label vocabulary
    # so "Hovor" means the same thing on a timeline and in the calendar.
    # NULL for every automatic row and for unlabelled manual ones; a deleted
    # label leaves the entry intact (SET NULL).
    label_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("event_labels.id", ondelete="SET NULL"),
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    organization: Mapped[Organization] = relationship()
    user: Mapped[User | None] = relationship()
    label: Mapped[EventLabel | None] = relationship()
