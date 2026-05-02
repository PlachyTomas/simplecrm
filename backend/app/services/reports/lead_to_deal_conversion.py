"""`lead_to_deal_conversion` widget — % of leads (companies) that got a deal.

REPORTS_TASK §4 widget #7. `count(distinct Company with at least one
Deal created in range) / count(Company created in range) × 100`.

Companies created in the range that didn't yet get a deal count as
un-converted.
"""

from __future__ import annotations

from datetime import date, datetime, time, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Company, Deal, User
from app.schemas.reports import (
    Comparison,
    LeadConversionBreakdownItem,
    LeadToDealConversionResponse,
)
from app.schemas.reports.widgets import LeadToDealConversionConfig
from app.services.reports._common import compute_previous_period


async def _counts_in_window(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_dt: datetime,
    to_dt: datetime,
    team_id: UUID | None,
    owner_user_id: UUID | None,
) -> tuple[int, int]:
    """Returns (converted_count, total_count) — companies created in
    window vs. companies-with-at-least-one-deal-created-in-window.
    """

    total_stmt = (
        select(func.count(Company.id))
        .where(Company.organization_id == organization_id)
        .where(Company.created_at >= from_dt)
        .where(Company.created_at <= to_dt)
    )
    converted_stmt = (
        select(func.count(func.distinct(Company.id)))
        .join(Deal, Deal.company_id == Company.id)
        .where(Company.organization_id == organization_id)
        .where(Company.created_at >= from_dt)
        .where(Company.created_at <= to_dt)
        .where(Deal.created_at >= from_dt)
        .where(Deal.created_at <= to_dt)
    )
    if owner_user_id is not None:
        total_stmt = total_stmt.where(Company.owner_user_id == owner_user_id)
        converted_stmt = converted_stmt.where(Company.owner_user_id == owner_user_id)
    if team_id is not None:
        total_stmt = total_stmt.join(
            User, User.id == Company.owner_user_id
        ).where(User.team_id == team_id)
        converted_stmt = converted_stmt.join(
            User, User.id == Company.owner_user_id
        ).where(User.team_id == team_id)
    total = int((await session.execute(total_stmt)).scalar_one() or 0)
    converted = int((await session.execute(converted_stmt)).scalar_one() or 0)
    return converted, total


def _ratio(converted: int, total: int) -> float | None:
    if total == 0:
        return None
    return round(converted / total * 100, 1)


async def _breakdown_by_owner(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_dt: datetime,
    to_dt: datetime,
    team_id: UUID | None,
    owner_user_id: UUID | None,
) -> list[LeadConversionBreakdownItem]:
    # Per-owner totals — converted is computed via a subquery to avoid
    # double-counting companies with multiple deals.
    converted_subq = (
        select(Deal.company_id)
        .where(Deal.created_at >= from_dt)
        .where(Deal.created_at <= to_dt)
        .distinct()
        .subquery()
    )
    stmt = (
        select(
            Company.owner_user_id,
            User.name,
            func.count(Company.id).label("total_count"),
            func.count(converted_subq.c.company_id).label("converted_count"),
        )
        .join(User, User.id == Company.owner_user_id, isouter=True)
        .join(
            converted_subq,
            converted_subq.c.company_id == Company.id,
            isouter=True,
        )
        .where(Company.organization_id == organization_id)
        .where(Company.created_at >= from_dt)
        .where(Company.created_at <= to_dt)
        .group_by(Company.owner_user_id, User.name)
    )
    if owner_user_id is not None:
        stmt = stmt.where(Company.owner_user_id == owner_user_id)
    if team_id is not None:
        stmt = stmt.where(User.team_id == team_id)
    rows = (await session.execute(stmt)).all()
    return [
        LeadConversionBreakdownItem(
            owner_user_id=oid,
            owner_name=name or "—",
            converted=int(converted or 0),
            total=int(total or 0),
        )
        for oid, name, total, converted in rows
    ]


async def compute_lead_to_deal_conversion(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_: date,
    to: date,
    team_id: UUID | None,
    owner_user_id: UUID | None,
    config: LeadToDealConversionConfig,
) -> LeadToDealConversionResponse:
    from_dt = datetime.combine(from_, time.min, tzinfo=timezone.utc)
    to_dt = datetime.combine(to, time.max, tzinfo=timezone.utc)
    converted, total = await _counts_in_window(
        session,
        organization_id=organization_id,
        from_dt=from_dt,
        to_dt=to_dt,
        team_id=team_id,
        owner_user_id=owner_user_id,
    )
    cur_value = _ratio(converted, total)

    prev = compute_previous_period(from_, to)
    prev_from_dt = datetime.combine(prev.from_, time.min, tzinfo=timezone.utc)
    prev_to_dt = datetime.combine(prev.to, time.max, tzinfo=timezone.utc)
    prev_converted, prev_total = await _counts_in_window(
        session,
        organization_id=organization_id,
        from_dt=prev_from_dt,
        to_dt=prev_to_dt,
        team_id=team_id,
        owner_user_id=owner_user_id,
    )
    prev_value = _ratio(prev_converted, prev_total)

    delta_pct: float | None = None
    if cur_value is not None and prev_value is not None:
        delta_pct = round(cur_value - prev_value, 1)

    breakdown: list[LeadConversionBreakdownItem] = []
    if config.breakdown == "by_owner":
        breakdown = await _breakdown_by_owner(
            session,
            organization_id=organization_id,
            from_dt=from_dt,
            to_dt=to_dt,
            team_id=team_id,
            owner_user_id=owner_user_id,
        )

    return LeadToDealConversionResponse(
        value=cur_value,
        converted_count=converted,
        total_count=total,
        comparison=Comparison(
            value=prev_value if prev_value is not None else 0,
            delta_pct=delta_pct,
            previous_from=prev.from_,
            previous_to=prev.to,
        ),
        breakdown=breakdown,
    )
