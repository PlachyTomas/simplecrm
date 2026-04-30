"""Integration tests for the auth endpoints.

Google's OAuth interaction is faked via a dependency override so the tests
never touch accounts.google.com.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import REFRESH_COOKIE_NAME, STATE_COOKIE_NAME
from app.core.config import get_settings
from app.core.security import create_access_token, sign_oauth_state
from app.db.models import Organization, User, UserRole
from app.db.session import AsyncSessionLocal
from app.main import app
from app.services.google_oauth import (
    GoogleProfile,
    get_google_oauth_client,
)


class FakeGoogleOAuthClient:
    def __init__(self, profile: GoogleProfile | None = None, fail: bool = False) -> None:
        self.profile = profile or GoogleProfile(
            google_id="g-999",
            email="hero@testorg.cz",
            name="Test Hero",
            picture=None,
        )
        self.fail = fail

    def build_authorize_url(self, state: str) -> str:
        return f"https://accounts.google.com/o/oauth2/v2/auth?state={state}"

    async def exchange_code_for_profile(self, code: str) -> GoogleProfile:
        if self.fail:
            raise RuntimeError("Google said no")
        assert code == "test-auth-code"
        return self.profile


@pytest.fixture
async def with_fake_google() -> AsyncIterator[FakeGoogleOAuthClient]:
    fake = FakeGoogleOAuthClient()
    app.dependency_overrides[get_google_oauth_client] = lambda: fake
    try:
        yield fake
    finally:
        app.dependency_overrides.pop(get_google_oauth_client, None)


async def test_google_login_returns_redirect_with_state_cookie(
    client: AsyncClient, with_fake_google: FakeGoogleOAuthClient
) -> None:
    response = await client.get("/api/v1/auth/google/login", follow_redirects=False)
    assert response.status_code == 307
    assert "accounts.google.com" in response.headers["location"]
    assert STATE_COOKIE_NAME in response.cookies
    # State cookie value is also echoed in the redirect URL (it's the `state` param).
    assert f"state={response.cookies[STATE_COOKIE_NAME]}" in response.headers["location"]


async def test_google_callback_first_login_creates_user_and_sets_refresh_cookie(
    client: AsyncClient, with_fake_google: FakeGoogleOAuthClient
) -> None:
    state = sign_oauth_state({"nonce": "n1"})
    response = await client.get(
        "/api/v1/auth/google/callback",
        params={"code": "test-auth-code", "state": state},
        cookies={STATE_COOKIE_NAME: state},
        follow_redirects=False,
    )
    assert response.status_code == 302
    assert response.headers["location"].startswith("http://localhost:5173/app")
    assert "access_token=" in response.headers["location"]
    assert REFRESH_COOKIE_NAME in response.cookies


async def test_google_callback_rejects_mismatched_state(
    client: AsyncClient, with_fake_google: FakeGoogleOAuthClient
) -> None:
    real = sign_oauth_state({"nonce": "n"})
    tampered = sign_oauth_state({"nonce": "other"})
    response = await client.get(
        "/api/v1/auth/google/callback",
        params={"code": "test-auth-code", "state": tampered},
        cookies={STATE_COOKIE_NAME: real},
        follow_redirects=False,
    )
    assert response.status_code == 400


async def test_google_callback_requires_code(
    client: AsyncClient, with_fake_google: FakeGoogleOAuthClient
) -> None:
    state = sign_oauth_state({"nonce": "n"})
    response = await client.get(
        "/api/v1/auth/google/callback",
        params={"state": state},
        cookies={STATE_COOKIE_NAME: state},
        follow_redirects=False,
    )
    assert response.status_code == 422  # FastAPI validation error


async def test_google_callback_reports_failure_when_google_rejects(
    client: AsyncClient,
) -> None:
    fake = FakeGoogleOAuthClient(fail=True)
    app.dependency_overrides[get_google_oauth_client] = lambda: fake
    try:
        state = sign_oauth_state({"nonce": "n"})
        response = await client.get(
            "/api/v1/auth/google/callback",
            params={"code": "test-auth-code", "state": state},
            cookies={STATE_COOKIE_NAME: state},
            follow_redirects=False,
        )
    finally:
        app.dependency_overrides.pop(get_google_oauth_client, None)
    assert response.status_code == 400


@pytest.fixture
async def with_isolated_google() -> AsyncIterator[FakeGoogleOAuthClient]:
    """Like `with_fake_google` but uses a unique email/google_id so the
    test doesn't share state with other tests in the module."""
    profile = GoogleProfile(
        google_id="g-isolated-onboarding",
        email="onboarding@testorg.cz",
        name="Onboarding User",
        picture=None,
    )
    fake = FakeGoogleOAuthClient(profile=profile)
    app.dependency_overrides[get_google_oauth_client] = lambda: fake
    try:
        yield fake
    finally:
        app.dependency_overrides.pop(get_google_oauth_client, None)
        async with AsyncSessionLocal() as s:
            user = (
                await s.execute(select(User).where(User.email == profile.email))
            ).scalar_one_or_none()
            if user is not None:
                org_id = user.organization_id
                await s.execute(delete(User).where(User.id == user.id))
                if org_id is not None:
                    await s.execute(delete(Organization).where(Organization.id == org_id))
                await s.commit()


async def test_me_returns_user_profile_pre_org(
    client: AsyncClient,
    with_isolated_google: FakeGoogleOAuthClient,
    db_session: AsyncSession,
) -> None:
    """First Google login (no invite) lands the user without an org. The
    frontend uses `organization == null` to route to the create-org page."""
    state = sign_oauth_state({"nonce": "n"})
    await client.get(
        "/api/v1/auth/google/callback",
        params={"code": "test-auth-code", "state": state},
        cookies={STATE_COOKIE_NAME: state},
        follow_redirects=False,
    )

    user = (
        await db_session.execute(
            select(User).where(User.email == with_isolated_google.profile.email)
        )
    ).scalar_one()
    assert user.organization_id is None
    assert user.role is UserRole.salesperson
    token = create_access_token(user.id, user.organization_id, user.role)

    response = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == with_isolated_google.profile.email
    assert body["role"] == UserRole.salesperson.value
    assert body["organization"] is None


async def test_create_organization_promotes_to_admin_with_default_team(
    client: AsyncClient,
) -> None:
    """`POST /onboarding/organization` provisions org + default team and
    promotes the founder to admin in one shot."""
    profile = GoogleProfile(
        google_id="g-isolated-create",
        email="create@testorg.cz",
        name="Create User",
        picture=None,
    )
    fake = FakeGoogleOAuthClient(profile=profile)
    app.dependency_overrides[get_google_oauth_client] = lambda: fake
    try:
        state = sign_oauth_state({"nonce": "n"})
        callback = await client.get(
            "/api/v1/auth/google/callback",
            params={"code": "test-auth-code", "state": state},
            cookies={STATE_COOKIE_NAME: state},
            follow_redirects=False,
        )
        access_token = callback.headers["location"].split("#access_token=", 1)[1]

        create = await client.post(
            "/api/v1/onboarding/organization",
            json={"name": "Acme s.r.o."},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert create.status_code == 201, create.text
        body = create.json()
        assert body["role"] == UserRole.admin.value
        assert body["organization"]["name"] == "Acme s.r.o."

        teams = await client.get(
            "/api/v1/teams", headers={"Authorization": f"Bearer {access_token}"}
        )
        assert teams.status_code == 200
        items = teams.json()["items"]
        assert any(t["is_default"] and t["name"] == "Hlavní tým" for t in items)
    finally:
        app.dependency_overrides.pop(get_google_oauth_client, None)
        async with AsyncSessionLocal() as s:
            user = (
                await s.execute(select(User).where(User.email == profile.email))
            ).scalar_one_or_none()
            if user is not None:
                org_id = user.organization_id
                await s.execute(delete(User).where(User.id == user.id))
                if org_id is not None:
                    await s.execute(delete(Organization).where(Organization.id == org_id))
                await s.commit()


async def test_me_rejects_missing_token(client: AsyncClient) -> None:
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401


async def test_me_rejects_bad_token(client: AsyncClient) -> None:
    response = await client.get(
        "/api/v1/auth/me", headers={"Authorization": "Bearer not-a-real-jwt"}
    )
    assert response.status_code == 401


async def test_logout_clears_refresh_cookie(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/logout",
        cookies={REFRESH_COOKIE_NAME: "whatever"},
    )
    assert response.status_code == 204
    set_cookie = response.headers.get("set-cookie", "")
    assert "Max-Age=0" in set_cookie or "expires=Thu, 01 Jan 1970" in set_cookie.lower()


@pytest.fixture
def enable_dev_auth() -> Iterator[None]:
    settings = get_settings()
    prev_enabled, prev_env = settings.dev_auth_enabled, settings.app_env
    settings.dev_auth_enabled = True
    settings.app_env = "dev"
    try:
        yield
    finally:
        settings.dev_auth_enabled = prev_enabled
        settings.app_env = prev_env


@pytest.fixture
async def dev_cleanup() -> AsyncIterator[list[str]]:
    emails: list[str] = []
    yield emails
    if not emails:
        return
    async with AsyncSessionLocal() as session:
        org_ids = (
            await session.execute(
                select(User.organization_id).where(User.email.in_(emails))
            )
        ).scalars().all()
        await session.execute(delete(User).where(User.email.in_(emails)))
        if org_ids:
            await session.execute(
                delete(Organization).where(Organization.id.in_(org_ids))
            )
        await session.commit()


async def test_dev_login_returns_token_when_enabled(
    client: AsyncClient,
    enable_dev_auth: None,
    dev_cleanup: list[str],
) -> None:
    email = "admin@example.com"
    dev_cleanup.append(email)
    response = await client.post("/api/v1/auth/dev-login", json={"email": email})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["access_token"]
    assert body["user"]["email"] == email
    assert body["user"]["role"] == "admin"

    me = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["email"] == email


async def test_dev_login_is_idempotent(
    client: AsyncClient,
    enable_dev_auth: None,
    dev_cleanup: list[str],
) -> None:
    email = "idem@example.com"
    dev_cleanup.append(email)
    first = await client.post("/api/v1/auth/dev-login", json={"email": email})
    second = await client.post("/api/v1/auth/dev-login", json={"email": email})
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["user"]["id"] == second.json()["user"]["id"]


async def test_dev_login_404_when_disabled(client: AsyncClient) -> None:
    # Default settings: dev_auth_enabled=False.
    response = await client.post(
        "/api/v1/auth/dev-login", json={"email": "nope@example.com"}
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# /auth/refresh
# ---------------------------------------------------------------------------


async def test_refresh_returns_401_when_cookie_missing(client: AsyncClient) -> None:
    response = await client.post("/api/v1/auth/refresh")
    assert response.status_code == 401


async def test_refresh_returns_401_when_cookie_malformed(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/refresh", cookies={REFRESH_COOKIE_NAME: "not-a-jwt"}
    )
    assert response.status_code == 401


async def test_refresh_rejects_access_token_in_refresh_slot(
    client: AsyncClient,
    with_fake_google: FakeGoogleOAuthClient,
    db_session: AsyncSession,
) -> None:
    """Sending an *access* JWT in the refresh-cookie slot must 401, not 200.

    Regression test for the dependency check `payload.get("type") != REFRESH_TOKEN_TYPE`.
    """
    state = sign_oauth_state({"nonce": "n"})
    await client.get(
        "/api/v1/auth/google/callback",
        params={"code": "test-auth-code", "state": state},
        cookies={STATE_COOKIE_NAME: state},
        follow_redirects=False,
    )
    user = (
        await db_session.execute(select(User).where(User.email == "hero@testorg.cz"))
    ).scalar_one()
    access_jwt = create_access_token(user.id, user.organization_id, user.role)

    response = await client.post(
        "/api/v1/auth/refresh", cookies={REFRESH_COOKIE_NAME: access_jwt}
    )
    assert response.status_code == 401


async def test_refresh_returns_new_access_token_and_rotates_cookie(
    client: AsyncClient,
    with_fake_google: FakeGoogleOAuthClient,
    db_session: AsyncSession,
) -> None:
    state = sign_oauth_state({"nonce": "n"})
    callback = await client.get(
        "/api/v1/auth/google/callback",
        params={"code": "test-auth-code", "state": state},
        cookies={STATE_COOKIE_NAME: state},
        follow_redirects=False,
    )
    # Use the refresh cookie set by the callback — it's the only one whose
    # `jti` is in the active allowlist (QA-024 Part B).
    refresh_jwt = callback.cookies[REFRESH_COOKIE_NAME]

    response = await client.post(
        "/api/v1/auth/refresh", cookies={REFRESH_COOKIE_NAME: refresh_jwt}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["access_token"]
    assert body["user"]["email"] == "hero@testorg.cz"
    # Rotation: the response sets a fresh refresh cookie. We don't assert
    # the *value* differs (clock-resolution flakes) — only that the response
    # carries a Set-Cookie for the refresh slot.
    set_cookie = response.headers.get("set-cookie", "")
    assert REFRESH_COOKIE_NAME in set_cookie


async def test_refresh_bypasses_trial_gate_for_expired_orgs(
    client: AsyncClient,
    with_fake_google: FakeGoogleOAuthClient,
) -> None:
    """Critical: refresh must work even on an expired trial.

    The trial gate runs on `/auth/me` and every protected resource — but
    refresh has to succeed regardless so the frontend can hydrate, then
    receive 402 from `/auth/me`, then render `<TrialExpiredGate />` (which
    needs the access token to drive "Exportovat data"). If refresh itself
    402s, the gate never gets to render.
    """
    from datetime import UTC, datetime, timedelta

    state = sign_oauth_state({"nonce": "n"})
    callback = await client.get(
        "/api/v1/auth/google/callback",
        params={"code": "test-auth-code", "state": state},
        cookies={STATE_COOKIE_NAME: state},
        follow_redirects=False,
    )
    refresh_jwt = callback.cookies[REFRESH_COOKIE_NAME]
    access_token = callback.headers["location"].split("#access_token=", 1)[1]
    # Bootstrap an org so the trial gate has something to expire. A previous
    # test in the same module may have already provisioned one — accept either
    # 201 (just created) or 409 (already exists from a prior test run).
    create_resp = await client.post(
        "/api/v1/onboarding/organization",
        json={"name": "Trial Test"},
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert create_resp.status_code in (201, 409)

    # Roll the org's trial back via a fresh session, then refetch the user id.
    async with AsyncSessionLocal() as s:
        user_row = (
            await s.execute(select(User).where(User.email == "hero@testorg.cz"))
        ).scalar_one()
        user_id = user_row.id
        org_id = user_row.organization_id
        assert org_id is not None
        org = await s.get(Organization, org_id)
        assert org is not None
        org.trial_ends_at = datetime.now(tz=UTC) - timedelta(days=7)
        await s.commit()

    try:
        response = await client.post(
            "/api/v1/auth/refresh", cookies={REFRESH_COOKIE_NAME: refresh_jwt}
        )
        assert response.status_code == 200, response.text

        # Sanity: /auth/me with the same user *does* 402 — the gate kicks in
        # downstream of refresh, not at refresh.
        me_resp = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {response.json()['access_token']}"},
        )
        assert me_resp.status_code == 402
    finally:
        # Clean up the user + org so the next test gets a fresh slate.
        # Refresh-token rows cascade via ON DELETE CASCADE.
        async with AsyncSessionLocal() as s:
            await s.execute(delete(User).where(User.id == user_id))
            await s.execute(delete(Organization).where(Organization.id == org_id))
            await s.commit()


async def test_refresh_rejects_deactivated_user(
    client: AsyncClient,
    with_fake_google: FakeGoogleOAuthClient,
) -> None:
    state = sign_oauth_state({"nonce": "n"})
    callback = await client.get(
        "/api/v1/auth/google/callback",
        params={"code": "test-auth-code", "state": state},
        cookies={STATE_COOKIE_NAME: state},
        follow_redirects=False,
    )
    refresh_jwt = callback.cookies[REFRESH_COOKIE_NAME]

    async with AsyncSessionLocal() as s:
        user_row = (
            await s.execute(select(User).where(User.email == "hero@testorg.cz"))
        ).scalar_one()
        user_id = user_row.id
        org_id = user_row.organization_id
        user_row.is_active = False
        await s.commit()

    try:
        response = await client.post(
            "/api/v1/auth/refresh", cookies={REFRESH_COOKIE_NAME: refresh_jwt}
        )
        assert response.status_code == 401
    finally:
        async with AsyncSessionLocal() as s:
            await s.execute(delete(User).where(User.id == user_id))
            await s.execute(delete(Organization).where(Organization.id == org_id))
            await s.commit()


async def test_refresh_rejects_replayed_jti_after_rotation(
    client: AsyncClient,
    with_fake_google: FakeGoogleOAuthClient,
) -> None:
    """QA-024 Part B regression: rotate A → B; replaying A must 401.

    The old refresh JWT is still cryptographically valid until its `exp`,
    but its `jti` row was deleted on rotation, so the allowlist check rejects
    it. Without server-side invalidation, a leaked refresh token would still
    work after the legitimate user's next refresh.
    """
    state = sign_oauth_state({"nonce": "n"})
    callback = await client.get(
        "/api/v1/auth/google/callback",
        params={"code": "test-auth-code", "state": state},
        cookies={STATE_COOKIE_NAME: state},
        follow_redirects=False,
    )
    refresh_a = callback.cookies[REFRESH_COOKIE_NAME]

    async with AsyncSessionLocal() as s:
        user = (
            await s.execute(select(User).where(User.email == "hero@testorg.cz"))
        ).scalar_one()
        user_id = user.id
        org_id = user.organization_id

    try:
        # First rotation: A → B succeeds and inserts B's jti, deletes A's.
        first = await client.post(
            "/api/v1/auth/refresh",
            cookies={REFRESH_COOKIE_NAME: refresh_a},
        )
        assert first.status_code == 200, first.text

        # Replay A: server-side jti is gone → 401.
        replay = await client.post(
            "/api/v1/auth/refresh",
            cookies={REFRESH_COOKIE_NAME: refresh_a},
        )
        assert replay.status_code == 401
    finally:
        async with AsyncSessionLocal() as s:
            await s.execute(delete(User).where(User.id == user_id))
            await s.execute(delete(Organization).where(Organization.id == org_id))
            await s.commit()


async def test_logout_revokes_refresh_token_server_side(
    client: AsyncClient,
    with_fake_google: FakeGoogleOAuthClient,
) -> None:
    """QA-024 Part B: logout must revoke the allowlist row, not just clear
    the cookie. Otherwise an attacker holding a copy of the cookie pre-logout
    could keep refreshing after the user logs out."""
    state = sign_oauth_state({"nonce": "n"})
    callback = await client.get(
        "/api/v1/auth/google/callback",
        params={"code": "test-auth-code", "state": state},
        cookies={STATE_COOKIE_NAME: state},
        follow_redirects=False,
    )
    refresh_jwt = callback.cookies[REFRESH_COOKIE_NAME]

    async with AsyncSessionLocal() as s:
        user = (
            await s.execute(select(User).where(User.email == "hero@testorg.cz"))
        ).scalar_one()
        user_id = user.id
        org_id = user.organization_id

    try:
        logout_resp = await client.post(
            "/api/v1/auth/logout",
            cookies={REFRESH_COOKIE_NAME: refresh_jwt},
        )
        assert logout_resp.status_code == 204

        # Same cookie, post-logout: server-side row is gone → 401.
        replay = await client.post(
            "/api/v1/auth/refresh",
            cookies={REFRESH_COOKIE_NAME: refresh_jwt},
        )
        assert replay.status_code == 401
    finally:
        async with AsyncSessionLocal() as s:
            await s.execute(delete(User).where(User.id == user_id))
            await s.execute(delete(Organization).where(Organization.id == org_id))
            await s.commit()


async def test_refresh_supports_multi_device(
    client: AsyncClient,
    with_fake_google: FakeGoogleOAuthClient,
    db_session: AsyncSession,
) -> None:
    """QA-024 Part B: two devices can hold independent refresh tokens.

    The allowlist approach is multi-device-friendly — each `jti` is its own
    row, so logging in / refreshing on phone does not invalidate the laptop.
    Verified by issuing two tokens for the same user and refreshing each
    independently.
    """
    from app.core.security import create_refresh_token
    from app.db.models import RefreshToken

    state = sign_oauth_state({"nonce": "n"})
    callback = await client.get(
        "/api/v1/auth/google/callback",
        params={"code": "test-auth-code", "state": state},
        cookies={STATE_COOKIE_NAME: state},
        follow_redirects=False,
    )
    device_a = callback.cookies[REFRESH_COOKIE_NAME]

    async with AsyncSessionLocal() as s:
        user = (
            await s.execute(select(User).where(User.email == "hero@testorg.cz"))
        ).scalar_one()
        user_id = user.id
        org_id = user.organization_id
        # Provision a second active jti by hand — simulating a second device's
        # OAuth callback without re-running the fake-Google fixture.
        issued_b = create_refresh_token(user_id)
        s.add(
            RefreshToken(
                jti=issued_b.jti, user_id=user_id, expires_at=issued_b.expires_at
            )
        )
        await s.commit()
    device_b = issued_b.token

    try:
        # Refresh on device A — succeeds. Device B's row is untouched.
        ra = await client.post(
            "/api/v1/auth/refresh", cookies={REFRESH_COOKIE_NAME: device_a}
        )
        assert ra.status_code == 200, ra.text
        # Refresh on device B — also succeeds; multi-device is supported.
        rb = await client.post(
            "/api/v1/auth/refresh", cookies={REFRESH_COOKIE_NAME: device_b}
        )
        assert rb.status_code == 200, rb.text
    finally:
        async with AsyncSessionLocal() as s:
            await s.execute(delete(User).where(User.id == user_id))
            await s.execute(delete(Organization).where(Organization.id == org_id))
            await s.commit()
