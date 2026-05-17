from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
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
        CheckConstraint(
            "max_owned_companies IS NULL OR max_owned_companies >= 0",
            name="ck_users_max_owned_companies_nonneg",
        ),
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

    # Email + password authentication. Nullable: a Google-only user has no
    # password until they go through "Forgot password?" or sign up with the
    # same email and a password (which links the two methods on one row).
    # Bcrypt hashes are 60 chars; 255 leaves room for a future argon2id swap.
    password_hash: Mapped[str | None] = mapped_column(String(255))

    # Google OAuth verifies email at the IdP, so users created via that flow
    # are seeded with email_verified=True (see migration backfill). Email
    # signups start False and flip to True when the user clicks the link in
    # their verification email — `authenticate_email_user` rejects logins
    # while this is False so the verify step can't be skipped.
    email_verified: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

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

    # Cross-organization super-admin. Operates the /admin/* surface (org list,
    # subscription activation, comp/enterprise overrides, billing settings).
    # Distinct from org-level `role='admin'`. Set manually via SQL after the
    # founder's first login.
    is_super_admin: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Admin-set ceiling on company ownership. NULL = unlimited. Enforced
    # in companies.py at every assignment path (create / update-owner /
    # reassign). Distinct from `role` so a salesperson can have a tight
    # cap while a manager has none without granting elevated permissions.
    max_owned_companies: Mapped[int | None] = mapped_column(Integer)

    # Per-user widget layout + global filter state for the manager/admin
    # Reports page. Empty `{}` means "use the default layout from
    # `services/reports/default_layout.py`"; populated dicts conform to the
    # `DashboardConfig` Pydantic schema. Validated at API edge.
    reports_dashboard_config: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default="{}", nullable=False
    )

    # Free-form per-user preference blob. Populated only by
    # `PATCH /users/me/preferences`, which enforces an allowlist of keys
    # (currently: `tutorial_completed_at`, `tutorial_dismissed_at`,
    # `tutorial_step_index`). Kept separate from `reports_dashboard_config`
    # because that one has its own structured schema and dedicated endpoint.
    preferences: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default="{}", nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    organization: Mapped[Organization | None] = relationship(back_populates="users")
    team: Mapped[Team | None] = relationship(back_populates="members", foreign_keys=[team_id])
