from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.company import Company
    from app.db.models.organization import Organization


class Contact(Base):
    __tablename__ = "contacts"
    __table_args__ = (
        # A contact's email is unique within an organization — two orgs can
        # each have their own row for the same person without colliding.
        UniqueConstraint("organization_id", "email", name="uq_contacts_org_email"),
        Index("ix_contacts_organization_id", "organization_id"),
        Index("ix_contacts_company_id", "company_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="SET NULL"),
    )

    first_name: Mapped[str] = mapped_column(String(120), nullable=False)
    last_name: Mapped[str] = mapped_column(String(120), nullable=False)
    position: Mapped[str | None] = mapped_column(String(160))
    email: Mapped[str | None] = mapped_column(String(320))
    phone: Mapped[str | None] = mapped_column(String(40))
    linkedin_url: Mapped[str | None] = mapped_column(String(300))
    note: Mapped[str | None] = mapped_column(String(2000))

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
    # Disambiguate from `Company.main_contact_id` (the reverse-direction FK
    # pointing at this table). Without `foreign_keys=`, SQLAlchemy can't
    # pick which column joins Contact -> Company.
    company: Mapped[Company | None] = relationship(foreign_keys=[company_id])
