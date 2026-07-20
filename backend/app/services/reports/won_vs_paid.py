"""`won_vs_paid` widget — paid/unpaid split of deals won in the window.

Same scoping as `deals_won` (stage_type=won, closed_at in window, org
currency, team/owner filters). "Paid" is the pipeline's `is_paid`
checkbox; whether the payment landed inside the window doesn't matter —
the question is "of what we won here, how much is paid by now".
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time
from decimal import Decimal
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Deal, Organization, Stage
from app.db.models.enums import StageType
from app.schemas.reports import WonVsPaidResponse
from app.schemas.reports.widgets import WonVsPaidConfig


async def compute_won_vs_paid(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_: date,
    to: date,
    team_id: UUID | None,
    owner_user_id: UUID | None,
    config: WonVsPaidConfig,
) -> WonVsPaidResponse:
    org = await session.get(Organization, organization_id)
    if org is None:
        raise RuntimeError(f"organization {organization_id} not found")

    from_dt = datetime.combine(from_, time.min, tzinfo=UTC)
    to_dt = datetime.combine(to, time.max, tzinfo=UTC)

    paid_value = case((Deal.is_paid, Deal.value), else_=0)
    paid_count = case((Deal.is_paid, 1), else_=0)
    stmt = (
        select(
            func.count(Deal.id),
            func.coalesce(func.sum(Deal.value), 0),
            func.coalesce(func.sum(paid_count), 0),
            func.coalesce(func.sum(paid_value), 0),
        )
        .join(Stage, Stage.id == Deal.stage_id)
        .where(Deal.organization_id == organization_id)
        .where(Stage.stage_type == StageType.won)
        .where(Deal.closed_at >= from_dt)
        .where(Deal.closed_at <= to_dt)
        .where(Deal.currency == org.currency)
    )
    if owner_user_id is not None:
        stmt = stmt.where(Deal.owner_user_id == owner_user_id)
    if team_id is not None:
        from app.db.models import User as _User

        stmt = stmt.join(_User, _User.id == Deal.owner_user_id).where(_User.team_id == team_id)

    won_count, won_raw, paid_n, paid_raw = (await session.execute(stmt)).one()
    won_value = Decimal(str(won_raw or 0))
    paid_total = Decimal(str(paid_raw or 0))

    paid_pct: float | None = None
    if won_value > 0:
        paid_pct = float(paid_total / won_value * 100)

    return WonVsPaidResponse(
        won_count=won_count,
        paid_count=paid_n,
        won_value=won_value,
        paid_value=paid_total,
        unpaid_value=won_value - paid_total,
        paid_pct=paid_pct,
        currency=org.currency,
    )
