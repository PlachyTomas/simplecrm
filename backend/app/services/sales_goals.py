"""Turn stored `sales_goals` rows into progress, without a second
definition of "won".

Actuals come from `services.reports.deals_won.won_in_window` — the same
function the `deals_won` report widget calls — so a goal card and the report
next to it can never disagree about what counts as a win or when it happened
(`Deal.closed_at`, a `won`-type stage, org currency).
"""

from __future__ import annotations

import calendar
from datetime import UTC, date, datetime, time
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import SalesGoal, SalesGoalMetric
from app.schemas.sales_goal import SalesGoalProgress
from app.services.reports.deals_won import won_in_window


def month_bounds(period_month: date) -> tuple[datetime, datetime]:
    """`[first instant, last instant]` of the month `period_month` sits in."""

    first = period_month.replace(day=1)
    last = first.replace(day=calendar.monthrange(first.year, first.month)[1])
    return (
        datetime.combine(first, time.min, tzinfo=UTC),
        datetime.combine(last, time.max, tzinfo=UTC),
    )


async def compute_progress(
    session: AsyncSession,
    goals: list[SalesGoal],
    *,
    organization_id: UUID,
    org_currency: str,
    user_names: dict[UUID, str],
) -> list[SalesGoalProgress]:
    """Attach an actual + percentage to each goal.

    One `won_in_window` query per distinct (month, owner) pair rather than per
    goal, so an org with both a `won_value` and a `won_count` goal for the same
    person in the same month costs one query, not two.
    """

    cache: dict[tuple[date, UUID | None], tuple[int, Decimal]] = {}
    out: list[SalesGoalProgress] = []

    for goal in goals:
        key = (goal.period_month, goal.user_id)
        if key not in cache:
            from_dt, to_dt = month_bounds(goal.period_month)
            won = await won_in_window(
                session,
                organization_id=organization_id,
                org_currency=org_currency,
                from_dt=from_dt,
                to_dt=to_dt,
                team_id=None,
                owner_user_id=goal.user_id,
            )
            cache[key] = (won.count, won.value)
        count, value = cache[key]

        actual = Decimal(count) if goal.metric is SalesGoalMetric.won_count else value
        target = goal.target_value
        pct = float(actual / target * 100) if target > 0 else 0.0

        out.append(
            SalesGoalProgress(
                id=goal.id,
                user_id=goal.user_id,
                user_name=user_names.get(goal.user_id) if goal.user_id else None,
                period_month=goal.period_month,
                metric=goal.metric,
                target_value=target,
                actual_value=actual,
                progress_pct=pct,
                currency=org_currency,
                created_at=goal.created_at,
                updated_at=goal.updated_at,
            )
        )
    return out
