from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.organization import Organization
    from app.db.models.plan import Plan


class Subscription(Base):
    __tablename__ = "subscriptions"
    __table_args__ = (
        Index("ix_subscriptions_org_status", "organization_id", "status"),
        Index("ix_subscriptions_current_period_ends_at", "current_period_ends_at"),
        Index("ix_subscriptions_next_renewal_charge_at", "next_renewal_charge_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("plans.id", ondelete="RESTRICT"),
        nullable=False,
    )
    # Free-form string (not enum) so super-admins can add new states without a
    # migration. Validated at the service layer. Allowed values:
    #   trialing | pending_activation | active | past_due | canceled
    status: Mapped[str] = mapped_column(String(32), nullable=False)

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    current_period_starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    current_period_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    canceled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Per-org override for enterprise / negotiated pricing. NULL means "use the
    # plan's price". Required for the `enterprise` plan (which itself has a
    # NULL plan price).
    override_price_per_user_minor: Mapped[int | None] = mapped_column(Integer)

    # Contracted seat count = hard limit on the number of active users in
    # the org. Drives the bill total (seat_count × effective_price_per_user)
    # rather than the live headcount, so a queued downsize that takes effect
    # next period still bills the contracted amount this period.
    seat_count: Mapped[int] = mapped_column(Integer, default=1, server_default="1", nullable=False)

    # The seat count last blessed by a successful payment (or, during
    # trial, the value the admin self-set). `seat_count` (the live cap)
    # may move freely upward only while status='trialing'; once active,
    # any increase above contracted_seat_count requires a successful
    # ComGate charge that bumps both fields together. Closes the
    # bump-then-drop-before-billing abuse vector documented in
    # qa-artifacts/2026-05-03-adversary-testing-report.md (Finding 1).
    contracted_seat_count: Mapped[int] = mapped_column(
        Integer, default=1, server_default="1", nullable=False
    )

    # Dunning: count of consecutive failed renewal-charge attempts.
    # `last_charge_failed_at` flips to past_due-grace handling once N
    # attempts pile up; the recurring-charge job uses these to schedule
    # back-off retries instead of hammering on a dead card.
    dunning_attempts: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
    )
    last_charge_failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # When the recurring-charge job should next attempt a charge.
    # Normally equals `current_period_ends_at`; the dunning logic pushes
    # it forward on a back-off curve after a failed attempt.
    next_renewal_charge_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Queued change applied at the next period rollover (or trial expiry).
    # `pending_plan_id` swaps monthly ↔ annual without disturbing the current
    # period; `pending_seat_count` lets the admin pre-commit a seat reduction
    # that lands at the next billing cycle.
    pending_plan_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("plans.id", ondelete="RESTRICT"),
    )
    pending_seat_count: Mapped[int | None] = mapped_column(Integer)
    # User IDs queued to lose access at next period rollover. Populated when
    # admin reduces seat_count below the live active-user count via Settings →
    # Organizace; cleared either by an explicit cancel (PUT seat-count == current)
    # or by the rollover service after applying.
    pending_user_deactivations: Mapped[list[uuid.UUID] | None] = mapped_column(JSONB, nullable=True)

    # Comp = bartered for exposure. The pay-gate never fires for these orgs.
    is_comp: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    comp_reason: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)

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
    plan: Mapped[Plan] = relationship(foreign_keys=[plan_id])
    pending_plan: Mapped[Plan | None] = relationship(foreign_keys=[pending_plan_id])
