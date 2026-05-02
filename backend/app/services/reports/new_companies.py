"""`new_companies` widget — count of Company rows created in range.

REPORTS_TASK §4 widget #2. Optional `breakdown="by_owner"` returns
per-owner counts so the frontend can render the horizontal bar.
"""

from __future__ import annotations

from datetime import date, datetime, time, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Company, User
from app.schemas.reports import (
    Comparison,
    NewCompaniesBreakdownItem,
    NewCompaniesResponse,
)
from app.schemas.reports.widgets import NewCompaniesConfig
from app.services.reports._common import compute_previous_period


async def _count_in_window(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_dt: datetime,
    to_dt: datetime,
    team_id: UUID | None,
    owner_user_id: UUID | None,
) -> int:
    stmt = (
        select(func.count(Company.id))
        .where(Company.organization_id == organization_id)
        .where(Company.created_at >= from_dt)
        .where(Company.created_at <= to_dt)
    )
    if owner_user_id is not None:
        stmt = stmt.where(Company.owner_user_id == owner_user_id)
    if team_id is not None:
        stmt = stmt.join(User, User.id == Company.owner_user_id).where(
            User.team_id == team_id
        )
    return int((await session.execute(stmt)).scalar_one() or 0)


async def _breakdown_by_owner(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_dt: datetime,
    to_dt: datetime,
    team_id: UUID | None,
    owner_user_id: UUID | None,
) -> list[NewCompaniesBreakdownItem]:
    stmt = (
        select(
            Company.owner_user_id,
            User.name,
            func.count(Company.id),
        )
        .join(User, User.id == Company.owner_user_id, isouter=True)
        .where(Company.organization_id == organization_id)
        .where(Company.created_at >= from_dt)
        .where(Company.created_at <= to_dt)
        .group_by(Company.owner_user_id, User.name)
        .order_by(func.count(Company.id).desc())
    )
    if owner_user_id is not None:
        stmt = stmt.where(Company.owner_user_id == owner_user_id)
    if team_id is not None:
        stmt = stmt.where(User.team_id == team_id)
    rows = (await session.execute(stmt)).all()
    return [
        NewCompaniesBreakdownItem(
            owner_user_id=oid,
            owner_name=name or "—",
            count=int(count or 0),
        )
        for oid, name, count in rows
    ]


async def compute_new_companies(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_: date,
    to: date,
    team_id: UUID | None,
    owner_user_id: UUID | None,
    config: NewCompaniesConfig,
) -> NewCompaniesResponse:
    from_dt = datetime.combine(from_, time.min, tzinfo=timezone.utc)
    to_dt = datetime.combine(to, time.max, tzinfo=timezone.utc)
    cur = await _count_in_window(
        session,
        organization_id=organization_id,
        from_dt=from_dt,
        to_dt=to_dt,
        team_id=team_id,
        owner_user_id=owner_user_id,
    )
    prev = compute_previous_period(from_, to)
    prev_from_dt = datetime.combine(prev.from_, time.min, tzinfo=timezone.utc)
    prev_to_dt = datetime.combine(prev.to, time.max, tzinfo=timezone.utc)
    prev_count = await _count_in_window(
        session,
        organization_id=organization_id,
        from_dt=prev_from_dt,
        to_dt=prev_to_dt,
        team_id=team_id,
        owner_user_id=owner_user_id,
    )
    delta_pct: float | None = None
    if prev_count > 0:
        delta_pct = round((cur - prev_count) / prev_count * 100, 2)

    breakdown: list[NewCompaniesBreakdownItem] = []
    if config.breakdown == "by_owner":
        breakdown = await _breakdown_by_owner(
            session,
            organization_id=organization_id,
            from_dt=from_dt,
            to_dt=to_dt,
            team_id=team_id,
            owner_user_id=owner_user_id,
        )

    return NewCompaniesResponse(
        value=cur,
        sparkline=[],
        comparison=Comparison(
            value=prev_count,
            delta_pct=delta_pct,
            previous_from=prev.from_,
            previous_to=prev.to,
        ),
        breakdown=breakdown,
    )
