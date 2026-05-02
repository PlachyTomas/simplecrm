"""`lost_reasons_breakdown` widget — counts/value of lost-deal reasons.

REPORTS_TASK §4 widget #8. Sorted descending; long tail (>6 reasons)
collapses to "Ostatní". Sort axis selectable via `display`
(count of deals or summed lost value).
"""

from __future__ import annotations

from datetime import date, datetime, time, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Deal, Organization, Stage, User
from app.db.models.enums import StageType
from app.schemas.reports import LostReasonItem, LostReasonsBreakdownResponse
from app.schemas.reports.widgets import LostReasonsBreakdownConfig

MAX_VISIBLE_REASONS = 6
OTHER_LABEL = "Ostatní"


async def compute_lost_reasons_breakdown(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_: date,
    to: date,
    team_id: UUID | None,
    owner_user_id: UUID | None,
    config: LostReasonsBreakdownConfig,
) -> LostReasonsBreakdownResponse:
    org = await session.get(Organization, organization_id)
    if org is None:
        raise RuntimeError(f"organization {organization_id} not found")

    from_dt = datetime.combine(from_, time.min, tzinfo=timezone.utc)
    to_dt = datetime.combine(to, time.max, tzinfo=timezone.utc)

    stmt = (
        select(
            Deal.lost_reason,
            func.count(Deal.id),
            func.coalesce(func.sum(Deal.value), 0),
        )
        .join(Stage, Stage.id == Deal.stage_id)
        .where(Deal.organization_id == organization_id)
        .where(Stage.stage_type == StageType.lost)
        .where(Deal.closed_at.is_not(None))
        .where(Deal.closed_at >= from_dt)
        .where(Deal.closed_at <= to_dt)
        .where(Deal.lost_reason.is_not(None))
        .where(Deal.currency == org.currency)
        .group_by(Deal.lost_reason)
    )
    if owner_user_id is not None:
        stmt = stmt.where(Deal.owner_user_id == owner_user_id)
    if team_id is not None:
        stmt = stmt.join(User, User.id == Deal.owner_user_id).where(
            User.team_id == team_id
        )
    rows = (await session.execute(stmt)).all()

    items = [
        LostReasonItem(
            reason=str(reason),
            count=int(count or 0),
            value=Decimal(str(value or 0)),
        )
        for reason, count, value in rows
    ]
    if config.display == "value":
        items.sort(key=lambda i: i.value, reverse=True)
    else:
        items.sort(key=lambda i: i.count, reverse=True)

    # Long tail collapse — anything beyond MAX_VISIBLE_REASONS becomes
    # one synthesized "Ostatní" row at the bottom.
    if len(items) > MAX_VISIBLE_REASONS:
        head = items[: MAX_VISIBLE_REASONS - 1]
        tail = items[MAX_VISIBLE_REASONS - 1 :]
        head.append(
            LostReasonItem(
                reason=OTHER_LABEL,
                count=sum(i.count for i in tail),
                value=sum((i.value for i in tail), Decimal("0")),
            )
        )
        items = head

    total_count = sum(i.count for i in items)
    total_value = sum((i.value for i in items), Decimal("0"))
    return LostReasonsBreakdownResponse(
        items=items,
        total_count=total_count,
        total_value=total_value,
        currency=org.currency,
    )
