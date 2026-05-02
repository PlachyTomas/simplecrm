"""`deals_won` widget — count + total value of closed-won deals.

REPORTS_TASK §4 widget #3: deals where `Deal.closed_at` is in the
range AND `Stage.stage_type = 'won'`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Deal, Organization, Stage
from app.db.models.enums import StageType
from app.schemas.reports import Comparison, DealsWonResponse
from app.schemas.reports.widgets import DealsWonConfig
from app.services.reports._common import compute_previous_period


@dataclass(frozen=True)
class _Won:
    count: int
    value: Decimal


async def _won_in_window(
    session: AsyncSession,
    *,
    organization_id: UUID,
    org_currency: str,
    from_dt: datetime,
    to_dt: datetime,
    team_id: UUID | None,
    owner_user_id: UUID | None,
) -> _Won:
    stmt = (
        select(
            func.count(Deal.id),
            func.coalesce(func.sum(Deal.value), 0),
        )
        .join(Stage, Stage.id == Deal.stage_id)
        .where(Deal.organization_id == organization_id)
        .where(Stage.stage_type == StageType.won)
        .where(Deal.closed_at.is_not(None))
        .where(Deal.closed_at >= from_dt)
        .where(Deal.closed_at <= to_dt)
        .where(Deal.currency == org_currency)
    )
    if owner_user_id is not None:
        stmt = stmt.where(Deal.owner_user_id == owner_user_id)
    if team_id is not None:
        from app.db.models import User as _User

        stmt = stmt.join(_User, _User.id == Deal.owner_user_id).where(
            _User.team_id == team_id
        )
    count, value = (await session.execute(stmt)).one()
    return _Won(int(count or 0), Decimal(str(value or 0)))


async def compute_deals_won(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_: date,
    to: date,
    team_id: UUID | None,
    owner_user_id: UUID | None,
    config: DealsWonConfig,  # noqa: ARG001 — display handled in R6
) -> DealsWonResponse:
    org = await session.get(Organization, organization_id)
    if org is None:
        raise RuntimeError(f"organization {organization_id} not found")

    from_dt = datetime.combine(from_, time.min, tzinfo=timezone.utc)
    to_dt = datetime.combine(to, time.max, tzinfo=timezone.utc)
    cur = await _won_in_window(
        session,
        organization_id=organization_id,
        org_currency=org.currency,
        from_dt=from_dt,
        to_dt=to_dt,
        team_id=team_id,
        owner_user_id=owner_user_id,
    )

    prev = compute_previous_period(from_, to)
    prev_from_dt = datetime.combine(prev.from_, time.min, tzinfo=timezone.utc)
    prev_to_dt = datetime.combine(prev.to, time.max, tzinfo=timezone.utc)
    prev_w = await _won_in_window(
        session,
        organization_id=organization_id,
        org_currency=org.currency,
        from_dt=prev_from_dt,
        to_dt=prev_to_dt,
        team_id=team_id,
        owner_user_id=owner_user_id,
    )

    # Compare value (the headline number) for the delta. Frontend can
    # also surface count separately — `display` config picks which is
    # primary.
    delta_pct: float | None = None
    if prev_w.value > 0:
        delta_pct = float((cur.value - prev_w.value) / prev_w.value * 100)

    return DealsWonResponse(
        count=cur.count,
        value=cur.value,
        currency=org.currency,
        sparkline=[],
        comparison=Comparison(
            value=prev_w.value,
            delta_pct=delta_pct,
            previous_from=prev.from_,
            previous_to=prev.to,
        ),
    )
