"""`deals_without_next_step` widget — open deals with no upcoming event.

Activity-based selling's leading indicator: a deal without a planned next
step is where follow-up silently dies (research:
docs/research/2026-07-31-crm-user-wants-research.md). "Upcoming event" =
a calendar event bound to the deal whose `ends_at` is still in the
future — the same rule the pipeline board's `next_event_at` uses, so the
widget and the card badge can't disagree.

Up to 20 rows, most-neglected first (days since last stage change, the
number the rotting badge shows); `total` carries the uncapped count so
the widget can say "…a dalších N".
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CalendarEvent, Company, Deal, Stage, User
from app.db.models.enums import StageType
from app.schemas.reports import DealsWithoutNextStepResponse, StaleDealItem
from app.services.deal_staleness import days_since_last_move, last_stage_change_subquery

MAX_ROWS = 20


async def compute_deals_without_next_step(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_: date,
    to: date,
    team_id: UUID | None,
    owner_user_id: UUID | None,
) -> DealsWithoutNextStepResponse:
    # `from_`/`to` are part of the shared widget-endpoint signature but a
    # "right now" snapshot has no window — accepted and ignored, exactly
    # like the board's own next-step derivation.
    del from_, to

    now = datetime.now(tz=UTC)
    next_event_subq = (
        select(
            CalendarEvent.deal_id.label("deal_id"),
            func.min(CalendarEvent.starts_at).label("next_event_at"),
        )
        .where(CalendarEvent.deal_id.is_not(None), CalendarEvent.ends_at >= now)
        .group_by(CalendarEvent.deal_id)
        .subquery()
    )
    last_change_subq = last_stage_change_subquery()

    stmt = (
        select(Deal, Stage, Company, User, last_change_subq.c.last_change_at)
        .join(Stage, Stage.id == Deal.stage_id)
        .join(Company, Company.id == Deal.company_id)
        .join(User, User.id == Deal.owner_user_id, isouter=True)
        .join(last_change_subq, last_change_subq.c.deal_id == Deal.id, isouter=True)
        .join(next_event_subq, next_event_subq.c.deal_id == Deal.id, isouter=True)
        .where(Deal.organization_id == organization_id)
        .where(Stage.stage_type == StageType.open)
        .where(Deal.closed_at.is_(None))
        .where(next_event_subq.c.next_event_at.is_(None))
    )
    if owner_user_id is not None:
        stmt = stmt.where(Deal.owner_user_id == owner_user_id)
    if team_id is not None:
        stmt = stmt.where(User.team_id == team_id)
    rows = (await session.execute(stmt)).all()

    items: list[StaleDealItem] = []
    for deal, stage, company, owner, last_change_at in rows:
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
                days_since_change=days_since_last_move(last_change_at, deal.updated_at, now=now),
            )
        )
    items.sort(key=lambda i: i.days_since_change, reverse=True)
    total = len(items)
    return DealsWithoutNextStepResponse(items=items[:MAX_ROWS], total=total)
