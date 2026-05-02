"""`win_rate` widget — won / (won + lost) × 100, in date range.

REPORTS_TASK §4 widget #4. Empty denominator returns `None` so the
frontend can render the `—` placeholder rather than a misleading 0%.
"""

from __future__ import annotations

from datetime import date, datetime, time, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Deal, Stage
from app.db.models.enums import StageType
from app.schemas.reports import Comparison, WinRateResponse
from app.schemas.reports.widgets import WinRateConfig
from app.services.reports._common import compute_previous_period


async def _counts_in_window(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_dt: datetime,
    to_dt: datetime,
    team_id: UUID | None,
    owner_user_id: UUID | None,
) -> tuple[int, int]:
    """Returns (won_count, lost_count) — closes within the window."""

    base = (
        select(func.count(Deal.id))
        .join(Stage, Stage.id == Deal.stage_id)
        .where(Deal.organization_id == organization_id)
        .where(Deal.closed_at.is_not(None))
        .where(Deal.closed_at >= from_dt)
        .where(Deal.closed_at <= to_dt)
    )
    if owner_user_id is not None:
        base = base.where(Deal.owner_user_id == owner_user_id)
    if team_id is not None:
        from app.db.models import User as _User

        base = base.join(_User, _User.id == Deal.owner_user_id).where(
            _User.team_id == team_id
        )
    won = (
        await session.execute(base.where(Stage.stage_type == StageType.won))
    ).scalar_one()
    lost = (
        await session.execute(base.where(Stage.stage_type == StageType.lost))
    ).scalar_one()
    return int(won or 0), int(lost or 0)


def _ratio(won: int, lost: int) -> float | None:
    denom = won + lost
    if denom == 0:
        return None
    return round(won / denom * 100, 1)


async def compute_win_rate(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_: date,
    to: date,
    team_id: UUID | None,
    owner_user_id: UUID | None,
    config: WinRateConfig,  # noqa: ARG001 — no widget-specific knobs
) -> WinRateResponse:
    from_dt = datetime.combine(from_, time.min, tzinfo=timezone.utc)
    to_dt = datetime.combine(to, time.max, tzinfo=timezone.utc)
    won, lost = await _counts_in_window(
        session,
        organization_id=organization_id,
        from_dt=from_dt,
        to_dt=to_dt,
        team_id=team_id,
        owner_user_id=owner_user_id,
    )
    cur_value = _ratio(won, lost)

    prev = compute_previous_period(from_, to)
    prev_from_dt = datetime.combine(prev.from_, time.min, tzinfo=timezone.utc)
    prev_to_dt = datetime.combine(prev.to, time.max, tzinfo=timezone.utc)
    prev_won, prev_lost = await _counts_in_window(
        session,
        organization_id=organization_id,
        from_dt=prev_from_dt,
        to_dt=prev_to_dt,
        team_id=team_id,
        owner_user_id=owner_user_id,
    )
    prev_value = _ratio(prev_won, prev_lost)

    # Delta in absolute percentage points (same units as the value
    # itself), not a percentage of a percentage. This matches what users
    # mentally subtract: "we went from 41% to 47%, +6pp."
    delta_pct: float | None = None
    if cur_value is not None and prev_value is not None:
        delta_pct = round(cur_value - prev_value, 1)

    return WinRateResponse(
        value=cur_value,
        won_count=won,
        lost_count=lost,
        comparison=Comparison(
            value=prev_value if prev_value is not None else 0,
            delta_pct=delta_pct,
            previous_from=prev.from_,
            previous_to=prev.to,
        ),
    )
