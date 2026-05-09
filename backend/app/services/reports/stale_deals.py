"""`stale_deals` widget — open deals with no stage change for ≥ N days.

REPORTS_TASK §4 widget #11. "Stage hasn't changed" = `Deal.updated_at`
is older than N days AND no Activity row of type `stage_change` for
that deal in the last N days.

Up to 20 rows. Sorted descending by days-since-last-stage-change.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Activity,
    ActivityEntityType,
    ActivityType,
    Company,
    Deal,
    Organization,
    Stage,
    User,
)
from app.db.models.enums import StageType
from app.schemas.reports import StaleDealItem, StaleDealsResponse
from app.schemas.reports.widgets import StaleDealsConfig

MAX_ROWS = 20


async def compute_stale_deals(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_: date,
    to: date,
    team_id: UUID | None,
    owner_user_id: UUID | None,
    config: StaleDealsConfig,
) -> StaleDealsResponse:
    org = await session.get(Organization, organization_id)
    if org is None:
        raise RuntimeError(f"organization {organization_id} not found")

    threshold = config.threshold
    cutoff = datetime.now(tz=UTC) - timedelta(days=threshold)

    # Per-deal "last stage change" timestamp: max(Activity.created_at)
    # where activity_type='stage_change' for that deal.
    last_change_subq = (
        select(
            Activity.entity_id.label("deal_id"),
            func.max(Activity.created_at).label("last_change_at"),
        )
        .where(Activity.entity_type == ActivityEntityType.deal)
        .where(Activity.activity_type == ActivityType.stage_change)
        .group_by(Activity.entity_id)
        .subquery()
    )

    stmt = (
        select(
            Deal,
            Stage,
            Company,
            User,
            last_change_subq.c.last_change_at,
        )
        .join(Stage, Stage.id == Deal.stage_id)
        .join(Company, Company.id == Deal.company_id)
        .join(User, User.id == Deal.owner_user_id, isouter=True)
        .join(
            last_change_subq,
            last_change_subq.c.deal_id == Deal.id,
            isouter=True,
        )
        .where(Deal.organization_id == organization_id)
        .where(Stage.stage_type == StageType.open)
        .where(Deal.closed_at.is_(None))
        # No stage_change activity in the last `threshold` days. Either
        # there's never been one (NULL from outer join) or the most
        # recent one is older than the cutoff.
        .where(
            (last_change_subq.c.last_change_at.is_(None))
            | (last_change_subq.c.last_change_at < cutoff)
        )
        # AND Deal.updated_at is also older than the cutoff. Together
        # these prevent "I just edited the description" from masking a
        # truly stale deal.
        .where(Deal.updated_at < cutoff)
    )
    if owner_user_id is not None:
        stmt = stmt.where(Deal.owner_user_id == owner_user_id)
    if team_id is not None:
        stmt = stmt.where(User.team_id == team_id)
    rows = (await session.execute(stmt)).all()

    items: list[StaleDealItem] = []
    now = datetime.now(tz=UTC)
    for deal, stage, company, owner, last_change_at in rows:
        # Days since the most recent signal (last_change_at if present,
        # else updated_at).
        anchor = last_change_at or deal.updated_at
        days = (now - anchor).days
        items.append(
            StaleDealItem(
                deal_id=deal.id,
                deal_name=deal.name,
                company_id=company.id,
                company_name=company.name,
                stage_name=stage.name,
                value=deal.value,
                currency=deal.currency,
                owner_user_id=owner.id if owner is not None else None,
                owner_name=owner.name if owner is not None else "—",
                days_since_change=days,
            )
        )
    items.sort(key=lambda i: i.days_since_change, reverse=True)
    items = items[:MAX_ROWS]
    return StaleDealsResponse(items=items, threshold_days=threshold)
