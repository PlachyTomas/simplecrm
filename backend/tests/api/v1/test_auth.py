"""Integration tests for the auth endpoints.

Google's OAuth interaction is faked via a dependency override so the tests
never touch accounts.google.com.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import REFRESH_COOKIE_NAME, STATE_COOKIE_NAME
from app.core.security import create_access_token, sign_oauth_state
from app.db.models import UserRole
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


async def test_me_returns_user_profile(
    client: AsyncClient, with_fake_google: FakeGoogleOAuthClient, db_session: AsyncSession
) -> None:
    # Log in to create a User + Organization.
    state = sign_oauth_state({"nonce": "n"})
    await client.get(
        "/api/v1/auth/google/callback",
        params={"code": "test-auth-code", "state": state},
        cookies={STATE_COOKIE_NAME: state},
        follow_redirects=False,
    )

    # Look up the freshly created user and issue a token directly.
    from sqlalchemy import select

    from app.db.models import User

    user = (
        await db_session.execute(select(User).where(User.email == "hero@testorg.cz"))
    ).scalar_one()
    token = create_access_token(user.id, user.organization_id, user.role)

    response = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "hero@testorg.cz"
    assert body["role"] == UserRole.admin.value
    assert body["organization"]["name"]
    assert body["organization"]["currency"] == "CZK"


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
