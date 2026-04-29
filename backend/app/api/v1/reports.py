"""Reports / KPI endpoints."""

from __future__ import annotations

import dataclasses
import uuid
from collections import defaultdict
from datetime import UTC, date, datetime, time
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.scoping import scope_by_owner
from app.db import get_db
from app.db.models import Deal, Organization, Stage, User
from app.db.models.enums import StageType
from app.schemas.reports import (
    KpiSummary,
    Leaderboard,
    LeaderboardRow,
    LossReasonRow,
    LossReasons,
    Velocity,
    VelocityByStage,
)

router = APIRouter(prefix="/reports", tags=["reports"])


def _start_of_month_utc() -> datetime:
    now = datetime.now(tz=UTC)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _date_window(
    from_date: date | None, to_date: date | None
) -> tuple[date, date, datetime, datetime]:
    """Normalize a date range; defaults to the trailing 90 days."""
    today = datetime.now(tz=UTC).date()
    resolved_to = to_date or today
    resolved_from = from_date or date.fromordinal(resolved_to.toordinal() - 89)
    start = datetime.combine(resolved_from, time.min, tzinfo=UTC)
    end = datetime.combine(resolved_to, time.max, tzinfo=UTC)
    return resolved_from, resolved_to, start, end


@router.get("/kpi-summary", response_model=KpiSummary)
async def kpi_summary(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> KpiSummary:
    org = await session.get(Organization, user.organization_id)
    if org is None:
        raise RuntimeError("current user points at a missing organization")

    stmt = (
        select(Deal, Stage)
        .join(Stage, Stage.id == Deal.stage_id)
        .where(Deal.organization_id == user.organization_id)
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


@router.get("/leaderboard", response_model=Leaderboard)
async def leaderboard(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Leaderboard:
    org = await session.get(Organization, user.organization_id)
    if org is None:
        raise RuntimeError("current user points at a missing organization")
    resolved_from, resolved_to, start, end = _date_window(from_date, to_date)

    stmt = (
        select(Deal, Stage, User)
        .join(Stage, Stage.id == Deal.stage_id)
        .join(User, User.id == Deal.owner_user_id, isouter=True)
        .where(
            Deal.organization_id == user.organization_id,
            Deal.closed_at.is_not(None),
            Deal.closed_at >= start,
            Deal.closed_at <= end,
            Stage.stage_type == StageType.won,
        )
    )
    scoped = await scope_by_owner(stmt, session=session, user=user, owner_col=Deal.owner_user_id)

    @dataclasses.dataclass
    class _OwnerAgg:
        name: str = "—"
        count: int = 0
        value: Decimal = Decimal("0")

    totals: dict[uuid.UUID, _OwnerAgg] = defaultdict(_OwnerAgg)
    for deal, _stage, owner in (await session.execute(scoped)).all():
        if owner is None:
            continue
        bucket = totals[owner.id]
        bucket.name = owner.name
        bucket.count += 1
        if deal.currency == org.currency:
            bucket.value += deal.value

    rows = [
        LeaderboardRow(
            user_id=user_id,
            name=bucket.name,
            won_count=bucket.count,
            won_value=bucket.value,
        )
        for user_id, bucket in totals.items()
    ]
    rows.sort(key=lambda r: (r.won_value, r.won_count), reverse=True)
    return Leaderboard(
        currency=org.currency,
        from_date=resolved_from,
        to_date=resolved_to,
        rows=rows,
    )


@router.get("/loss-reasons", response_model=LossReasons)
async def loss_reasons(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> LossReasons:
    org = await session.get(Organization, user.organization_id)
    if org is None:
        raise RuntimeError("current user points at a missing organization")
    resolved_from, resolved_to, start, end = _date_window(from_date, to_date)

    stmt = select(Deal).where(
        Deal.organization_id == user.organization_id,
        Deal.closed_at.is_not(None),
        Deal.closed_at >= start,
        Deal.closed_at <= end,
        Deal.lost_reason.is_not(None),
    )
    scoped = await scope_by_owner(stmt, session=session, user=user, owner_col=Deal.owner_user_id)
    @dataclasses.dataclass
    class _ReasonAgg:
        count: int = 0
        value: Decimal = Decimal("0")

    buckets: dict[str, _ReasonAgg] = defaultdict(_ReasonAgg)
    for deal in (await session.execute(scoped)).scalars():
        reason = deal.lost_reason or "Neuvedeno"
        buckets[reason].count += 1
        if deal.currency == org.currency:
            buckets[reason].value += deal.value
    rows = [
        LossReasonRow(lost_reason=reason, count=b.count, total_value=b.value)
        for reason, b in buckets.items()
    ]
    rows.sort(key=lambda r: (r.count, r.total_value), reverse=True)
    return LossReasons(
        currency=org.currency,
        from_date=resolved_from,
        to_date=resolved_to,
        rows=rows,
    )


@router.get("/pipeline-velocity", response_model=Velocity)
async def pipeline_velocity(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Velocity:
    """Average days from `created_at` to `closed_at` for deals that finished
    inside the window, grouped by the final stage. MVP proxy for "time in
    stage" — the activity-log-driven accurate version is a later task.
    """
    resolved_from, resolved_to, start, end = _date_window(from_date, to_date)

    stmt = (
        select(Deal, Stage)
        .join(Stage, Stage.id == Deal.stage_id)
        .where(
            Deal.organization_id == user.organization_id,
            Deal.closed_at.is_not(None),
            Deal.closed_at >= start,
            Deal.closed_at <= end,
        )
    )
    scoped = await scope_by_owner(stmt, session=session, user=user, owner_col=Deal.owner_user_id)
    @dataclasses.dataclass
    class _StageAgg:
        stage_id: uuid.UUID | None = None
        name: str = ""
        sum_days: float = 0.0
        count: int = 0

    per_stage: dict[uuid.UUID, _StageAgg] = defaultdict(_StageAgg)
    for deal, stage in (await session.execute(scoped)).all():
        if deal.closed_at is None:
            continue
        days = (deal.closed_at - deal.created_at).total_seconds() / 86400.0
        bucket = per_stage[stage.id]
        bucket.stage_id = stage.id
        bucket.name = stage.name
        bucket.sum_days += days
        bucket.count += 1

    stages = [
        VelocityByStage(
            stage_id=b.stage_id,  # type: ignore[arg-type]
            stage_name=b.name,
            avg_days_in_stage=(b.sum_days / b.count) if b.count else None,
            deal_count=b.count,
        )
        for b in per_stage.values()
    ]
    stages.sort(key=lambda v: v.stage_name)
    return Velocity(from_date=resolved_from, to_date=resolved_to, stages=stages)


# NOTE: export-csv used to live here. It now lives in `api/v1/data_export.py`
# and is mounted on a separate router so the trial gate doesn't apply —
# users must be able to walk away with their data even after their trial
# ends. See the module docstring there.
