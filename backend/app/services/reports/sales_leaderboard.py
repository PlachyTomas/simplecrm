"""`sales_leaderboard` widget — reps ranked by a configurable metric.

REPORTS_TASK §4 widget #9. Metric is one of:
- `won_count` — count of closed-won deals in range
- `won_value` — sum of closed-won deal values (default)
- `win_rate` — won / (won + lost)
- `deals_added` — new deals created in range
"""

from __future__ import annotations

from datetime import date, datetime, time, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Deal, Organization, Stage, User
from app.db.models.enums import StageType
from app.schemas.reports import SalesLeaderboardItem, SalesLeaderboardResponse
from app.schemas.reports.widgets import SalesLeaderboardConfig


async def _count_in_window_per_owner(
    session: AsyncSession,
    *,
    organization_id: UUID,
    org_currency: str | None,
    from_dt: datetime,
    to_dt: datetime,
    team_id: UUID | None,
    owner_user_id: UUID | None,
    stage_type: StageType | None,
    sum_values: bool,
    use_closed_at: bool,
) -> dict[UUID, tuple[str, int, Decimal]]:
    """Returns {user_id: (name, count, value)}. `value` is zero when
    `sum_values=False`. The deals are filtered by stage_type and the
    closed-vs-created window per the caller's needs.
    """

    stmt = (
        select(
            User.id,
            User.name,
            func.count(Deal.id),
            func.coalesce(func.sum(Deal.value), 0),
        )
        .join(User, User.id == Deal.owner_user_id)
        .where(Deal.organization_id == organization_id)
        .group_by(User.id, User.name)
    )
    if stage_type is not None:
        stmt = stmt.join(Stage, Stage.id == Deal.stage_id).where(
            Stage.stage_type == stage_type
        )
    if use_closed_at:
        stmt = (
            stmt.where(Deal.closed_at.is_not(None))
            .where(Deal.closed_at >= from_dt)
            .where(Deal.closed_at <= to_dt)
        )
    else:
        stmt = stmt.where(Deal.created_at >= from_dt).where(
            Deal.created_at <= to_dt
        )
    if org_currency is not None and sum_values:
        stmt = stmt.where(Deal.currency == org_currency)
    if owner_user_id is not None:
        stmt = stmt.where(Deal.owner_user_id == owner_user_id)
    if team_id is not None:
        stmt = stmt.where(User.team_id == team_id)
    return {
        uid: (name, int(count or 0), Decimal(str(value or 0)))
        for uid, name, count, value in (await session.execute(stmt)).all()
    }


async def compute_sales_leaderboard(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_: date,
    to: date,
    team_id: UUID | None,
    owner_user_id: UUID | None,
    config: SalesLeaderboardConfig,
) -> SalesLeaderboardResponse:
    org = await session.get(Organization, organization_id)
    if org is None:
        raise RuntimeError(f"organization {organization_id} not found")
    from_dt = datetime.combine(from_, time.min, tzinfo=timezone.utc)
    to_dt = datetime.combine(to, time.max, tzinfo=timezone.utc)

    items: list[SalesLeaderboardItem] = []

    if config.metric == "won_count":
        won = await _count_in_window_per_owner(
            session,
            organization_id=organization_id,
            org_currency=None,
            from_dt=from_dt,
            to_dt=to_dt,
            team_id=team_id,
            owner_user_id=owner_user_id,
            stage_type=StageType.won,
            sum_values=False,
            use_closed_at=True,
        )
        items = [
            SalesLeaderboardItem(user_id=uid, name=name, metric_value=count)
            for uid, (name, count, _value) in won.items()
        ]
    elif config.metric == "won_value":
        won = await _count_in_window_per_owner(
            session,
            organization_id=organization_id,
            org_currency=org.currency,
            from_dt=from_dt,
            to_dt=to_dt,
            team_id=team_id,
            owner_user_id=owner_user_id,
            stage_type=StageType.won,
            sum_values=True,
            use_closed_at=True,
        )
        items = [
            SalesLeaderboardItem(user_id=uid, name=name, metric_value=value)
            for uid, (name, _count, value) in won.items()
        ]
    elif config.metric == "deals_added":
        added = await _count_in_window_per_owner(
            session,
            organization_id=organization_id,
            org_currency=None,
            from_dt=from_dt,
            to_dt=to_dt,
            team_id=team_id,
            owner_user_id=owner_user_id,
            stage_type=None,
            sum_values=False,
            use_closed_at=False,
        )
        items = [
            SalesLeaderboardItem(user_id=uid, name=name, metric_value=count)
            for uid, (name, count, _value) in added.items()
        ]
    else:  # win_rate
        won = await _count_in_window_per_owner(
            session,
            organization_id=organization_id,
            org_currency=None,
            from_dt=from_dt,
            to_dt=to_dt,
            team_id=team_id,
            owner_user_id=owner_user_id,
            stage_type=StageType.won,
            sum_values=False,
            use_closed_at=True,
        )
        lost = await _count_in_window_per_owner(
            session,
            organization_id=organization_id,
            org_currency=None,
            from_dt=from_dt,
            to_dt=to_dt,
            team_id=team_id,
            owner_user_id=owner_user_id,
            stage_type=StageType.lost,
            sum_values=False,
            use_closed_at=True,
        )
        all_uids = set(won) | set(lost)
        for uid in all_uids:
            wname, wcount, _ = won.get(uid, ("—", 0, Decimal("0")))
            lname, lcount, _ = lost.get(uid, (wname, 0, Decimal("0")))
            denom = wcount + lcount
            if denom == 0:
                continue
            items.append(
                SalesLeaderboardItem(
                    user_id=uid,
                    name=wname if wname != "—" else lname,
                    metric_value=round(wcount / denom * 100, 1),
                )
            )

    items.sort(
        key=lambda r: (
            r.metric_value if isinstance(r.metric_value, (int, float, Decimal)) else 0
        ),
        reverse=True,
    )
    return SalesLeaderboardResponse(items=items, metric=config.metric)
