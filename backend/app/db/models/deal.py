from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.company import Company
    from app.db.models.contact import Contact
    from app.db.models.organization import Organization
    from app.db.models.stage import Stage
    from app.db.models.user import User


class Deal(Base):
    __tablename__ = "deals"
    __table_args__ = (
        CheckConstraint(
            "probability_override IS NULL OR "
            "(probability_override >= 0 AND probability_override <= 100)",
            name="ck_deals_probability_override",
        ),
        Index("ix_deals_organization_id", "organization_id"),
        Index("ix_deals_company_id", "company_id"),
        Index("ix_deals_stage_id", "stage_id"),
        Index("ix_deals_owner_user_id", "owner_user_id"),
        Index("ix_deals_expected_close_date", "expected_close_date"),
        Index("ix_deals_is_paid_paid_at", "is_paid", "paid_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    primary_contact_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("contacts.id", ondelete="SET NULL"),
    )
    stage_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("stages.id", ondelete="RESTRICT"),
        nullable=False,
    )
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Decimal for money; pair with `currency` (never embed the currency in the
    # column name per Section 7 of the brief).
    value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="CZK")

    probability_override: Mapped[int | None] = mapped_column()

    expected_close_date: Mapped[date | None] = mapped_column(Date)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lost_reason: Mapped[str | None] = mapped_column(String(200))

    # `is_paid` only carries meaning while the deal sits in a won stage —
    # the UI surfaces the checkbox there only. The board endpoint reads it
    # to sink paid deals to the bottom of the won column. `paid_at` is
    # stamped from server `now()` when is_paid flips true, cleared when it
    # flips back; never trusted from the client.
    is_paid: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

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
    company: Mapped[Company] = relationship()
    primary_contact: Mapped[Contact | None] = relationship()
    stage: Mapped[Stage] = relationship()
    owner: Mapped[User | None] = relationship()
