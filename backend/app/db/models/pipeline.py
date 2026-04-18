from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.organization import Organization
    from app.db.models.stage import Stage


class Pipeline(Base):
    __tablename__ = "pipelines"
    __table_args__ = (
        # At most one default pipeline per organization. Partial-unique index
        # lets non-default pipelines share the `False` value freely.
        Index(
            "uq_pipelines_one_default_per_org",
            "organization_id",
            unique=True,
            postgresql_where=text("is_default = true"),
        ),
        Index("ix_pipelines_organization_id", "organization_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    organization: Mapped[Organization] = relationship()
    stages: Mapped[list[Stage]] = relationship(
        back_populates="pipeline",
        cascade="all, delete-orphan",
        order_by="Stage.position",
    )
