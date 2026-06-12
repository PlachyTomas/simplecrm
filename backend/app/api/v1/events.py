"""Deal calendar events — CRUD + optional one-way push to Google Calendar.

Local-first: the `calendar_events` row is the source of truth. A Google
API failure never loses a write — the event lands with
`google_sync_status=error` and the UI shows a warning. Google propagation
always runs through the **event owner's** connection (it's their calendar);
explicitly requesting `add_to_google` without a connection is a 400, while
propagating edits of an already-synced event degrades to `error` instead.

Visibility mirrors deals: `scope_by_owner` on `owner_user_id` (admins see
the whole org). Editing/deleting is restricted to the owner or an admin.
"""

from __future__ import annotations

import uuid
from typing import Annotated

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
    CalendarEvent,
    Deal,
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
from app.schemas.pagination import Page, PaginationParams
from app.services.google_calendar import (
    GoogleCalendarClient,
    GoogleCalendarError,
    event_payload,
    get_google_calendar_client,
    get_valid_access_token,
)

router = APIRouter(prefix="/events", tags=["events"])


def _event_out(event: CalendarEvent, deal_name: str) -> CalendarEventOut:
    """`deal_name` is passed explicitly — accessing `event.deal` after a
    commit can trigger an async lazy-load, which raises MissingGreenlet."""
    return CalendarEventOut(
        id=event.id,
        organization_id=event.organization_id,
        deal_id=event.deal_id,
        deal_name=deal_name,
        owner_user_id=event.owner_user_id,
        title=event.title,
        description=event.description,
        location=event.location,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        google_event_id=event.google_event_id,
        google_sync_status=event.google_sync_status,
        created_at=event.created_at,
        updated_at=event.updated_at,
    )


async def _get_visible_deal(session: AsyncSession, user: User, deal_id: uuid.UUID) -> Deal:
    base = select(Deal).where(
        Deal.organization_id == user.organization_id,
        Deal.id == deal_id,
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
        .options(selectinload(CalendarEvent.deal))
    )
    scoped = await scope_by_owner(
        base, session=session, user=user, owner_col=CalendarEvent.owner_user_id
    )
    event: CalendarEvent | None = (await session.execute(scoped)).scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


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
        event.google_event_id = await client.insert_event(token, _google_body(event))
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


def _require_connection(
    connection: GoogleCalendarConnection | None,
) -> GoogleCalendarConnection:
    if connection is None or connection.sync_broken:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "google_calendar_not_connected",
                "detail": (
                    "Google Calendar is not connected (or the connection "
                    "needs to be renewed) for the event owner."
                ),
            },
        )
    return connection


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
        .options(selectinload(CalendarEvent.deal))
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
    return Page(
        items=[_event_out(event, event.deal.name) for event in events],
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
    deal = await _get_visible_deal(session, user, payload.deal_id)

    event = CalendarEvent(
        organization_id=user.organization_id,
        deal_id=deal.id,
        owner_user_id=user.id,
        title=payload.title,
        description=payload.description,
        location=payload.location,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
    )
    session.add(event)
    await session.flush()

    if payload.add_to_google:
        connection = _require_connection(await _owner_connection(session, user.id))
        await _sync_insert(session, event, connection, client)

    await session.commit()
    await session.refresh(event)
    return _event_out(event, deal.name)


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
    deal_name = event.deal.name  # capture before commit expires the relationship

    fields = payload.model_dump(exclude_unset=True, exclude={"add_to_google"})
    for key, value in fields.items():
        setattr(event, key, value)
    if event.ends_at <= event.starts_at:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="ends_at must be after starts_at",
        )

    currently_synced = event.google_event_id is not None
    desired_synced = (
        payload.add_to_google if payload.add_to_google is not None else currently_synced
    )
    connection = await _owner_connection(session, event.owner_user_id)

    if desired_synced and not currently_synced:
        # Explicit opt-in — a missing/broken connection is a hard error.
        await _sync_insert(session, event, _require_connection(connection), client)
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
    return _event_out(event, deal_name)


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
