"""Centralized activity-log writer.

Every user-visible event is recorded through :func:`record_activity` so the
`company_id` fan-up (which powers the comprehensive company timeline) is set
consistently. The helper only *adds* to the session — the caller commits as
part of its own unit of work.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Activity, ActivityEntityType, ActivityType


def record_activity(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    entity_type: ActivityEntityType,
    entity_id: uuid.UUID,
    activity_type: ActivityType,
    company_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    payload: dict[str, Any] | None = None,
) -> Activity:
    """Stage an :class:`Activity` row on ``session`` (does NOT commit).

    ``company_id`` is the parent company so the company timeline can surface a
    deal's / event's / email's activity alongside the company's own — pass it
    for every non-org-level event.
    """
    activity = Activity(
        organization_id=organization_id,
        entity_type=entity_type,
        entity_id=entity_id,
        company_id=company_id,
        user_id=user_id,
        activity_type=activity_type,
        payload=payload or {},
    )
    session.add(activity)
    return activity
