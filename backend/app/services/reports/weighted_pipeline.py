"""`weighted_pipeline` widget — probability-weighted open pipeline value.

Same scoping as `pipeline_value` (open stage, org currency, created_at
in window, team/owner filters) so the two tiles pair 1:1 and weighted
≤ unweighted always holds. The weight per deal is
`probability_override ?? Stage.default_probability`, in percent.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Numeric, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Deal, Organization, Stage
from app.db.models.enums import StageType
from app.schemas.reports import Comparison, WeightedPipelineResponse
from app.schemas.reports.widgets import WeightedPipelineConfig
from app.services.reports._common import compute_previous_period


async def _sums(
    session: AsyncSession,
    *,
    organization_id: UUID,
    org_currency: str,
    from_dt: datetime,
    to_dt: datetime,
    team_id: UUID | None,
    owner_user_id: UUID | None,
) -> tuple[Decimal, Decimal]:
    """(weighted, unweighted) sums of open deal values in the window."""

    probability = func.coalesce(Deal.probability_override, Stage.default_probability)
    weighted = Deal.value * cast(probability, Numeric) / 100
    stmt = (
        select(
            func.coalesce(func.sum(weighted), 0),
            func.coalesce(func.sum(Deal.value), 0),
        )
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

        stmt = stmt.join(_User, _User.id == Deal.owner_user_id).where(_User.team_id == team_id)
    row = (await session.execute(stmt)).one()
    return Decimal(str(row[0] or 0)), Decimal(str(row[1] or 0))


async def compute_weighted_pipeline(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_: date,
    to: date,
    team_id: UUID | None,
    owner_user_id: UUID | None,
    config: WeightedPipelineConfig,
) -> WeightedPipelineResponse:
    org = await session.get(Organization, organization_id)
    if org is None:
        raise RuntimeError(f"organization {organization_id} not found")

    from_dt = datetime.combine(from_, time.min, tzinfo=UTC)
    to_dt = datetime.combine(to, time.max, tzinfo=UTC)
    value, open_value = await _sums(
        session,
        organization_id=organization_id,
        org_currency=org.currency,
        from_dt=from_dt,
        to_dt=to_dt,
        team_id=team_id,
        owner_user_id=owner_user_id,
    )

    prev = compute_previous_period(from_, to)
    prev_value, _ = await _sums(
        session,
        organization_id=organization_id,
        org_currency=org.currency,
        from_dt=datetime.combine(prev.from_, time.min, tzinfo=UTC),
        to_dt=datetime.combine(prev.to, time.max, tzinfo=UTC),
        team_id=team_id,
        owner_user_id=owner_user_id,
    )

    delta_pct: float | None = None
    if prev_value > 0:
        delta_pct = float((value - prev_value) / prev_value * 100)

    return WeightedPipelineResponse(
        value=value,
        open_value=open_value,
        currency=org.currency,
        comparison=Comparison(
            value=prev_value,
            delta_pct=delta_pct,
            previous_from=prev.from_,
            previous_to=prev.to,
        ),
    )
