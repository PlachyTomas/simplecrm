from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import ImportRunStatus

if TYPE_CHECKING:
    from app.db.models.organization import Organization
    from app.db.models.user import User


class ImportRun(Base):
    """One committed import — the anchor for provenance and undo.

    Every company/contact/deal the run *created* carries this row's id in its
    `import_run_id` column (ON DELETE SET NULL: dropping the history row must
    never cascade into business data). Rows the run *updated* are deliberately
    not stamped — an update is not ours to undo.

    `counts` stores the same dict the preview/commit response returns
    (`ImportCountsOut` keys), so the history UI renders from one source of
    truth instead of a second, drifting summary.
    """

    __tablename__ = "import_runs"
    __table_args__ = (
        Index("ix_import_runs_organization_id_created_at", "organization_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    # SET NULL, not CASCADE: the history of what entered the database must
    # outlive the admin who ran the import.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    provider: Mapped[str] = mapped_column(String(50), nullable=False, default="generic")
    counts: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[ImportRunStatus] = mapped_column(
        Enum(ImportRunStatus, name="import_run_status"),
        nullable=False,
        default=ImportRunStatus.committed,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    undone_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    undone_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )

    organization: Mapped[Organization] = relationship()
    user: Mapped[User | None] = relationship(foreign_keys=[user_id])
