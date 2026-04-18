from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import StageType

if TYPE_CHECKING:
    from app.db.models.pipeline import Pipeline


class Stage(Base):
    __tablename__ = "stages"
    __table_args__ = (
        UniqueConstraint("pipeline_id", "position", name="uq_stages_pipeline_position"),
        CheckConstraint(
            "default_probability >= 0 AND default_probability <= 100",
            name="ck_stages_default_probability",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    pipeline_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("pipelines.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    default_probability: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    color: Mapped[str] = mapped_column(String(9), nullable=False, default="#3D5AFE")
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    stage_type: Mapped[StageType] = mapped_column(
        Enum(StageType, name="stage_type"),
        nullable=False,
        default=StageType.open,
    )

    pipeline: Mapped[Pipeline] = relationship(back_populates="stages")
