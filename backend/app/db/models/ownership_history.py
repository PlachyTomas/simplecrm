from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Index, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import OwnershipChangeReason

if TYPE_CHECKING:
    from app.db.models.company import Company
    from app.db.models.user import User


class OwnershipHistory(Base):
    __tablename__ = "ownership_history"
    __table_args__ = (
        Index("ix_ownership_history_company_id", "company_id"),
        Index("ix_ownership_history_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    company_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )

    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    reason: Mapped[OwnershipChangeReason] = mapped_column(
        Enum(OwnershipChangeReason, name="ownership_change_reason"),
        nullable=False,
    )

    company: Mapped[Company] = relationship()
    user: Mapped[User | None] = relationship()
