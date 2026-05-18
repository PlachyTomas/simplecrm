"""Endpoints for managing the current user's Organization metadata.

Subscription / billing endpoints live in `app.api.v1.subscription` so they
can sit outside the trial-gate (otherwise a gated user couldn't escape
the gate by choosing a plan).
"""

from __future__ import annotations

import uuid
from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db import get_db
from app.db.models import Organization, SuperAdminAuditLog, User, UserRole
from app.schemas.organization import (
    AdminAccessLogList,
    AdminAccessLogRow,
    OrganizationEraseIn,
    OrganizationEraseOut,
    OrganizationOut,
    OrganizationUpdate,
)
from app.services import org_erasure
from app.services.comgate import ComGateClient, get_comgate_client

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("/current", response_model=OrganizationOut)
async def get_current_organization(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Organization:
    org = await session.get(Organization, cast(uuid.UUID, user.organization_id))
    if org is None:  # shouldn't happen — user rows carry a valid FK
        raise RuntimeError("current user points at a missing organization")
    return org


@router.put("/current", response_model=OrganizationOut)
async def update_current_organization(
    payload: OrganizationUpdate,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> Organization:
    org = await session.get(Organization, cast(uuid.UUID, user.organization_id))
    if org is None:
        raise RuntimeError("current user points at a missing organization")

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(org, field, value)

    await session.commit()
    await session.refresh(org)
    return org


@router.get("/me/admin-access-log", response_model=AdminAccessLogList)
async def list_admin_access_log(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> AdminAccessLogList:
    """History of super-admin (operator-team) access to *this* organization.

    Surfaced in Settings → Přístup operátora. Disclosed in DPA čl. 4(h) so
    the controller can audit who from our side has looked at their data,
    when, and (for impersonation) as whom.
    """
    base = select(SuperAdminAuditLog).where(
        SuperAdminAuditLog.target_organization_id == user.organization_id
    )
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        (
            await session.execute(
                base.order_by(SuperAdminAuditLog.created_at.desc()).limit(limit).offset(offset)
            )
        )
        .scalars()
        .all()
    )
    return AdminAccessLogList(
        items=[AdminAccessLogRow.model_validate(r) for r in rows],
        total=total,
    )


@router.post(
    "/me/erase",
    response_model=OrganizationEraseOut,
    status_code=status.HTTP_200_OK,
)
async def erase_current_organization(
    payload: OrganizationEraseIn,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
    comgate: ComGateClient = Depends(get_comgate_client),
) -> OrganizationEraseOut:
    """GDPR Art. 17 erasure for the caller's organization.

    Admin-only, irreversible. Anonymizes the org + users in place and
    hard-deletes every PII satellite (contacts, companies, deals, …) but
    keeps invoices for the 10-year accounting retention window per
    § 31 zák. č. 563/1991 Sb.

    UX guardrails (also enforced server-side):
      - `confirmation_name` must match the org's current `name` exactly
      - admin role required — managers/salespeople can't trigger erasure
      - any existing subscription is canceled best-effort first so the
        billing scheduler doesn't re-charge an erased org
    """
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No organization")

    try:
        org = await org_erasure.erase_organization(
            session,
            org_id=user.organization_id,
            confirmation_name=payload.confirmation_name,
            by_admin_id=user.id,
            comgate=comgate,
        )
    except org_erasure.ErasureError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    await session.commit()
    deleted_at = org.deleted_at
    if deleted_at is None:  # pragma: no cover — erase_organization always stamps it
        raise RuntimeError("erase_organization did not stamp deleted_at")
    return OrganizationEraseOut(organization_id=org.id, deleted_at=deleted_at)
