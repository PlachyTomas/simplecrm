"""Org-shared calendar event labels (`/api/v1/event-labels`).

Everyone reads, and everyone may *create* — a salesperson typing a new
label inline in the event form is the whole point of the feature. Renaming,
recoloring and deleting are admin-only: those edit shared vocabulary that
already sits on other people's events.

Scoped to the caller's organization; a row belonging to another org answers
404, never 403 — the house rule: don't confirm that an id exists outside
your tenant. Duplicate names are rejected case-insensitively by the
`uq_event_labels_org_name_lower` index and surface as 409.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db import get_db
from app.db.models import EventLabel, User, UserRole, calendar_event_labels
from app.schemas.event_label import EventLabelCreate, EventLabelOut, EventLabelUpdate

router = APIRouter(prefix="/event-labels", tags=["event-labels"])

_DUPLICATE_NAME = "Štítek s tímto názvem už existuje."


async def _usage_counts(
    session: AsyncSession, label_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, int]:
    """One grouped COUNT for the whole list — never a per-row query."""
    if not label_ids:
        return {}
    rows = (
        await session.execute(
            select(calendar_event_labels.c.label_id, func.count())
            .where(calendar_event_labels.c.label_id.in_(label_ids))
            .group_by(calendar_event_labels.c.label_id)
        )
    ).all()
    return {row[0]: row[1] for row in rows}


def _out(label: EventLabel, usage_count: int) -> EventLabelOut:
    return EventLabelOut(
        id=label.id,
        organization_id=label.organization_id,
        name=label.name,
        color=label.color,
        usage_count=usage_count,
    )


async def _get_owned(session: AsyncSession, user: User, label_id: uuid.UUID) -> EventLabel:
    row = (
        await session.execute(
            select(EventLabel).where(
                EventLabel.id == label_id,
                EventLabel.organization_id == user.organization_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Label not found")
    return row


@router.get("", response_model=list[EventLabelOut])
async def list_event_labels(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> list[EventLabelOut]:
    """Every label in the caller's org, alphabetically. Not paginated: an
    org's label vocabulary is a picker, not a data set."""
    labels = list(
        (
            await session.execute(
                select(EventLabel)
                .where(EventLabel.organization_id == user.organization_id)
                .order_by(EventLabel.name)
            )
        )
        .scalars()
        .all()
    )
    counts = await _usage_counts(session, [label.id for label in labels])
    return [_out(label, counts.get(label.id, 0)) for label in labels]


@router.post("", response_model=EventLabelOut, status_code=status.HTTP_201_CREATED)
async def create_event_label(
    payload: EventLabelCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> EventLabelOut:
    """Any role — labels are created inline from the event form."""
    label = EventLabel(
        organization_id=user.organization_id,
        name=payload.name,
        color=payload.color,
    )
    session.add(label)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_DUPLICATE_NAME) from exc
    await session.refresh(label)
    return _out(label, 0)


@router.put("/{label_id}", response_model=EventLabelOut)
async def update_event_label(
    label_id: uuid.UUID,
    payload: EventLabelUpdate,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> EventLabelOut:
    """Admin only: a rename or recolor changes the label on every event in
    the org, so it isn't a per-user decision."""
    label = await _get_owned(session, user, label_id)
    fields = payload.model_dump(exclude_unset=True, exclude_none=True)
    for key, value in fields.items():
        setattr(label, key, value)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_DUPLICATE_NAME) from exc
    await session.refresh(label)
    counts = await _usage_counts(session, [label.id])
    return _out(label, counts.get(label.id, 0))


@router.delete("/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event_label(
    label_id: uuid.UUID,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> None:
    """Admin only. The join rows cascade — events keep their other labels."""
    label = await _get_owned(session, user, label_id)
    await session.delete(label)
    await session.commit()
