from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.organization import Organization
    from app.db.models.user import User


class SuperAdminAction(enum.StrEnum):
    """What a super-admin did. Kept small on purpose — we audit the routes
    that touch a customer org's PII, not internal billing-only mutations
    (those already land in `activities` as `subscription_change`)."""

    list_users = "list_users"
    view_subscription = "view_subscription"
    view_invoices = "view_invoices"
    view_activity = "view_activity"
    impersonate = "impersonate"


class SuperAdminAuditLog(Base):
    """Per-action audit trail for super-admin (`is_super_admin=True`) operations
    against a specific customer organization.

    Customer admins read this from `GET /organizations/me/admin-access-log`
    so they can see who from the operator team looked at their data, when,
    and as whom (in the case of impersonation). Disclosed in the DPA.

    Insert-only by convention; no UPDATE/DELETE routes. The org FK uses
    `SET NULL` so the row survives org deletion (the audit is *about* the
    operator, not the org — losing it on cascade would defeat the point).
    """

    __tablename__ = "super_admin_audit_log"
    __table_args__ = (
        Index("ix_super_admin_audit_log_org_created", "target_organization_id", "created_at"),
        Index("ix_super_admin_audit_log_actor", "super_admin_user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    super_admin_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    # Captured at write time so the email survives even if the operator's
    # account is later deactivated / renamed.
    super_admin_email: Mapped[str] = mapped_column(String(320), nullable=False)

    target_organization_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="SET NULL"),
    )
    target_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    # Snapshot of the impersonated user's email so a later anonymization
    # of the User row doesn't erase the historical disclosure to the
    # controller.
    target_user_email: Mapped[str | None] = mapped_column(String(320))

    action: Mapped[SuperAdminAction] = mapped_column(
        Enum(SuperAdminAction, name="super_admin_action"),
        nullable=False,
    )
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    super_admin: Mapped[User | None] = relationship(foreign_keys=[super_admin_user_id])
    target_user: Mapped[User | None] = relationship(foreign_keys=[target_user_id])
    target_organization: Mapped[Organization | None] = relationship()
