from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import BlockedCompanyReason

if TYPE_CHECKING:
    from app.db.models.organization import Organization
    from app.db.models.user import User


class BlockedCompany(Base):
    """An IČO an org admin doesn't want any salesperson to claim.

    Enforced at company-create time: `POST /companies` checks the
    target IČO against this table for the caller's org and rejects
    with 409 ICO_BLOCKED. `ares_name` is a courtesy snapshot so the
    admin list shows a recognisable company name without doing a
    second ARES lookup; we don't refresh it.
    """

    __tablename__ = "blocked_companies"
    __table_args__ = (
        UniqueConstraint("organization_id", "ico", name="uq_blocked_companies_org_ico"),
        Index("ix_blocked_companies_organization_id", "organization_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )

    ico: Mapped[str] = mapped_column(String(8), nullable=False)
    reason_category: Mapped[BlockedCompanyReason] = mapped_column(
        Enum(BlockedCompanyReason, name="blocked_company_reason"),
        nullable=False,
    )
    note: Mapped[str | None] = mapped_column(String(500))

    # Resolved name from ARES at add-time. Optional because the admin
    # may add a row whose IČO ARES doesn't know about; not refreshed
    # after the initial save.
    ares_name: Mapped[str | None] = mapped_column(String(200))

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    organization: Mapped[Organization] = relationship()
    creator: Mapped[User | None] = relationship(foreign_keys=[created_by])
