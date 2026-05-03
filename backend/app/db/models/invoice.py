from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Invoice(Base):
    """One row per ComGate charge attempt.

    `kind` values:
      - `initial` — first activation after the customer chose a plan
      - `renewal` — scheduled period rollover charge
      - `seat_upgrade` — mid-period prorated charge for added seats

    `status` is `pending` until the webhook lands; then `paid` or `failed`.
    `refunded` is reserved for a future refund flow not implemented in this
    rewrite.

    `comgate_trans_id` is unique so the webhook handler is idempotent —
    a re-fired notification is a no-op.
    """

    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )

    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, server_default="CZK"
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="pending"
    )
    comgate_trans_id: Mapped[str | None] = mapped_column(
        String(64), unique=True
    )
    seats: Mapped[int | None] = mapped_column(Integer)
    period_starts_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    period_ends_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    failure_reason: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
