from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, SmallInteger, String, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PaymentMethod(Base):
    """One row per organization with a saved card on file at ComGate.

    `comgate_initial_trans_id` is the ID returned by the original
    `create` call (with `initRecurring=true`). Replayed via the
    `recurring` API for renewals + mid-period seat-upgrade charges.
    Cannot be re-derived if lost — losing it means the customer must
    re-enter card details.

    Card display fields (`card_brand`, `card_last4`, `card_exp_*`) are
    surfaced in the in-app billing settings so the admin can spot a
    soon-to-expire card; they're not used for anything billing-critical.
    """

    __tablename__ = "payment_methods"

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    comgate_initial_trans_id: Mapped[str] = mapped_column(String(64), nullable=False)
    card_brand: Mapped[str | None] = mapped_column(String(32))
    card_last4: Mapped[str | None] = mapped_column(String(4))
    card_exp_month: Mapped[int | None] = mapped_column(SmallInteger)
    card_exp_year: Mapped[int | None] = mapped_column(SmallInteger)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
