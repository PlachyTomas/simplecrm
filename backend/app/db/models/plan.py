from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Plan(Base):
    """A pricing plan. Codes are stable identifiers used by the API + UI.

    Plans with `is_public=true` are advertised on the public pricing page;
    `enterprise` and `comp` are super-admin-only and never appear publicly.
    """

    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Stable identifier (e.g. 'trial', 'monthly', 'annual', 'enterprise', 'comp').
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    display_name_cs: Mapped[str] = mapped_column(String(120), nullable=False)
    description_cs: Mapped[str | None] = mapped_column(Text)

    # 'trial' | 'monthly' | 'annual' | 'custom' | 'free'. String not enum so
    # super-admins can add intervals without a migration.
    billing_interval: Mapped[str] = mapped_column(String(16), nullable=False)

    # Per-user price in minor units (haléře). NULL for `enterprise` (per-org
    # override required at the Subscription level).
    price_per_user_minor: Mapped[int | None] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="CZK", nullable=False)

    is_public: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    trial_days: Mapped[int | None] = mapped_column(Integer)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
