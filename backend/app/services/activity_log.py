"""Centralized activity-log writer.

Every user-visible event is recorded through :func:`record_activity` so the
`company_id` fan-up (which powers the comprehensive company timeline) is set
consistently. The helper only *adds* to the session — the caller commits as
part of its own unit of work.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Activity,
    ActivityEntityType,
    ActivityType,
    Company,
    Contact,
    Stage,
    User,
)


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


async def _name_map(
    session: AsyncSession,
    model: Any,
    ids: set[uuid.UUID],
    name_fn: Any,
) -> dict[uuid.UUID, str]:
    """Batch-resolve a set of row ids to display names in a single query."""
    if not ids:
        return {}
    rows = (await session.execute(select(model).where(model.id.in_(list(ids))))).scalars().all()
    return {row.id: name_fn(row) for row in rows}


async def resolve_field_changes(
    session: AsyncSession,
    raw: dict[str, tuple[Any, Any]],
    *,
    user_fields: frozenset[str] = frozenset(),
    stage_fields: frozenset[str] = frozenset(),
    contact_fields: frozenset[str] = frozenset(),
    company_fields: frozenset[str] = frozenset(),
) -> dict[str, dict[str, str | None]]:
    """Render ``{field: (old, new)}`` raw column values into a display-ready
    ``{field: {"from": str|None, "to": str|None}}`` map for an activity payload.

    FK ids are resolved to human names (owner→user name, stage→stage name,
    contact→"First Last", company→company name); dates become ISO strings and
    ``Decimal`` becomes ``str``. ``None`` stays ``None``; an id whose row was
    deleted since resolves to ``None`` rather than leaking a bare UUID. All FK
    lookups are batched (one query per model), so there is no N+1.
    """
    user_ids: set[uuid.UUID] = set()
    stage_ids: set[uuid.UUID] = set()
    contact_ids: set[uuid.UUID] = set()
    company_ids: set[uuid.UUID] = set()
    for field, values in raw.items():
        for val in values:
            if val is None:
                continue
            if field in user_fields:
                user_ids.add(val)
            elif field in stage_fields:
                stage_ids.add(val)
            elif field in contact_fields:
                contact_ids.add(val)
            elif field in company_fields:
                company_ids.add(val)

    users = await _name_map(session, User, user_ids, lambda u: u.name)
    stages = await _name_map(session, Stage, stage_ids, lambda s: s.name)
    contacts = await _name_map(
        session, Contact, contact_ids, lambda c: f"{c.first_name} {c.last_name}".strip()
    )
    companies = await _name_map(session, Company, company_ids, lambda c: c.name)

    def render(field: str, val: Any) -> str | None:
        if val is None:
            return None
        if field in user_fields:
            return users.get(val)
        if field in stage_fields:
            return stages.get(val)
        if field in contact_fields:
            return contacts.get(val)
        if field in company_fields:
            return companies.get(val)
        # datetime is a subclass of date — check it first.
        if isinstance(val, datetime):
            return val.isoformat()
        if isinstance(val, date):
            return val.isoformat()
        if isinstance(val, Decimal):
            # Normalize so "50000.00" (DB) and "50000" (fresh input) render
            # identically in the timeline's old → new pairs.
            normalized = val.normalize()
            return str(normalized.quantize(1) if normalized == normalized.to_integral_value() else normalized)
        return str(val)

    return {
        field: {"from": render(field, old), "to": render(field, new)}
        for field, (old, new) in raw.items()
    }
