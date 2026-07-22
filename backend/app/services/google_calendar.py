"""Google Calendar REST client + per-user OAuth token plumbing.

Pure HTTP transport in the style of `services/comgate.py`: no business
logic, callers in `api/v1/google_calendar` and `api/v1/events` decide what
to do with results. The one DB-touching helper is `get_valid_access_token`,
which caches short-lived access tokens on the connection row so we don't
hit Google's token endpoint for every event push.

Why a second OAuth flow next to login: login requests only
`openid email profile` and throws Google's tokens away. Calendar access
needs the `calendar.events` scope and a stored refresh token, so the user
grants it separately — which also makes the integration available to
email+password accounts that never touched Google login.
"""

from __future__ import annotations

import contextlib
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.token_crypto import decrypt_token, encrypt_token
from app.db.models import GoogleCalendarConnection

logger = logging.getLogger(__name__)

GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"  # noqa: S105 — URL endpoint, not a token
GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GCAL_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
GCAL_SCOPES = ("openid", "email", "https://www.googleapis.com/auth/calendar.events")

# Refresh when the cached access token has less than this left on the clock.
_TOKEN_EXPIRY_SLACK = timedelta(seconds=60)


class GoogleCalendarError(Exception):
    """Any Google transport/API failure the caller should surface or log."""

    def __init__(self, message: str, *, http_status: int | None = None) -> None:
        super().__init__(message)
        self.http_status = http_status


class GoogleCalendarAuthError(GoogleCalendarError):
    """The grant is gone (`invalid_grant`) or the access token was
    rejected — the user must reconnect their calendar."""


@dataclass(frozen=True)
class GoogleTokenBundle:
    """Everything the connect callback needs to persist a connection."""

    access_token: str
    refresh_token: str
    expires_in: int
    email: str


class GoogleCalendarClient(Protocol):
    """Narrow protocol so API tests can swap in a stub."""

    def build_authorize_url(self, state: str) -> str: ...

    async def exchange_code(self, code: str) -> GoogleTokenBundle: ...

    async def refresh_access_token(self, refresh_token: str) -> tuple[str, int, str | None]: ...

    async def revoke_token(self, token: str) -> None: ...

    async def insert_event(self, access_token: str, payload: dict[str, Any]) -> str: ...

    async def patch_event(
        self, access_token: str, event_id: str, payload: dict[str, Any]
    ) -> None: ...

    async def delete_event(self, access_token: str, event_id: str) -> None: ...


def event_payload(
    *,
    title: str,
    description: str | None,
    location: str | None,
    starts_at: datetime,
    ends_at: datetime,
) -> dict[str, Any]:
    """Google Calendar event body. `description`/`location` are always
    present (null clears them on PATCH); datetimes go out as RFC3339 UTC
    so Google renders them in each viewer's calendar timezone."""
    return {
        "summary": title,
        "description": description,
        "location": location,
        "start": {"dateTime": starts_at.astimezone(UTC).isoformat()},
        "end": {"dateTime": ends_at.astimezone(UTC).isoformat()},
    }


def _require_credentials(settings: Settings) -> None:
    if not (settings.google_client_id and settings.google_client_secret):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "google_oauth_not_configured",
                "detail": (
                    "Google OAuth is not configured on this deployment. "
                    "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
                ),
            },
        )


class HttpGoogleCalendarClient:
    """Concrete httpx-backed client. Inject via FastAPI Depends so tests
    can swap a stub; `http_client` injection lets unit tests mount an
    `httpx.MockTransport`."""

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._http = http_client

    def build_authorize_url(self, state: str) -> str:
        _require_credentials(self._settings)
        params = {
            "client_id": self._settings.google_client_id,
            "redirect_uri": self._settings.google_calendar_redirect_uri,
            "response_type": "code",
            "scope": " ".join(GCAL_SCOPES),
            "state": state,
            "access_type": "offline",
            "prompt": "consent",
        }
        return f"{GOOGLE_AUTHORIZE_URL}?{urlencode(params)}"

    async def _request(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        data: dict[str, str] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> httpx.Response:
        client = self._http or httpx.AsyncClient(timeout=15.0)
        try:
            return await client.request(method, url, headers=headers, data=data, json=json_body)
        except httpx.HTTPError as exc:
            raise GoogleCalendarError(f"Google transport error: {exc}") from exc
        finally:
            if self._http is None:
                await client.aclose()

    async def _token_request(self, form: dict[str, str]) -> dict[str, Any]:
        _require_credentials(self._settings)
        form = {
            "client_id": self._settings.google_client_id,
            "client_secret": self._settings.google_client_secret,
            **form,
        }
        response = await self._request("POST", GOOGLE_TOKEN_URL, data=form)
        if response.status_code != 200:
            payload: dict[str, Any] = {}
            with contextlib.suppress(ValueError):
                payload = response.json()
            error = str(payload.get("error", ""))
            if error == "invalid_grant":
                raise GoogleCalendarAuthError(
                    "Google grant revoked or expired", http_status=response.status_code
                )
            raise GoogleCalendarError(
                f"Google token endpoint failed: {error or response.text[:200]}",
                http_status=response.status_code,
            )
        result: dict[str, Any] = response.json()
        return result

    async def exchange_code(self, code: str) -> GoogleTokenBundle:
        token = await self._token_request(
            {
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": self._settings.google_calendar_redirect_uri,
            }
        )
        access_token = token.get("access_token")
        refresh_token = token.get("refresh_token")
        if not access_token:
            raise GoogleCalendarError("Google did not return an access token")
        if not refresh_token:
            # Happens when consent was skipped; we always send prompt=consent
            # so this is a hard error rather than a silent half-connection.
            raise GoogleCalendarError("Google did not return a refresh token")

        userinfo = await self._request(
            "GET",
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if userinfo.status_code != 200:
            raise GoogleCalendarError("Google userinfo failed", http_status=userinfo.status_code)
        email = str(userinfo.json().get("email", ""))
        if not email:
            raise GoogleCalendarError("Google userinfo did not include an email")

        return GoogleTokenBundle(
            access_token=str(access_token),
            refresh_token=str(refresh_token),
            expires_in=int(token.get("expires_in", 3600)),
            email=email,
        )

    async def refresh_access_token(self, refresh_token: str) -> tuple[str, int, str | None]:
        """Exchange the refresh token for a fresh access token.

        Returns `(access_token, expires_in, rotated_refresh_token)`. Google
        occasionally rotates the refresh token on a refresh call; when it
        does, the third element is the new refresh token to persist,
        otherwise it is `None`.
        """
        token = await self._token_request(
            {"refresh_token": refresh_token, "grant_type": "refresh_token"}
        )
        access_token = token.get("access_token")
        if not access_token:
            raise GoogleCalendarError("Google refresh did not return an access token")
        rotated_refresh_token = token.get("refresh_token")
        return (
            str(access_token),
            int(token.get("expires_in", 3600)),
            str(rotated_refresh_token) if rotated_refresh_token else None,
        )

    async def revoke_token(self, token: str) -> None:
        """Best-effort: a failed revoke must not block disconnect."""
        with contextlib.suppress(GoogleCalendarError):
            await self._request("POST", GOOGLE_REVOKE_URL, data={"token": token})

    def _check_event_response(self, response: httpx.Response) -> None:
        if response.status_code == 401:
            raise GoogleCalendarAuthError(
                "Google rejected the access token", http_status=response.status_code
            )
        if response.status_code >= 400:
            raise GoogleCalendarError(
                f"Google Calendar API failed ({response.status_code})",
                http_status=response.status_code,
            )

    async def insert_event(self, access_token: str, payload: dict[str, Any]) -> str:
        response = await self._request(
            "POST",
            GCAL_EVENTS_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            json_body=payload,
        )
        self._check_event_response(response)
        event_id = str(response.json().get("id", ""))
        if not event_id:
            raise GoogleCalendarError("Google Calendar insert returned no event id")
        return event_id

    async def patch_event(self, access_token: str, event_id: str, payload: dict[str, Any]) -> None:
        response = await self._request(
            "PATCH",
            f"{GCAL_EVENTS_URL}/{event_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            json_body=payload,
        )
        if response.status_code in (404, 410):
            # The Google copy is gone (deleted by the user in Google).
            # Treat as missing so the caller can decide to re-insert.
            raise GoogleCalendarError("Google event no longer exists", http_status=404)
        self._check_event_response(response)

    async def delete_event(self, access_token: str, event_id: str) -> None:
        response = await self._request(
            "DELETE",
            f"{GCAL_EVENTS_URL}/{event_id}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if response.status_code in (404, 410):
            return  # already gone — that's the outcome we wanted
        self._check_event_response(response)


def get_google_calendar_client() -> GoogleCalendarClient:
    """FastAPI dependency returning a configured Google Calendar client."""
    return HttpGoogleCalendarClient()


def _connection_age(connection: GoogleCalendarConnection) -> str:
    """Human-readable age of the connection for the sync_broken log line.

    Defensive: `created_at` can be unloaded on a freshly-flushed row, and
    touching it in async would raise MissingGreenlet — report ``unknown``
    rather than crash the refresh path just to log.
    """
    if "created_at" in sa_inspect(connection).unloaded:
        return "unknown"
    return str(datetime.now(tz=UTC) - connection.created_at)


def _log_sync_broken(connection: GoogleCalendarConnection) -> None:
    """One structured, greppable line every time a grant is declared dead."""
    logger.warning(
        "google_calendar sync_broken flipped: user_id=%s google_email=%s connection_age=%s",
        connection.user_id,
        connection.google_email,
        _connection_age(connection),
    )


async def _refresh_with_one_retry(
    client: GoogleCalendarClient, refresh_token: str
) -> tuple[str, int, str | None]:
    """Refresh once; on `invalid_grant` retry exactly once immediately.

    Google's own guidance is to retry `invalid_grant` a single time (a
    transient token-service blip can answer it) but never loop on it. A
    transient, non-auth `GoogleCalendarError` is not retried here — it
    propagates unchanged so the caller leaves `sync_broken` alone.
    """
    try:
        return await client.refresh_access_token(refresh_token)
    except GoogleCalendarAuthError:
        return await client.refresh_access_token(refresh_token)


async def _refresh_and_store(
    session: AsyncSession,
    connection: GoogleCalendarConnection,
    client: GoogleCalendarClient,
) -> str:
    """Exchange the refresh token, persist the fresh cache, and clear
    `sync_broken`. Only a retried `GoogleCalendarAuthError` flips the
    connection `sync_broken` (emitting one structured log line) before it
    propagates; a transient error leaves the flag untouched."""
    now = datetime.now(tz=UTC)
    refresh_token = decrypt_token(connection.refresh_token_encrypted)
    try:
        access_token, expires_in, rotated_refresh_token = await _refresh_with_one_retry(
            client, refresh_token
        )
    except GoogleCalendarAuthError:
        connection.sync_broken = True
        _log_sync_broken(connection)
        await session.flush()
        raise

    connection.access_token_encrypted = encrypt_token(access_token)
    connection.access_token_expires_at = now + timedelta(seconds=expires_in)
    # Google may rotate the refresh token on a refresh; persist the new one
    # so the next exchange doesn't fail invalid_grant on a superseded token.
    if rotated_refresh_token is not None:
        connection.refresh_token_encrypted = encrypt_token(rotated_refresh_token)
    connection.sync_broken = False
    await session.flush()
    return access_token


async def get_valid_access_token(
    session: AsyncSession,
    connection: GoogleCalendarConnection,
    client: GoogleCalendarClient,
) -> str:
    """Return a usable access token for the connection, refreshing (and
    persisting the new cache) when the stored one is missing or near
    expiry. On a grant that stays revoked across one retry the connection
    is flagged `sync_broken` before `GoogleCalendarAuthError` propagates."""
    now = datetime.now(tz=UTC)
    if (
        connection.access_token_encrypted is not None
        and connection.access_token_expires_at is not None
        and connection.access_token_expires_at > now + _TOKEN_EXPIRY_SLACK
    ):
        return decrypt_token(connection.access_token_encrypted)

    return await _refresh_and_store(session, connection, client)


async def force_refresh_access_token(
    session: AsyncSession,
    connection: GoogleCalendarConnection,
    client: GoogleCalendarClient,
) -> str:
    """Force a refresh-token exchange, ignoring any cached access token.

    Used by the weekly keep-alive so Google's 6-month inactivity clock
    resets and a revoked grant is detected proactively (flipping
    `sync_broken`) rather than at the next event push. Shares the bounded
    retry + `sync_broken` flip path with `get_valid_access_token`.
    """
    return await _refresh_and_store(session, connection, client)
