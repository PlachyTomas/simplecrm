"""Read-only activity timeline.

Activities are written by other endpoints (deal stage_change, deal_won,
deal_lost, owner_change, etc.); this module only exposes a list view. The
Company detail's "Aktivita" tab consumes it via `?entity_type=company&entity_id=…`.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db import get_db
from app.db.models import Activity, User
from app.db.models.enums import ActivityEntityType
from app.schemas.activity import ActivityOut
from app.schemas.pagination import Page, PaginationParams

router = APIRouter(prefix="/activities", tags=["activities"])


@router.get("", response_model=Page[ActivityOut])
async def list_activities(
    pagination: PaginationParams = Depends(),
    entity_type: ActivityEntityType | None = Query(default=None),
    entity_id: uuid.UUID | None = Query(default=None),
    company_id: uuid.UUID | None = Query(
        default=None,
        description=(
            "Fan-up filter: returns everything logged against this company AND its "
            "deals/events/emails. Powers the company detail's Aktivita timeline."
        ),
    ),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Page[ActivityOut]:
    base = select(Activity).where(Activity.organization_id == user.organization_id)
    if entity_type is not None:
        base = base.where(Activity.entity_type == entity_type)
    if entity_id is not None:
        base = base.where(Activity.entity_id == entity_id)
    if company_id is not None:
        base = base.where(Activity.company_id == company_id)
    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await session.execute(count_stmt)).scalar_one()

    items_stmt = (
        base.order_by(Activity.created_at.desc()).limit(pagination.limit).offset(pagination.offset)
    )
    items = (await session.execute(items_stmt)).scalars().all()
    return Page[ActivityOut](
        items=[ActivityOut.model_validate(a) for a in items],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )
