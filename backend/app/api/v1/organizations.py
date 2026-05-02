"""Endpoints for managing the current user's Organization metadata.

Subscription / billing endpoints live in `app.api.v1.subscription` so they
can sit outside the trial-gate (otherwise a gated user couldn't escape
the gate by choosing a plan).
"""

from __future__ import annotations

import uuid
from typing import cast

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db import get_db
from app.db.models import Organization, User, UserRole
from app.schemas.organization import OrganizationOut, OrganizationUpdate

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
