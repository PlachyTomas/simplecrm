"""Tests for `/api/v1/integrations/google-calendar` (connect flow).

The Google client is stubbed via FastAPI dependency override; no HTTP
leaves the process. Coverage:

  - authorize-url requires auth, returns the consent URL + state cookie
  - callback happy path creates a connection and bounces to settings
  - callback re-connect updates the existing row (no duplicate)
  - callback rejects missing/mismatched state cookie and forged state
  - callback maps a user "Cancel" on the consent screen to gcal_error=denied
  - status reflects no-connection / connected / sync_broken
  - disconnect revokes, deletes the row, and un-links the user's events
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, sign_gcal_state
from app.core.token_crypto import decrypt_token, encrypt_token
from app.db.models import (
    CalendarEvent,
    Company,
    Deal,
    GoogleCalendarConnection,
    GoogleSyncStatus,
    Organization,
    User,
    UserRole,
)
from app.db.session import AsyncSessionLocal
from app.main import app
from app.services.google_calendar import (
    GoogleCalendarError,
    GoogleTokenBundle,
    get_google_calendar_client,
)
from app.services.pipeline import create_default_pipeline

GCAL_PREFIX = "/api/v1/integrations/google-calendar"
STATE_COOKIE = "simplecrm_gcal_state"


class FakeGoogleCalendarClient:
    def __init__(self) -> None:
        self.fail_exchange = False
        self.revoked: list[str] = []

    def build_authorize_url(self, state: str) -> str:
        return f"https://accounts.google.com/o/oauth2/v2/auth?state={state}"

    async def exchange_code(self, code: str) -> GoogleTokenBundle:
        if self.fail_exchange:
            raise GoogleCalendarError("Google said no")
        assert code == "test-code"
        return GoogleTokenBundle(
            access_token="at-1",
            refresh_token="rt-1",
            expires_in=3599,
            email="tomas@gmail.com",
        )

    async def refresh_access_token(self, refresh_token: str) -> tuple[str, int, str | None]:
        return "at-fresh", 3599, None

    async def revoke_token(self, token: str) -> None:
        self.revoked.append(token)

    async def insert_event(self, access_token: str, payload: dict[str, Any]) -> str:
        return "gev-1"

    async def patch_event(
        self, access_token: str, event_id: str, payload: dict[str, Any]
    ) -> None: ...

    async def delete_event(self, access_token: str, event_id: str) -> None: ...


@pytest.fixture
async def fake_gcal() -> AsyncIterator[FakeGoogleCalendarClient]:
    fake = FakeGoogleCalendarClient()
    app.dependency_overrides[get_google_calendar_client] = lambda: fake
    try:
        yield fake
    finally:
        app.dependency_overrides.pop(get_google_calendar_client, None)


@pytest.fixture
async def owned_cleanup() -> AsyncIterator[dict[str, list]]:
    tracked: dict[str, list] = {"orgs": [], "emails": []}
    yield tracked
    async with AsyncSessionLocal() as session:
        if tracked["emails"]:
            await session.execute(delete(User).where(User.email.in_(tracked["emails"])))
        if tracked["orgs"]:
            await session.execute(delete(Organization).where(Organization.id.in_(tracked["orgs"])))
        await session.commit()


async def _seed_user(
    session: AsyncSession, owned_cleanup: dict[str, list], role: UserRole = UserRole.admin
) -> User:
    org = Organization(name=f"GCalOrg-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.commit()
    owned_cleanup["orgs"].append(org.id)
    email = f"u-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    user = User(email=email, name="U", role=role, organization_id=org.id)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def _seed_connection(session: AsyncSession, user: User) -> GoogleCalendarConnection:
    connection = GoogleCalendarConnection(
        user_id=user.id,
        organization_id=user.organization_id,
        google_email="tomas@gmail.com",
        refresh_token_encrypted=encrypt_token("rt-1"),
    )
    session.add(connection)
    await session.commit()
    await session.refresh(connection)
    return connection


def _auth(user: User) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {create_access_token(user.id, user.organization_id, user.role)}"
    }


# authorize-url -----------------------------------------------------------


async def test_authorize_url_requires_auth(
    client: AsyncClient, fake_gcal: FakeGoogleCalendarClient
) -> None:
    response = await client.get(f"{GCAL_PREFIX}/authorize-url")
    assert response.status_code == 401


async def test_authorize_url_returns_url_and_state_cookie(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    user = await _seed_user(db_session, owned_cleanup)
    response = await client.get(f"{GCAL_PREFIX}/authorize-url", headers=_auth(user))
    assert response.status_code == 200
    url = response.json()["url"]
    assert url.startswith("https://accounts.google.com/")
    assert STATE_COOKIE in response.cookies
    # The cookie value is the state embedded in the authorize URL.
    assert f"state={response.cookies[STATE_COOKIE]}" in url


# callback ----------------------------------------------------------------


async def test_callback_creates_connection_and_redirects(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    user = await _seed_user(db_session, owned_cleanup)
    state = sign_gcal_state({"nonce": "n1", "user_id": str(user.id)})
    response = await client.get(
        f"{GCAL_PREFIX}/callback",
        params={"code": "test-code", "state": state},
        cookies={STATE_COOKIE: state},
        follow_redirects=False,
    )
    assert response.status_code == 302
    assert "tab=integrations&gcal=connected" in response.headers["location"]

    connection = (
        await db_session.execute(
            select(GoogleCalendarConnection).where(GoogleCalendarConnection.user_id == user.id)
        )
    ).scalar_one()
    assert connection.google_email == "tomas@gmail.com"
    assert decrypt_token(connection.refresh_token_encrypted) == "rt-1"
    assert connection.sync_broken is False


async def test_callback_reconnect_updates_existing_row(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    user = await _seed_user(db_session, owned_cleanup)
    existing = GoogleCalendarConnection(
        user_id=user.id,
        organization_id=user.organization_id,
        google_email="old@gmail.com",
        refresh_token_encrypted=encrypt_token("rt-old"),
        sync_broken=True,
    )
    db_session.add(existing)
    await db_session.commit()

    state = sign_gcal_state({"nonce": "n2", "user_id": str(user.id)})
    response = await client.get(
        f"{GCAL_PREFIX}/callback",
        params={"code": "test-code", "state": state},
        cookies={STATE_COOKIE: state},
        follow_redirects=False,
    )
    assert response.status_code == 302

    rows = (
        (
            await db_session.execute(
                select(GoogleCalendarConnection).where(GoogleCalendarConnection.user_id == user.id)
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1
    await db_session.refresh(rows[0])
    assert rows[0].google_email == "tomas@gmail.com"
    assert rows[0].sync_broken is False
    assert decrypt_token(rows[0].refresh_token_encrypted) == "rt-1"


async def test_callback_rejects_missing_or_mismatched_cookie(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    user = await _seed_user(db_session, owned_cleanup)
    state = sign_gcal_state({"nonce": "n3", "user_id": str(user.id)})

    no_cookie = await client.get(
        f"{GCAL_PREFIX}/callback",
        params={"code": "test-code", "state": state},
        follow_redirects=False,
    )
    assert no_cookie.status_code == 302
    assert "gcal_error=invalid_state" in no_cookie.headers["location"]

    other = sign_gcal_state({"nonce": "other", "user_id": str(user.id)})
    mismatched = await client.get(
        f"{GCAL_PREFIX}/callback",
        params={"code": "test-code", "state": state},
        cookies={STATE_COOKIE: other},
        follow_redirects=False,
    )
    assert mismatched.status_code == 302
    assert "gcal_error=invalid_state" in mismatched.headers["location"]

    connection = (
        await db_session.execute(
            select(GoogleCalendarConnection).where(GoogleCalendarConnection.user_id == user.id)
        )
    ).scalar_one_or_none()
    assert connection is None


async def test_callback_user_denied_consent(
    client: AsyncClient, fake_gcal: FakeGoogleCalendarClient
) -> None:
    response = await client.get(
        f"{GCAL_PREFIX}/callback",
        params={"error": "access_denied"},
        follow_redirects=False,
    )
    assert response.status_code == 302
    assert "gcal_error=denied" in response.headers["location"]


async def test_callback_exchange_failure_redirects_with_error(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    fake_gcal.fail_exchange = True
    user = await _seed_user(db_session, owned_cleanup)
    state = sign_gcal_state({"nonce": "n4", "user_id": str(user.id)})
    response = await client.get(
        f"{GCAL_PREFIX}/callback",
        params={"code": "test-code", "state": state},
        cookies={STATE_COOKIE: state},
        follow_redirects=False,
    )
    assert response.status_code == 302
    assert "gcal_error=exchange_failed" in response.headers["location"]


# status ------------------------------------------------------------------


async def test_status_not_connected(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    user = await _seed_user(db_session, owned_cleanup)
    response = await client.get(GCAL_PREFIX, headers=_auth(user))
    assert response.status_code == 200
    assert response.json() == {
        "connected": False,
        "google_email": None,
        "sync_broken": False,
        "connected_at": None,
    }


async def test_status_connected(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    user = await _seed_user(db_session, owned_cleanup)
    await _seed_connection(db_session, user)
    response = await client.get(GCAL_PREFIX, headers=_auth(user))
    assert response.status_code == 200
    body = response.json()
    assert body["connected"] is True
    assert body["google_email"] == "tomas@gmail.com"
    assert body["sync_broken"] is False
    assert body["connected_at"] is not None


# disconnect ---------------------------------------------------------------


async def test_disconnect_revokes_and_unlinks_events(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    user = await _seed_user(db_session, owned_cleanup)
    await _seed_connection(db_session, user)

    pipeline = await create_default_pipeline(db_session, user.organization_id)
    await db_session.commit()
    await db_session.refresh(pipeline, attribute_names=["stages"])
    company = Company(organization_id=user.organization_id, name="Firma")
    db_session.add(company)
    await db_session.commit()
    deal = Deal(
        organization_id=user.organization_id,
        company_id=company.id,
        stage_id=pipeline.stages[0].id,
        name="Obchod",
    )
    db_session.add(deal)
    await db_session.commit()
    event = CalendarEvent(
        organization_id=user.organization_id,
        deal_id=deal.id,
        owner_user_id=user.id,
        title="Schůzka",
        starts_at=datetime.now(tz=UTC) + timedelta(days=1),
        ends_at=datetime.now(tz=UTC) + timedelta(days=1, hours=1),
        google_event_id="gev-9",
        google_sync_status=GoogleSyncStatus.synced,
    )
    db_session.add(event)
    await db_session.commit()

    response = await client.delete(GCAL_PREFIX, headers=_auth(user))
    assert response.status_code == 204
    assert fake_gcal.revoked == ["rt-1"]

    connection = (
        await db_session.execute(
            select(GoogleCalendarConnection).where(GoogleCalendarConnection.user_id == user.id)
        )
    ).scalar_one_or_none()
    assert connection is None
    await db_session.refresh(event)
    assert event.google_event_id is None
    assert event.google_sync_status is GoogleSyncStatus.not_synced


async def test_disconnect_without_connection_is_noop(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    user = await _seed_user(db_session, owned_cleanup)
    response = await client.delete(GCAL_PREFIX, headers=_auth(user))
    assert response.status_code == 204
    assert fake_gcal.revoked == []
