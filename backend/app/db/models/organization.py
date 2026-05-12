from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import Region

if TYPE_CHECKING:
    from app.db.models.team import Team
    from app.db.models.user import User

TRIAL_LENGTH = timedelta(days=30)


def _default_trial_ends_at() -> datetime:
    return datetime.now(tz=UTC) + TRIAL_LENGTH


class Organization(Base):
    __tablename__ = "organizations"
    __table_args__ = (Index("ix_organizations_trial_ends_at", "trial_ends_at"),)

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)

    # Czech business registry fields. All nullable because an org can be
    # seeded from onboarding before an IČO is known (edge-case — but the
    # brief is clear that IČO entry is part of onboarding, not before it).
    ico: Mapped[str | None] = mapped_column(String(8))
    dic: Mapped[str | None] = mapped_column(String(16))
    address_street: Mapped[str | None] = mapped_column(String(200))
    address_city: Mapped[str | None] = mapped_column(String(120))
    address_zip: Mapped[str | None] = mapped_column(String(12))
    legal_form: Mapped[str | None] = mapped_column(String(120))
    registered_on: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    region: Mapped[Region] = mapped_column(
        Enum(Region, name="organization_region", values_callable=lambda e: [v.value for v in e]),
        default=Region.eu_cz,
        nullable=False,
    )
    locale: Mapped[str] = mapped_column(String(16), default="cs-CZ", nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="CZK", nullable=False)

    # Distinct legal/billing name for tax invoices when it differs from
    # `name` (which is the day-to-day display label). Common case: the org
    # signs up as "Acme team" but invoices must read "Acme s.r.o.". When
    # null, the invoice generator falls back to `name`.
    billing_name: Mapped[str | None] = mapped_column(String(200))
    billing_email: Mapped[str | None] = mapped_column(String(320))
    stripe_customer_id: Mapped[str | None] = mapped_column(String(64))

    trial_ends_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_default_trial_ends_at, nullable=False
    )

    # When False (the default for new orgs), salespeople do not see the
    # team/user leaderboards in Reporty or on the dashboard. Admins/managers
    # always see them. Admins flip this in Settings → Oprávnění.
    show_leaderboard_to_salespeople: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )

    # Auto-release window (days). When a Company has had no won-deal activity
    # for this many days, the freeing job releases its ownership back to the
    # pool so a manager can reassign. Default 365; bounded 1..3650 at the API
    # edge. Org admins flip this in Settings → Oprávnění.
    ownership_window_days: Mapped[int] = mapped_column(
        Integer, default=365, server_default="365", nullable=False
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

    users: Mapped[list[User]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )
    teams: Mapped[list[Team]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )
