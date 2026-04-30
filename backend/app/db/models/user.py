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


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_organization_id", "organization_id"),
        Index("ix_users_team_id", "team_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Global email uniqueness. A person signing in with Google always maps to
    # the same User record; cross-organization membership is intentionally not
    # supported. If their email is already attached to org A, an invite from
    # org B is rejected with 409 — see services/invitations.py.
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    google_id: Mapped[str | None] = mapped_column(String(64), unique=True)

    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"),
        default=UserRole.salesperson,
        nullable=False,
    )

    # Nullable: a Google-authenticated user with no pending invite lands
    # without an org and gets routed to the create-org flow on the frontend.
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    team_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="SET NULL"),
    )

    # Per-user permission, separate from `role`. Admins always implicitly can
    # invite; managers/salespeople need this flag flipped on by an admin.
    can_invite: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    organization: Mapped[Organization | None] = relationship(back_populates="users")
    team: Mapped[Team | None] = relationship(back_populates="members", foreign_keys=[team_id])
