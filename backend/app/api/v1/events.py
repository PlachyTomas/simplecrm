"""Deal calendar events — CRUD + optional one-way push to Google Calendar.

Local-first: the `calendar_events` row is the source of truth. A Google
API failure never loses a write — the event lands with
`google_sync_status=error` and the UI shows a warning. Google propagation
always runs through the **event owner's** connection (it's their calendar);
requesting `add_to_google` without a usable connection (missing or
`sync_broken`) never fails the CRM write — the event is saved and marked
`google_sync_status=error`, and the UI prompts a reconnect.

Visibility mirrors deals: `scope_by_owner` on `owner_user_id` (admins see
the whole org). Editing/deleting is restricted to the owner or an admin.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Sequence
from typing import Annotated, TypeGuard

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import AwareDatetime
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user
from app.core.scoping import scope_by_owner
from app.core.token_crypto import TokenDecryptError
from app.db import get_db
from app.db.models import (
    ActivityEntityType,
    ActivityType,
    CalendarEvent,
    Deal,
    EventLabel,
    GoogleCalendarConnection,
    GoogleSyncStatus,
    User,
    UserRole,
)
from app.schemas.calendar_event import (
    CalendarEventCreate,
    CalendarEventOut,
    CalendarEventUpdate,
)
from app.schemas.event_label import EventLabelBrief
from app.schemas.pagination import Page, PaginationParams
from app.services.activity_log import record_activity
from app.services.google_calendar import (
    GoogleCalendarClient,
    GoogleCalendarError,
    event_payload,
    get_google_calendar_client,
    get_valid_access_token,
)

router = APIRouter(prefix="/events", tags=["events"])


# Everything `_event_out` needs must be loaded up front: an async lazy-load
# after the commit raises MissingGreenlet.
_EVENT_LOADS = (
    selectinload(CalendarEvent.deal).selectinload(Deal.company),
    selectinload(CalendarEvent.labels),
)


def _label_briefs(labels: Iterable[EventLabel]) -> list[EventLabelBrief]:
    """Snapshot label rows into plain schema objects, name-ordered.

    Taking a copy is the point: the ORM collection is expired by the commit,
    and re-reading it would lazy-load. Sorting here (rather than trusting the
    relationship's `order_by`) also covers a freshly assigned collection.
    """
    return [
        EventLabelBrief(id=label.id, name=label.name, color=label.color)
        for label in sorted(labels, key=lambda label: label.name)
    ]


def _deal_display(deal: Deal | None) -> tuple[str | None, uuid.UUID | None, str | None]:
    """`(deal_name, company_id, company_name)` read while the deal — and its
    eager-loaded company — are still live. Events carry no company FK; the
    company is always the deal's, so a deal-less event has none."""
    if deal is None:
        return None, None, None
    return deal.name, deal.company_id, deal.company.name if deal.company else None


def _event_out(
    event: CalendarEvent,
    deal_name: str | None,
    *,
    company_id: uuid.UUID | None = None,
    company_name: str | None = None,
    labels: Sequence[EventLabelBrief] = (),
) -> CalendarEventOut:
    """`deal_name`, the company pair and `labels` are passed explicitly —
    accessing `event.deal` / `event.labels` after a commit can trigger an
    async lazy-load, which raises MissingGreenlet."""
    return CalendarEventOut(
        id=event.id,
        organization_id=event.organization_id,
        deal_id=event.deal_id,
        deal_name=deal_name,
        company_id=company_id,
        company_name=company_name,
        owner_user_id=event.owner_user_id,
        title=event.title,
        description=event.description,
        location=event.location,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        google_event_id=event.google_event_id,
        google_sync_status=event.google_sync_status,
        labels=list(labels),
        created_at=event.created_at,
        updated_at=event.updated_at,
    )


async def _get_visible_deal(session: AsyncSession, user: User, deal_id: uuid.UUID) -> Deal:
    base = (
        select(Deal)
        .where(
            Deal.organization_id == user.organization_id,
            Deal.id == deal_id,
        )
        # The company is part of the event payload (`company_id`/`company_name`).
        .options(selectinload(Deal.company))
    )
    scoped = await scope_by_owner(base, session=session, user=user, owner_col=Deal.owner_user_id)
    deal: Deal | None = (await session.execute(scoped)).scalar_one_or_none()
    if deal is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="deal_id does not exist in your organization",
        )
    return deal


async def _get_scoped_event(
    session: AsyncSession, user: User, event_id: uuid.UUID
) -> CalendarEvent:
    base = (
        select(CalendarEvent)
        .where(
            CalendarEvent.organization_id == user.organization_id,
            CalendarEvent.id == event_id,
        )
        .options(*_EVENT_LOADS)
    )
    scoped = await scope_by_owner(
        base, session=session, user=user, owner_col=CalendarEvent.owner_user_id
    )
    event: CalendarEvent | None = (await session.execute(scoped)).scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


async def _resolve_labels(
    session: AsyncSession, user: User, label_ids: Sequence[uuid.UUID]
) -> list[EventLabel]:
    """Label rows for `label_ids`, or 400 — same style as the deal_id check.

    Unknown ids and ids belonging to another organization are indistinguishable
    on purpose: an id outside the tenant must not be confirmed to exist.
    """
    if not label_ids:
        return []
    wanted = list(dict.fromkeys(label_ids))  # de-dupe, keep the request's order
    rows = list(
        (
            await session.execute(
                select(EventLabel).where(
                    EventLabel.organization_id == user.organization_id,
                    EventLabel.id.in_(wanted),
                )
            )
        )
        .scalars()
        .all()
    )
    if len(rows) != len(wanted):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="label_ids contains an id that does not exist in your organization",
        )
    return rows


def _assert_can_modify(user: User, event: CalendarEvent) -> None:
    """Owner or admin. Visibility (manager/teammate) grants read, not write —
    the Google copy lives in the owner's calendar, so edits are theirs."""
    if user.role is UserRole.admin or event.owner_user_id == user.id:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Only the event owner or an admin can modify an event",
    )


async def _owner_connection(
    session: AsyncSession, owner_user_id: uuid.UUID | None
) -> GoogleCalendarConnection | None:
    if owner_user_id is None:
        return None
    return (
        await session.execute(
            select(GoogleCalendarConnection).where(
                GoogleCalendarConnection.user_id == owner_user_id
            )
        )
    ).scalar_one_or_none()


def _google_body(event: CalendarEvent) -> dict[str, object]:
    return event_payload(
        title=event.title,
        description=event.description,
        location=event.location,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
    )


async def _sync_insert(
    session: AsyncSession,
    event: CalendarEvent,
    connection: GoogleCalendarConnection,
    client: GoogleCalendarClient,
) -> None:
    """Push a fresh Google copy. Failures mark the event `error` — never raise."""
    try:
        token = await get_valid_access_token(session, connection, client)
        event.google_event_id = (await client.insert_event(token, _google_body(event)))["id"]
        event.google_sync_status = GoogleSyncStatus.synced
    except (GoogleCalendarError, TokenDecryptError):
        event.google_sync_status = GoogleSyncStatus.error


async def _sync_patch(
    session: AsyncSession,
    event: CalendarEvent,
    connection: GoogleCalendarConnection,
    client: GoogleCalendarClient,
) -> None:
    """Propagate an edit. A vanished Google copy (deleted by the user in
    Google) is replaced by a fresh insert; other failures mark `error`."""
    if event.google_event_id is None:
        await _sync_insert(session, event, connection, client)
        return
    try:
        token = await get_valid_access_token(session, connection, client)
        await client.patch_event(token, event.google_event_id, _google_body(event))
        event.google_sync_status = GoogleSyncStatus.synced
    except (GoogleCalendarError, TokenDecryptError) as exc:
        if isinstance(exc, GoogleCalendarError) and exc.http_status == 404:
            event.google_event_id = None
            await _sync_insert(session, event, connection, client)
            return
        event.google_sync_status = GoogleSyncStatus.error


async def _sync_delete(
    session: AsyncSession,
    event: CalendarEvent,
    connection: GoogleCalendarConnection | None,
    client: GoogleCalendarClient,
) -> None:
    """Best-effort removal of the Google copy."""
    if connection is None or event.google_event_id is None:
        return
    try:
        token = await get_valid_access_token(session, connection, client)
        await client.delete_event(token, event.google_event_id)
    except (GoogleCalendarError, TokenDecryptError):
        pass


def _connection_usable(
    connection: GoogleCalendarConnection | None,
) -> TypeGuard[GoogleCalendarConnection]:
    """A connection can carry a Google push only when it exists and its
    grant is still live. A missing or `sync_broken` connection degrades the
    write to `google_sync_status=error` rather than failing it — the CRM
    record is never held hostage to Google's state. Typed as a `TypeGuard`
    so callers get the non-`None` narrowing in the truthy branch."""
    return connection is not None and not connection.sync_broken


@router.get("", response_model=Page[CalendarEventOut])
async def list_events(
    pagination: PaginationParams = Depends(),
    from_: Annotated[AwareDatetime | None, Query(alias="from")] = None,
    to: Annotated[AwareDatetime | None, Query()] = None,
    deal_id: uuid.UUID | None = Query(default=None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Page[CalendarEventOut]:
    """Events overlapping [from, to), soonest first."""
    base = (
        select(CalendarEvent)
        .where(CalendarEvent.organization_id == user.organization_id)
        .options(*_EVENT_LOADS)
    )
    if from_ is not None:
        base = base.where(CalendarEvent.ends_at > from_)
    if to is not None:
        base = base.where(CalendarEvent.starts_at < to)
    if deal_id is not None:
        base = base.where(CalendarEvent.deal_id == deal_id)
    scoped = await scope_by_owner(
        base, session=session, user=user, owner_col=CalendarEvent.owner_user_id
    )
    count_stmt = select(func.count()).select_from(scoped.subquery())
    total = (await session.execute(count_stmt)).scalar_one()
    items_stmt = (
        scoped.order_by(CalendarEvent.starts_at.asc(), CalendarEvent.id.asc())
        .limit(pagination.limit)
        .offset(pagination.offset)
    )
    events = (await session.execute(items_stmt)).scalars().all()
    items = []
    for event in events:
        deal_name, company_id, company_name = _deal_display(event.deal)
        items.append(
            _event_out(
                event,
                deal_name,
                company_id=company_id,
                company_name=company_name,
                labels=_label_briefs(event.labels),
            )
        )
    return Page(
        items=items,
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.post("", response_model=CalendarEventOut, status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: CalendarEventCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    client: GoogleCalendarClient = Depends(get_google_calendar_client),
) -> CalendarEventOut:
    deal = await _get_visible_deal(session, user, payload.deal_id) if payload.deal_id else None
    labels = await _resolve_labels(session, user, payload.label_ids)

    event = CalendarEvent(
        organization_id=user.organization_id,
        deal_id=deal.id if deal else None,
        owner_user_id=user.id,
        title=payload.title,
        description=payload.description,
        location=payload.location,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        labels=labels,
    )
    session.add(event)
    await session.flush()

    # Snapshot every display value before the commit expires the instances.
    deal_name, company_id, company_name = _deal_display(deal)
    label_briefs = _label_briefs(labels)

    # Only a deal-linked event has somewhere to be logged: the activity feed
    # is keyed on an entity, and a free-standing event has no company either.
    if deal is not None:
        record_activity(
            session,
            organization_id=deal.organization_id,
            entity_type=ActivityEntityType.deal,
            entity_id=deal.id,
            company_id=deal.company_id,
            user_id=user.id,
            activity_type=ActivityType.event_created,
            payload={
                "deal_name": deal.name,
                "title": event.title,
                "starts_at": event.starts_at.isoformat(),
            },
        )

    if payload.add_to_google:
        connection = await _owner_connection(session, user.id)
        if _connection_usable(connection):
            await _sync_insert(session, event, connection, client)
        else:
            # No usable Google connection — save the CRM event, flag the
            # sync so the UI can prompt a reconnect. Never a 400.
            event.google_sync_status = GoogleSyncStatus.error

    await session.commit()
    await session.refresh(event)
    return _event_out(
        event,
        deal_name,
        company_id=company_id,
        company_name=company_name,
        labels=label_briefs,
    )


@router.put("/{event_id}", response_model=CalendarEventOut)
async def update_event(
    event_id: uuid.UUID,
    payload: CalendarEventUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    client: GoogleCalendarClient = Depends(get_google_calendar_client),
) -> CalendarEventOut:
    event = await _get_scoped_event(session, user, event_id)
    _assert_can_modify(user, event)
    # Read before the commit expires the loaded instances.
    deal_name, company_id, company_name = _deal_display(event.deal)
    label_briefs = _label_briefs(event.labels)

    fields = payload.model_dump(
        exclude_unset=True, exclude={"add_to_google", "deal_id", "label_ids"}
    )
    for key, value in fields.items():
        setattr(event, key, value)

    # Labels are handled apart from the blind setattr loop for the same
    # reason deal_id is: the ids need the org check first. Absent = leave the
    # set alone, `[]` = clear it, a list = replace it with exactly those.
    if payload.label_ids is not None:
        labels = await _resolve_labels(session, user, payload.label_ids)
        event.labels = labels
        label_briefs = _label_briefs(labels)

    # deal_id is handled apart from the blind setattr loop: attaching a deal
    # has to go through the same visibility check as creating against one,
    # or a user could link an event to a deal they cannot see.
    if "deal_id" in payload.model_fields_set:
        if payload.deal_id is None:
            event.deal_id = None
            deal_name, company_id, company_name = _deal_display(None)
        else:
            deal = await _get_visible_deal(session, user, payload.deal_id)
            event.deal_id = deal.id
            deal_name, company_id, company_name = _deal_display(deal)
    if event.ends_at <= event.starts_at:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="ends_at must be after starts_at",
        )

    currently_synced = event.google_event_id is not None
    desired_synced = (
        payload.add_to_google if payload.add_to_google is not None else currently_synced
    )
    connection = await _owner_connection(session, event.owner_user_id)

    if desired_synced and not currently_synced:
        # Explicit opt-in to add a Google copy. A missing/broken connection
        # degrades to `error` — the CRM edit still lands.
        if _connection_usable(connection):
            await _sync_insert(session, event, connection, client)
        else:
            event.google_sync_status = GoogleSyncStatus.error
    elif desired_synced and currently_synced:
        if connection is None:
            event.google_sync_status = GoogleSyncStatus.error
        else:
            await _sync_patch(session, event, connection, client)
    elif not desired_synced and currently_synced:
        await _sync_delete(session, event, connection, client)
        event.google_event_id = None
        event.google_sync_status = GoogleSyncStatus.not_synced

    await session.commit()
    await session.refresh(event)
    return _event_out(
        event,
        deal_name,
        company_id=company_id,
        company_name=company_name,
        labels=label_briefs,
    )


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    client: GoogleCalendarClient = Depends(get_google_calendar_client),
) -> Response:
    event = await _get_scoped_event(session, user, event_id)
    _assert_can_modify(user, event)

    connection = await _owner_connection(session, event.owner_user_id)
    await _sync_delete(session, event, connection, client)

    await session.delete(event)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
