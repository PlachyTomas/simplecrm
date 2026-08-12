"""The activity timeline: a read view, plus edits to its hand-written half.

Most rows here are written by other endpoints (deal stage_change, deal_won,
deal_lost, owner_change, …) and are audit trail — this module never lets them
change. The manual types (`MANUAL_ACTIVITY_TYPES`) are the user's own log of
what they did, so `PATCH` and `DELETE` cover those, guarded to the author or
an org admin.

The Company detail's "Aktivita" tab and the deal's "Průběh" section both
consume the list view, each asking for its own `activity_types` slice.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user
from app.db import get_db
from app.db.models import Activity, EventLabel, User, UserRole
from app.db.models.enums import ActivityEntityType, ActivityType
from app.schemas.activity import ActivityOut, ActivityUpdate
from app.schemas.event_label import EventLabelBrief
from app.schemas.pagination import Page, PaginationParams
from app.services.activity_log import MANUAL_ACTIVITY_TYPES

router = APIRouter(prefix="/activities", tags=["activities"])


def _can_edit(activity: Activity, user: User) -> bool:
    """Manual entries only, and only for their author or an org admin.

    A row whose author was deleted (`user_id` NULL) is admin-only — nobody
    else can claim to have written it.
    """
    if activity.activity_type not in MANUAL_ACTIVITY_TYPES:
        return False
    if user.role is UserRole.admin:
        return True
    return activity.user_id is not None and activity.user_id == user.id


def _label_brief(label: EventLabel | None) -> EventLabelBrief | None:
    """Snapshot a label row into a plain schema object.

    Built field by field rather than with `model_validate`: `EventLabelBrief`
    is a plain `BaseModel` with no `from_attributes`, so handing it an ORM row
    is a ValidationError. Same construction as `events._label_briefs`.
    """
    if label is None:
        return None
    return EventLabelBrief(id=label.id, name=label.name, color=label.color)


def _activity_out(activity: Activity, user: User) -> ActivityOut:
    """Serialize a row for the timeline.

    Field by field rather than `model_validate(activity)`, because that walks
    into `activity.label` and tries to validate an ORM row as an
    `EventLabelBrief`. `user` and `label` must already be eager-loaded —
    reading either after a commit would raise MissingGreenlet.
    """
    return ActivityOut(
        id=activity.id,
        organization_id=activity.organization_id,
        entity_type=activity.entity_type,
        entity_id=activity.entity_id,
        user_id=activity.user_id,
        user_name=activity.user.name if activity.user else None,
        activity_type=activity.activity_type,
        payload=activity.payload,
        created_at=activity.created_at,
        occurred_at=activity.occurred_at,
        label=_label_brief(activity.label),
        can_edit=_can_edit(activity, user),
    )


@router.get("", response_model=Page[ActivityOut])
async def list_activities(
    pagination: PaginationParams = Depends(),
    entity_type: ActivityEntityType | None = Query(default=None),
    entity_id: uuid.UUID | None = Query(default=None),
    company_id: uuid.UUID | None = Query(
        default=None,
        description=(
            "Fan-up filter: returns everything logged against this company AND its "
            "deals/events/emails. Powers the company detail's Aktivita timeline."
        ),
    ),
    activity_types: list[ActivityType] | None = Query(
        default=None,
        description=(
            "Repeatable. Restricts the feed to these activity types — the deal "
            "timeline asks for manual entries plus pipeline movements, the "
            "company tab for deal created/won/lost. Omit for everything."
        ),
    ),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Page[ActivityOut]:
    base = select(Activity).where(Activity.organization_id == user.organization_id)
    if entity_type is not None:
        base = base.where(Activity.entity_type == entity_type)
    if entity_id is not None:
        base = base.where(Activity.entity_id == entity_id)
    if company_id is not None:
        base = base.where(Activity.company_id == company_id)
    if activity_types:
        base = base.where(Activity.activity_type.in_(activity_types))
    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await session.execute(count_stmt)).scalar_one()

    # selectinload the actor and the kind label so `user_name` / `label` are
    # populated in two extra queries for the whole page rather than per row.
    #
    # Order by when it happened, not when it was written: a backdated manual
    # entry has to drop into its real place. `created_at` breaks the tie so
    # rows sharing an `occurred_at` (every automatic row, and any two entries
    # logged for the same minute) still come back in a stable order.
    items_stmt = (
        base.options(selectinload(Activity.user), selectinload(Activity.label))
        .order_by(Activity.occurred_at.desc(), Activity.created_at.desc())
        .limit(pagination.limit)
        .offset(pagination.offset)
    )
    items = (await session.execute(items_stmt)).scalars().all()
    return Page[ActivityOut](
        items=[_activity_out(a, user) for a in items],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


async def _get_editable(session: AsyncSession, user: User, activity_id: uuid.UUID) -> Activity:
    """Load a manual activity the caller is allowed to change, or raise.

    404 for anything outside the caller's org (never confirm that an id
    exists elsewhere), 403 for an automatic row or someone else's entry.
    """
    activity = (
        await session.execute(
            select(Activity)
            .options(selectinload(Activity.user), selectinload(Activity.label))
            .where(
                Activity.id == activity_id,
                Activity.organization_id == user.organization_id,
            )
        )
    ).scalar_one_or_none()
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")
    if activity.activity_type not in MANUAL_ACTIVITY_TYPES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only manually logged actions can be edited",
        )
    if not _can_edit(activity, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the author or an admin can change this entry",
        )
    return activity


@router.patch("/{activity_id}", response_model=ActivityOut)
async def update_activity(
    activity_id: uuid.UUID,
    payload: ActivityUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ActivityOut:
    """Edit a hand-logged entry after the fact — the timeline is a record the
    user maintains, not an append-only log."""
    activity = await _get_editable(session, user, activity_id)
    # `model_fields_set` is what separates "clear this" from "leave it alone";
    # a plain `is None` check cannot tell `{"label_id": null}` from `{}`.
    fields = payload.model_fields_set

    if "occurred_at" in fields:
        if payload.occurred_at is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="occurred_at cannot be cleared",
            )
        activity.occurred_at = payload.occurred_at

    if "label_id" in fields:
        if payload.label_id is None:
            activity.label_id = None
        else:
            label = (
                await session.execute(
                    select(EventLabel).where(
                        EventLabel.id == payload.label_id,
                        EventLabel.organization_id == user.organization_id,
                    )
                )
            ).scalar_one_or_none()
            if label is None:
                # 422 rather than 404: a foreign label id must not be
                # distinguishable from a nonexistent one, or the name leaks.
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Unknown label",
                )
            activity.label_id = label.id

    if "body" in fields:
        # JSONB is mutated by replacement — SQLAlchemy won't see an in-place
        # dict edit without flag_modified, so rebuild the dict.
        updated = dict(activity.payload or {})
        if payload.body is None:
            updated.pop("note", None)
        else:
            updated["note"] = payload.body
        activity.payload = updated

    await session.commit()
    await session.refresh(activity, attribute_names=["label", "user"])
    return _activity_out(activity, user)


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_activity(
    activity_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> None:
    """Remove a hand-logged entry. Automatic rows are never deletable."""
    activity = await _get_editable(session, user, activity_id)
    await session.delete(activity)
    await session.commit()
