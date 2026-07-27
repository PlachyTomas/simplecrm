"""One definition of "when did this deal last move".

Two surfaces answer the same question and must never disagree:

- the `stale_deals` report widget (`services/reports/stale_deals.py`), and
- the pipeline board's rotting badge (`api/v1/pipelines.py`).

So the SQL that derives a deal's last stage change, and the day-count that
falls out of it, live here exactly once. "Last move" is the most recent
`stage_change` activity for the deal; a deal that has never been moved falls
back to its own `updated_at` (the only always-present signal that the row was
touched at all).
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import Subquery, func, select

from app.db.models import Activity, ActivityEntityType, ActivityType


def last_stage_change_subquery() -> Subquery:
    """`deal_id → max(Activity.created_at)` over `stage_change` rows.

    LEFT JOIN this onto a deal query: `last_change_at` comes back NULL for a
    deal that has never changed stage. Grouped once for the whole result set,
    so joining it never costs a per-row query.
    """

    return (
        select(
            Activity.entity_id.label("deal_id"),
            func.max(Activity.created_at).label("last_change_at"),
        )
        .where(Activity.entity_type == ActivityEntityType.deal)
        .where(Activity.activity_type == ActivityType.stage_change)
        .group_by(Activity.entity_id)
        .subquery()
    )


def days_since_last_move(
    last_change_at: datetime | None,
    fallback: datetime,
    *,
    now: datetime | None = None,
) -> int:
    """Whole days since the deal last moved.

    `last_change_at` is the joined value from `last_stage_change_subquery`;
    `fallback` is the deal's `updated_at`, used when the deal has never
    changed stage. Clamped at 0 so clock skew can never produce a negative
    "days without movement".
    """

    anchor = last_change_at or fallback
    return max(0, ((now or datetime.now(tz=UTC)) - anchor).days)
