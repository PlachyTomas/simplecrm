"""`pipeline_value` widget — sum of open deal values in the date range.

Per REPORTS_TASK §4 widget #1: sum of `Deal.value` where
`stage.stage_type='open'` AND the deal owner matches the filter scope.
Date range filters by `Deal.created_at`.

We compare against the previous-equal-length window: same query with
shifted dates so the frontend can render a delta without a second
request.
"""

from __future__ import annotations

from datetime import date, datetime, time, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Deal, Organization, Stage
from app.db.models.enums import StageType
from app.schemas.reports import (
    Comparison,
    PipelineValueResponse,
)
from app.schemas.reports.widgets import PipelineValueConfig
from app.services.reports._common import compute_previous_period


async def _sum_open_value(
    session: AsyncSession,
    *,
    organization_id: UUID,
    org_currency: str,
    from_dt: datetime,
    to_dt: datetime,
    team_id: UUID | None,
    owner_user_id: UUID | None,
) -> Decimal:
    """Sum of open deal values created in the window. Cross-currency deals
    are excluded — the org's currency is the only one we report in here.
    """

    stmt = (
        select(func.coalesce(func.sum(Deal.value), 0))
        .join(Stage, Stage.id == Deal.stage_id)
        .where(Deal.organization_id == organization_id)
        .where(Stage.stage_type == StageType.open)
        .where(Deal.created_at >= from_dt)
        .where(Deal.created_at <= to_dt)
        .where(Deal.currency == org_currency)
    )
    if owner_user_id is not None:
        stmt = stmt.where(Deal.owner_user_id == owner_user_id)
    if team_id is not None:
        from app.db.models import User as _User
        stmt = stmt.join(_User, _User.id == Deal.owner_user_id).where(
            _User.team_id == team_id
        )
    result = await session.execute(stmt)
    return Decimal(str(result.scalar_one() or 0))


async def compute_pipeline_value(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_: date,
    to: date,
    team_id: UUID | None,
    owner_user_id: UUID | None,
    config: PipelineValueConfig,  # noqa: ARG001 — group_by handled in R6
) -> PipelineValueResponse:
    org = await session.get(Organization, organization_id)
    if org is None:
        raise RuntimeError(f"organization {organization_id} not found")

    from_dt = datetime.combine(from_, time.min, tzinfo=timezone.utc)
    to_dt = datetime.combine(to, time.max, tzinfo=timezone.utc)
    value = await _sum_open_value(
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
    prev_value = await _sum_open_value(
        session,
        organization_id=organization_id,
        org_currency=org.currency,
        from_dt=prev_from_dt,
        to_dt=prev_to_dt,
        team_id=team_id,
        owner_user_id=owner_user_id,
    )

    delta_pct: float | None = None
    if prev_value > 0:
        delta_pct = float((value - prev_value) / prev_value * 100)

    return PipelineValueResponse(
        value=value,
        currency=org.currency,
        sparkline=[],
        comparison=Comparison(
            value=prev_value,
            delta_pct=delta_pct,
            previous_from=prev.from_,
            previous_to=prev.to,
        ),
    )
