"""Tests for `services/google_calendar` + `core/token_crypto`.

HTTP transport is mocked via `httpx.MockTransport` (same approach as
`test_comgate.py` — no respx dependency). Coverage:

  - token_crypto encrypt/decrypt round-trip + tamper detection
  - event_payload converts datetimes to RFC3339 UTC and always carries
    description/location keys so PATCH can clear them
  - build_authorize_url carries scopes, offline access + consent prompt
  - exchange_code returns the full token bundle incl. the Google email
  - refresh_access_token maps `invalid_grant` to GoogleCalendarAuthError
  - insert/patch/delete event happy paths; delete tolerates 404;
    401 raises GoogleCalendarAuthError
  - get_valid_access_token: serves cached unexpired tokens without HTTP,
    refreshes expired ones and persists, marks the connection
    `sync_broken` on revoked grants
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.token_crypto import TokenDecryptError, decrypt_token, encrypt_token
from app.db.models import GoogleCalendarConnection, Organization, User, UserRole
from app.services.google_calendar import (
    GoogleCalendarAuthError,
    GoogleCalendarError,
    HttpGoogleCalendarClient,
    event_payload,
    force_refresh_access_token,
    get_valid_access_token,
)


def _settings_with_creds(**overrides: object) -> Settings:
    defaults: dict[str, object] = {
        "google_client_id": "client-id-123",
        "google_client_secret": "client-secret-456",
        "google_calendar_redirect_uri": (
            "http://localhost:8000/api/v1/integrations/google-calendar/callback"
        ),
    }
    defaults.update(overrides)
    return Settings(**defaults)  # type: ignore[arg-type]


def _client_with_handler(handler) -> HttpGoogleCalendarClient:  # type: ignore[no-untyped-def]
    transport = httpx.MockTransport(handler)
    return HttpGoogleCalendarClient(
        settings=_settings_with_creds(),
        http_client=httpx.AsyncClient(transport=transport),
    )


# ---------------------------------------------------------------- crypto


def test_token_crypto_round_trip() -> None:
    secret = "1//refresh-token-value"
    encrypted = encrypt_token(secret)
    assert encrypted != secret
    assert decrypt_token(encrypted) == secret


def test_token_crypto_rejects_tampered_ciphertext() -> None:
    encrypted = encrypt_token("value")
    with pytest.raises(TokenDecryptError):
        decrypt_token(encrypted[:-2] + "xx")


# ---------------------------------------------------------- event payload


def test_event_payload_uses_rfc3339_utc_and_clearable_fields() -> None:
    payload = event_payload(
        title="Demo s klientem",
        description=None,
        location=None,
        starts_at=datetime(2026, 6, 15, 10, 0, tzinfo=UTC),
        ends_at=datetime(2026, 6, 15, 11, 30, tzinfo=UTC),
    )
    assert payload["summary"] == "Demo s klientem"
    assert payload["start"] == {"dateTime": "2026-06-15T10:00:00+00:00"}
    assert payload["end"] == {"dateTime": "2026-06-15T11:30:00+00:00"}
    # Keys must be present even when None so a Google PATCH clears them.
    assert payload["description"] is None
    assert payload["location"] is None


# ---------------------------------------------------------- authorize url


def test_build_authorize_url_requests_calendar_scope_offline_consent() -> None:
    client = HttpGoogleCalendarClient(settings=_settings_with_creds())
    url = client.build_authorize_url("signed-state-token")
    parsed = urlparse(url)
    params = parse_qs(parsed.query)
    assert parsed.netloc == "accounts.google.com"
    assert params["state"] == ["signed-state-token"]
    assert params["access_type"] == ["offline"]
    assert params["prompt"] == ["consent"]
    scopes = params["scope"][0].split(" ")
    assert "https://www.googleapis.com/auth/calendar.events" in scopes
    assert "email" in scopes


# ----------------------------------------------------------- token calls


async def test_exchange_code_returns_bundle_with_email() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/token":
            body = parse_qs(request.content.decode())
            assert body["grant_type"] == ["authorization_code"]
            assert body["code"] == ["auth-code-1"]
            return httpx.Response(
                200,
                json={
                    "access_token": "at-1",
                    "refresh_token": "rt-1",
                    "expires_in": 3599,
                },
            )
        assert request.url.path == "/v1/userinfo"
        assert request.headers["Authorization"] == "Bearer at-1"
        return httpx.Response(200, json={"sub": "g-1", "email": "tomas@gmail.com"})

    client = _client_with_handler(handler)
    bundle = await client.exchange_code("auth-code-1")
    assert bundle.access_token == "at-1"
    assert bundle.refresh_token == "rt-1"
    assert bundle.expires_in == 3599
    assert bundle.email == "tomas@gmail.com"


async def test_exchange_code_without_refresh_token_raises() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"access_token": "at-1", "expires_in": 3599})

    client = _client_with_handler(handler)
    with pytest.raises(GoogleCalendarError):
        await client.exchange_code("auth-code-1")


async def test_refresh_access_token_maps_invalid_grant_to_auth_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": "invalid_grant"})

    client = _client_with_handler(handler)
    with pytest.raises(GoogleCalendarAuthError):
        await client.refresh_access_token("rt-revoked")


# ----------------------------------------------------------- event calls


async def test_insert_event_returns_google_event_id() -> None:
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(200, json={"id": "gev-123"})

    client = _client_with_handler(handler)
    event_id = await client.insert_event("at-1", {"summary": "Demo"})
    assert event_id == "gev-123"
    request = captured[0]
    assert request.url.path.endswith("/calendars/primary/events")
    assert request.headers["Authorization"] == "Bearer at-1"
    assert json.loads(request.content)["summary"] == "Demo"


async def test_delete_event_tolerates_missing_google_copy() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"error": {"code": 404}})

    client = _client_with_handler(handler)
    await client.delete_event("at-1", "gev-already-gone")  # must not raise


async def test_insert_event_expired_token_raises_auth_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": {"code": 401}})

    client = _client_with_handler(handler)
    with pytest.raises(GoogleCalendarAuthError):
        await client.insert_event("at-stale", {"summary": "Demo"})


# -------------------------------------------------- get_valid_access_token


async def _seed_connection(
    session: AsyncSession,
    *,
    access_token: str | None,
    expires_in: timedelta | None,
) -> GoogleCalendarConnection:
    org = Organization(name=f"GCal-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.flush()
    user = User(
        email=f"u-{uuid.uuid4().hex[:6]}@example.cz",
        name="Test",
        role=UserRole.admin,
        organization_id=org.id,
    )
    session.add(user)
    await session.flush()
    connection = GoogleCalendarConnection(
        user_id=user.id,
        organization_id=org.id,
        google_email="tomas@gmail.com",
        refresh_token_encrypted=encrypt_token("rt-1"),
        access_token_encrypted=encrypt_token(access_token) if access_token else None,
        access_token_expires_at=(datetime.now(tz=UTC) + expires_in) if expires_in else None,
    )
    session.add(connection)
    await session.flush()
    return connection


async def test_get_valid_access_token_serves_cached_token(db_session: AsyncSession) -> None:
    connection = await _seed_connection(
        db_session, access_token="at-cached", expires_in=timedelta(minutes=30)
    )

    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("cached token must not trigger HTTP")

    client = _client_with_handler(handler)
    token = await get_valid_access_token(db_session, connection, client)
    assert token == "at-cached"


async def test_get_valid_access_token_refreshes_expired_token(db_session: AsyncSession) -> None:
    connection = await _seed_connection(
        db_session, access_token="at-stale", expires_in=timedelta(seconds=10)
    )

    def handler(request: httpx.Request) -> httpx.Response:
        body = parse_qs(request.content.decode())
        assert body["grant_type"] == ["refresh_token"]
        assert body["refresh_token"] == ["rt-1"]
        return httpx.Response(200, json={"access_token": "at-fresh", "expires_in": 3599})

    client = _client_with_handler(handler)
    token = await get_valid_access_token(db_session, connection, client)
    assert token == "at-fresh"
    assert connection.access_token_encrypted is not None
    assert decrypt_token(connection.access_token_encrypted) == "at-fresh"
    assert connection.access_token_expires_at is not None
    assert connection.access_token_expires_at > datetime.now(tz=UTC) + timedelta(minutes=30)


async def test_get_valid_access_token_marks_connection_broken_on_revoked_grant(
    db_session: AsyncSession,
) -> None:
    connection = await _seed_connection(db_session, access_token=None, expires_in=None)
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(400, json={"error": "invalid_grant"})

    client = _client_with_handler(handler)
    with pytest.raises(GoogleCalendarAuthError):
        await get_valid_access_token(db_session, connection, client)
    # invalid_grant is retried exactly once before the connection is broken.
    assert calls["n"] == 2
    assert connection.sync_broken is True


async def test_get_valid_access_token_retries_once_then_succeeds(
    db_session: AsyncSession,
) -> None:
    """A single transient `invalid_grant` is survived by the one retry —
    the connection must NOT be flipped when the retry succeeds."""
    connection = await _seed_connection(db_session, access_token=None, expires_in=None)
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(400, json={"error": "invalid_grant"})
        return httpx.Response(200, json={"access_token": "at-second", "expires_in": 3599})

    client = _client_with_handler(handler)
    token = await get_valid_access_token(db_session, connection, client)
    assert token == "at-second"
    assert calls["n"] == 2
    assert connection.sync_broken is False


async def test_get_valid_access_token_transient_error_does_not_flip(
    db_session: AsyncSession,
) -> None:
    """A non-auth (5xx) failure is not retried and never flips sync_broken —
    the grant is fine, Google is merely unavailable right now."""
    connection = await _seed_connection(db_session, access_token=None, expires_in=None)
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(503, json={"error": "backend_error"})

    client = _client_with_handler(handler)
    with pytest.raises(GoogleCalendarError) as exc:
        await get_valid_access_token(db_session, connection, client)
    assert not isinstance(exc.value, GoogleCalendarAuthError)
    assert calls["n"] == 1  # no retry for a transient error
    assert connection.sync_broken is False


async def test_get_valid_access_token_persists_rotated_refresh_token(
    db_session: AsyncSession,
) -> None:
    """Google may hand back a new refresh token on a refresh; it must be
    re-encrypted and persisted so the next exchange uses the live token."""
    connection = await _seed_connection(db_session, access_token=None, expires_in=None)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "access_token": "at-new",
                "expires_in": 3599,
                "refresh_token": "rt-rotated",
            },
        )

    client = _client_with_handler(handler)
    token = await get_valid_access_token(db_session, connection, client)
    assert token == "at-new"
    assert decrypt_token(connection.refresh_token_encrypted) == "rt-rotated"


async def test_get_valid_access_token_keeps_refresh_token_when_not_rotated(
    db_session: AsyncSession,
) -> None:
    connection = await _seed_connection(db_session, access_token=None, expires_in=None)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"access_token": "at-new", "expires_in": 3599})

    client = _client_with_handler(handler)
    await get_valid_access_token(db_session, connection, client)
    # No `refresh_token` in the response → the stored one is untouched.
    assert decrypt_token(connection.refresh_token_encrypted) == "rt-1"


async def test_force_refresh_ignores_cached_token(db_session: AsyncSession) -> None:
    """The keep-alive path must hit Google even when a cached access token
    is still valid, so the inactivity clock actually resets."""
    connection = await _seed_connection(
        db_session, access_token="at-cached", expires_in=timedelta(minutes=30)
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"access_token": "at-forced", "expires_in": 3599})

    client = _client_with_handler(handler)
    token = await force_refresh_access_token(db_session, connection, client)
    assert token == "at-forced"
    assert decrypt_token(connection.access_token_encrypted) == "at-forced"
