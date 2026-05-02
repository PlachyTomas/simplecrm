"""`rep_activity` widget — new deals each rep added to pipeline.

REPORTS_TASK §4 widget #10. Pipeline-starvation early-warning. Bar
chart sorted descending by deals_added.
"""

from __future__ import annotations

from datetime import date, datetime, time, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Deal, User
from app.schemas.reports import RepActivityItem, RepActivityResponse
from app.schemas.reports.widgets import RepActivityConfig


async def compute_rep_activity(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_: date,
    to: date,
    team_id: UUID | None,
    owner_user_id: UUID | None,
    config: RepActivityConfig,  # noqa: ARG001 — no widget-specific knobs
) -> RepActivityResponse:
    from_dt = datetime.combine(from_, time.min, tzinfo=timezone.utc)
    to_dt = datetime.combine(to, time.max, tzinfo=timezone.utc)

    stmt = (
        select(User.id, User.name, func.count(Deal.id))
        .join(User, User.id == Deal.owner_user_id)
        .where(Deal.organization_id == organization_id)
        .where(Deal.created_at >= from_dt)
        .where(Deal.created_at <= to_dt)
        .group_by(User.id, User.name)
        .order_by(func.count(Deal.id).desc())
    )
    if owner_user_id is not None:
        stmt = stmt.where(Deal.owner_user_id == owner_user_id)
    if team_id is not None:
        stmt = stmt.where(User.team_id == team_id)
    rows = (await session.execute(stmt)).all()
    items = [
        RepActivityItem(
            user_id=uid,
            name=name or "—",
            deals_added=int(count or 0),
        )
        for uid, name, count in rows
    ]
    return RepActivityResponse(items=items)
