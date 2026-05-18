"""Persistent audit trail for super-admin operations.

Recorded from `/admin/*` routes and surfaced to customer admins via
`GET /organizations/me/admin-access-log`. The DPA discloses this access
as a documented instruction from the controller (čl. 28 GDPR).

The helper writes the row but does NOT commit — keeps the caller's
existing transaction boundary intact. Every admin route already commits
at the end, so a single trailing commit picks up the audit row too.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import SuperAdminAction, SuperAdminAuditLog, User


async def record(
    session: AsyncSession,
    *,
    super_admin: User,
    action: SuperAdminAction,
    target_organization_id: uuid.UUID | None,
    target_user: User | None = None,
    payload: dict[str, Any] | None = None,
) -> SuperAdminAuditLog:
    row = SuperAdminAuditLog(
        super_admin_user_id=super_admin.id,
        super_admin_email=super_admin.email,
        target_organization_id=target_organization_id,
        target_user_id=target_user.id if target_user is not None else None,
        target_user_email=target_user.email if target_user is not None else None,
        action=action,
        payload=payload or {},
    )
    session.add(row)
    return row
