from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.organization import Organization
    from app.db.models.user import User

OWNERSHIP_WINDOW = timedelta(days=365)


def _default_ownership_expires_at() -> datetime:
    return datetime.now(tz=UTC) + OWNERSHIP_WINDOW


class Company(Base):
    __tablename__ = "companies"
    __table_args__ = (
        UniqueConstraint("organization_id", "ico", name="uq_companies_org_ico"),
        Index("ix_companies_organization_id", "organization_id"),
        Index("ix_companies_owner_user_id", "owner_user_id"),
        Index("ix_companies_ownership_expires_at", "ownership_expires_at"),
        Index("ix_companies_ico", "ico"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)

    ico: Mapped[str | None] = mapped_column(String(8))
    dic: Mapped[str | None] = mapped_column(String(16))
    address_street: Mapped[str | None] = mapped_column(String(200))
    address_city: Mapped[str | None] = mapped_column(String(120))
    address_zip: Mapped[str | None] = mapped_column(String(12))
    legal_form: Mapped[str | None] = mapped_column(String(120))
    registered_on: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    website: Mapped[str | None] = mapped_column(String(300))
    note: Mapped[str | None] = mapped_column(String(2000))

    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )

    last_order_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Derived from created_at or last_order_at + 365 days, but stored as a
    # plain column and maintained by application code. Postgres's stored
    # generated columns require immutable expressions, which rules out
    # `interval` literals in 16.x. Keeping the value in a column gives the
    # freeing job an indexed WHERE target without a generated-expression dance.
    ownership_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_default_ownership_expires_at,
        nullable=False,
    )

    ares_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

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
    owner: Mapped[User | None] = relationship(foreign_keys=[owner_user_id])
