"""`avg_deal_size` widget — sum(value) / count over a configurable scope.

REPORTS_TASK §4 widget #5. `scope='won'` (default) restricts to
closed-won deals in the range; `scope='open'` averages over open deals
created in the range.
"""

from __future__ import annotations

from datetime import date, datetime, time, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Deal, Organization, Stage
from app.db.models.enums import StageType
from app.schemas.reports import AvgDealSizeResponse, Comparison
from app.schemas.reports.widgets import AvgDealSizeConfig
from app.services.reports._common import compute_previous_period


async def _avg_in_window(
    session: AsyncSession,
    *,
    organization_id: UUID,
    org_currency: str,
    from_dt: datetime,
    to_dt: datetime,
    team_id: UUID | None,
    owner_user_id: UUID | None,
    scope: str,
) -> tuple[Decimal, int]:
    stmt = (
        select(
            func.coalesce(func.sum(Deal.value), 0),
            func.count(Deal.id),
        )
        .join(Stage, Stage.id == Deal.stage_id)
        .where(Deal.organization_id == organization_id)
        .where(Deal.currency == org_currency)
    )
    if scope == "won":
        stmt = (
            stmt.where(Stage.stage_type == StageType.won)
            .where(Deal.closed_at.is_not(None))
            .where(Deal.closed_at >= from_dt)
            .where(Deal.closed_at <= to_dt)
        )
    else:  # "open"
        stmt = (
            stmt.where(Stage.stage_type == StageType.open)
            .where(Deal.created_at >= from_dt)
            .where(Deal.created_at <= to_dt)
        )
    if owner_user_id is not None:
        stmt = stmt.where(Deal.owner_user_id == owner_user_id)
    if team_id is not None:
        from app.db.models import User as _User

        stmt = stmt.join(_User, _User.id == Deal.owner_user_id).where(
            _User.team_id == team_id
        )
    total, count = (await session.execute(stmt)).one()
    n = int(count or 0)
    if n == 0:
        return Decimal("0"), 0
    return Decimal(str(total)) / n, n


async def compute_avg_deal_size(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_: date,
    to: date,
    team_id: UUID | None,
    owner_user_id: UUID | None,
    config: AvgDealSizeConfig,
) -> AvgDealSizeResponse:
    org = await session.get(Organization, organization_id)
    if org is None:
        raise RuntimeError(f"organization {organization_id} not found")

    from_dt = datetime.combine(from_, time.min, tzinfo=timezone.utc)
    to_dt = datetime.combine(to, time.max, tzinfo=timezone.utc)
    cur_value, cur_count = await _avg_in_window(
        session,
        organization_id=organization_id,
        org_currency=org.currency,
        from_dt=from_dt,
        to_dt=to_dt,
        team_id=team_id,
        owner_user_id=owner_user_id,
        scope=config.scope,
    )

    prev = compute_previous_period(from_, to)
    prev_from_dt = datetime.combine(prev.from_, time.min, tzinfo=timezone.utc)
    prev_to_dt = datetime.combine(prev.to, time.max, tzinfo=timezone.utc)
    prev_value, _ = await _avg_in_window(
        session,
        organization_id=organization_id,
        org_currency=org.currency,
        from_dt=prev_from_dt,
        to_dt=prev_to_dt,
        team_id=team_id,
        owner_user_id=owner_user_id,
        scope=config.scope,
    )

    delta_pct: float | None = None
    if prev_value > 0:
        delta_pct = float((cur_value - prev_value) / prev_value * 100)

    return AvgDealSizeResponse(
        value=cur_value,
        currency=org.currency,
        sample_count=cur_count,
        comparison=Comparison(
            value=prev_value,
            delta_pct=delta_pct,
            previous_from=prev.from_,
            previous_to=prev.to,
        ),
    )
