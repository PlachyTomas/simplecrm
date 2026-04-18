"""Reports / KPI endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.scoping import scope_by_owner
from app.db import get_db
from app.db.models import Deal, Organization, Stage, User
from app.db.models.enums import StageType
from app.schemas.reports import KpiSummary

router = APIRouter(prefix="/reports", tags=["reports"])


def _start_of_month_utc() -> datetime:
    now = datetime.now(tz=UTC)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


@router.get("/kpi-summary", response_model=KpiSummary)
async def kpi_summary(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> KpiSummary:
    org = await session.get(Organization, user.organization_id)
    if org is None:
        raise RuntimeError("current user points at a missing organization")

    # Base query filtered by the caller's visibility scope.
    stmt = (
        select(Deal, Stage)
        .join(Stage, Stage.id == Deal.stage_id)
        .where(
            Deal.organization_id == user.organization_id,
        )
    )
    scoped = await scope_by_owner(stmt, session=session, user=user, owner_col=Deal.owner_user_id)
    rows = (await session.execute(scoped)).all()

    open_count = 0
    open_value = Decimal("0")
    won_count = 0
    won_value = Decimal("0")
    month_start = _start_of_month_utc()

    for deal, stage in rows:
        if deal.closed_at is None:
            open_count += 1
            if deal.currency == org.currency:
                open_value += deal.value
        # Won this month: stage type is won AND closed in the current month.
        # We also accept deals that closed without a won stage-move (edge
        # case) if closed_at is set and there's no lost_reason.
        if (
            deal.closed_at is not None
            and deal.closed_at >= month_start
            and stage.stage_type is StageType.won
        ):
            won_count += 1
            if deal.currency == org.currency:
                won_value += deal.value

    return KpiSummary(
        currency=org.currency,
        open_deal_count=open_count,
        open_pipeline_value=open_value,
        won_this_month_count=won_count,
        won_this_month_value=won_value,
    )
