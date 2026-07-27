from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.organization import Organization
    from app.db.models.user import User


class EmailTemplate(Base):
    """A reusable subject/body pair shared by everyone in the organization.

    Org-shared config, not a personal preference: any member may pick a
    template when composing, but only admins/managers may add, edit or
    delete one (same gate as pipeline stages).

    `subject`/`body` carry the merge-field vocabulary from
    `app/services/merge_fields.py` — the substitution happens at send time,
    never on the stored row.
    """

    __tablename__ = "email_templates"
    __table_args__ = (
        # One name per org, so the picker never shows two identical labels.
        UniqueConstraint("organization_id", "name", name="uq_email_templates_org_name"),
        Index("ix_email_templates_organization_id", "organization_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Nullable + SET NULL: deleting the author keeps the org's template.
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    subject: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")

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
    creator: Mapped[User | None] = relationship(foreign_keys=[created_by_user_id])
