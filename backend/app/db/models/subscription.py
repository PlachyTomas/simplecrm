from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, func
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
    current_period_starts_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    current_period_ends_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    canceled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Per-org override for enterprise / negotiated pricing. NULL means "use the
    # plan's price". Required for the `enterprise` plan (which itself has a
    # NULL plan price).
    override_price_per_user_minor: Mapped[int | None] = mapped_column(Integer)

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
    plan: Mapped[Plan] = relationship()
