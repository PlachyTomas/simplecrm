"""Google Calendar connect/disconnect — the per-user OAuth grant.

Separate from login OAuth (`api/v1/auth`): this flow asks for the
`calendar.events` scope and stores an encrypted refresh token, so both
Google-login and email+password users can connect a calendar.

CSRF protection mirrors the login flow: the signed state round-trips
through Google AND must match an HttpOnly cookie set when the flow
started, so only the browser that initiated the connect can finish it.
The state additionally pins the CRM `user_id` (signed, 10-min TTL)
because `/callback` arrives as an unauthenticated browser redirect.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Cookie, Depends, Query, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import require_active_trial_or_subscription, require_org_membership
from app.core.security import sign_gcal_state, verify_gcal_state
from app.core.token_crypto import TokenDecryptError, decrypt_token, encrypt_token
from app.db import get_db
from app.db.models import CalendarEvent, GoogleCalendarConnection, GoogleSyncStatus, User
from app.schemas.google_calendar import GoogleCalendarAuthorizeUrlOut, GoogleCalendarStatusOut
from app.services.google_calendar import (
    GoogleCalendarClient,
    GoogleCalendarError,
    get_google_calendar_client,
)

router = APIRouter(prefix="/integrations/google-calendar", tags=["integrations"])

GCAL_STATE_COOKIE_NAME = "simplecrm_gcal_state"
_COOKIE_PATH = "/api/v1/integrations/google-calendar"

PROTECTED = [Depends(require_active_trial_or_subscription)]


def _cookie_is_secure() -> bool:
    return get_settings().app_env != "dev"


def _frontend_origin() -> str:
    """Origin of the frontend app, derived from the success redirect —
    same approach as `api/v1/auth._frontend_origin`."""
    redirect = get_settings().frontend_success_redirect
    if redirect.startswith(("http://", "https://")):
        parts = redirect.split("/", 3)
        return "/".join(parts[:3])
    return redirect


def _settings_redirect(result: str) -> RedirectResponse:
    """Bounce the browser back to Settings → Integrace with an outcome
    flag (`gcal=connected` or `gcal_error=<code>`); always drops the
    one-shot state cookie."""
    response = RedirectResponse(
        url=f"{_frontend_origin()}/app/settings?tab=integrations&{result}",
        status_code=status.HTTP_302_FOUND,
    )
    response.delete_cookie(GCAL_STATE_COOKIE_NAME, path=_COOKIE_PATH)
    return response


@router.get("/authorize-url", response_model=GoogleCalendarAuthorizeUrlOut, dependencies=PROTECTED)
async def authorize_url(
    response: Response,
    user: User = Depends(require_org_membership),
    client: GoogleCalendarClient = Depends(get_google_calendar_client),
) -> GoogleCalendarAuthorizeUrlOut:
    state = sign_gcal_state({"nonce": secrets.token_urlsafe(16), "user_id": str(user.id)})
    response.set_cookie(
        key=GCAL_STATE_COOKIE_NAME,
        value=state,
        max_age=600,
        httponly=True,
        secure=_cookie_is_secure(),
        samesite="lax",
        path=_COOKIE_PATH,
    )
    return GoogleCalendarAuthorizeUrlOut(url=client.build_authorize_url(state))


@router.get("/callback")
async def callback(
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    state_cookie: str | None = Cookie(default=None, alias=GCAL_STATE_COOKIE_NAME),
    session: AsyncSession = Depends(get_db),
    client: GoogleCalendarClient = Depends(get_google_calendar_client),
) -> RedirectResponse:
    """Unauthenticated browser redirect from Google. Identity comes from
    the signed state (pinned user_id) + the state cookie double-check."""
    if error is not None:
        # The user clicked "Cancel" on Google's consent screen.
        return _settings_redirect("gcal_error=denied")
    if not code or not state:
        return _settings_redirect("gcal_error=invalid_state")
    if state_cookie is None or not secrets.compare_digest(state, state_cookie):
        return _settings_redirect("gcal_error=invalid_state")
    state_payload = verify_gcal_state(state)
    if state_payload is None:
        return _settings_redirect("gcal_error=invalid_state")

    try:
        user_id = uuid.UUID(str(state_payload.get("user_id")))
    except ValueError:
        return _settings_redirect("gcal_error=invalid_state")
    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        return _settings_redirect("gcal_error=invalid_state")

    try:
        bundle = await client.exchange_code(code)
    except GoogleCalendarError:
        return _settings_redirect("gcal_error=exchange_failed")

    connection = (
        await session.execute(
            select(GoogleCalendarConnection).where(GoogleCalendarConnection.user_id == user.id)
        )
    ).scalar_one_or_none()
    if connection is None:
        connection = GoogleCalendarConnection(
            user_id=user.id,
            organization_id=user.organization_id,
            google_email=bundle.email,
            refresh_token_encrypted=encrypt_token(bundle.refresh_token),
        )
        session.add(connection)
    else:
        connection.google_email = bundle.email
        connection.refresh_token_encrypted = encrypt_token(bundle.refresh_token)
    connection.access_token_encrypted = encrypt_token(bundle.access_token)
    connection.access_token_expires_at = datetime.now(tz=UTC) + timedelta(seconds=bundle.expires_in)
    connection.sync_broken = False
    await session.commit()

    return _settings_redirect("gcal=connected")


@router.get("", response_model=GoogleCalendarStatusOut, dependencies=PROTECTED)
async def connection_status(
    user: User = Depends(require_org_membership),
    session: AsyncSession = Depends(get_db),
) -> GoogleCalendarStatusOut:
    connection = (
        await session.execute(
            select(GoogleCalendarConnection).where(GoogleCalendarConnection.user_id == user.id)
        )
    ).scalar_one_or_none()
    if connection is None:
        return GoogleCalendarStatusOut(connected=False)
    return GoogleCalendarStatusOut(
        connected=True,
        google_email=connection.google_email,
        sync_broken=connection.sync_broken,
        connected_at=connection.created_at,
    )


@router.delete("", status_code=status.HTTP_204_NO_CONTENT, dependencies=PROTECTED)
async def disconnect(
    user: User = Depends(require_org_membership),
    session: AsyncSession = Depends(get_db),
    client: GoogleCalendarClient = Depends(get_google_calendar_client),
) -> Response:
    """Drop the connection. Google copies of synced events stay in the
    user's calendar (it's their data); locally those events go back to
    `not_synced` so future edits stop trying to propagate."""
    connection = (
        await session.execute(
            select(GoogleCalendarConnection).where(GoogleCalendarConnection.user_id == user.id)
        )
    ).scalar_one_or_none()
    if connection is not None:
        try:
            refresh_token = decrypt_token(connection.refresh_token_encrypted)
        except TokenDecryptError:
            refresh_token = None
        if refresh_token is not None:
            await client.revoke_token(refresh_token)
        await session.execute(
            update(CalendarEvent)
            .where(
                CalendarEvent.owner_user_id == user.id,
                CalendarEvent.google_event_id.is_not(None),
            )
            .values(google_event_id=None, google_sync_status=GoogleSyncStatus.not_synced)
        )
        await session.delete(connection)
        await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
