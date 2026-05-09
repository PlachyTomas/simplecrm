from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import UserRole

if TYPE_CHECKING:
    from app.db.models.organization import Organization
    from app.db.models.team import Team
    from app.db.models.user import User


class Invitation(Base):
    """Pending invitation issued by an admin (or a `can_invite` user) to a
    not-yet-registered email. The invitee accepts by signing in with Google
    on the same email; a partial unique index keeps at most one open invite
    per (org, email).
    """

    __tablename__ = "invitations"
    __table_args__ = (
        Index("ix_invitations_organization_id", "organization_id"),
        Index("ix_invitations_email_lower", func.lower("email")),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"), nullable=False)
    team_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="SET NULL"),
    )
    can_invite: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )

    invited_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )

    # The signed-token's jti, also unique across the table — collisions are
    # cosmically unlikely (uuid4) but the index keeps lookups O(1).
    token_jti: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), unique=True, nullable=False)

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    organization: Mapped[Organization] = relationship()
    team: Mapped[Team | None] = relationship()
    invited_by: Mapped[User | None] = relationship(foreign_keys=[invited_by_user_id])
