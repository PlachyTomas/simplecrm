from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class BillingSettings(Base):
    """Singleton row holding seller-side billing/DPH configuration.

    Enforced as a singleton via the `id = 1` check constraint. The first
    migration seeds the row; subsequent reads/writes target id=1.
    """

    __tablename__ = "billing_settings"
    __table_args__ = (
        CheckConstraint("id = 1", name="ck_billing_settings_singleton"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)

    # Flips the DPH-aware display in <PriceDisplay>. False until SimpleCRM
    # (the seller) crosses the 2 M Kč obrat threshold.
    is_vat_payer: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Stored as Numeric so the rate is exact when accountants need it.
    vat_rate_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("21.00"), nullable=False
    )

    seller_iban: Mapped[str | None] = mapped_column(String(34))
    seller_ico: Mapped[str | None] = mapped_column(String(8))
    contact_email: Mapped[str] = mapped_column(
        String(120), default="podpora@simplecrm.cz", nullable=False
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
