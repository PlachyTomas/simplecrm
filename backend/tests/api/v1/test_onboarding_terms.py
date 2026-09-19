"""Org-creation declaration: the § 1751 OZ incorporation record."""

from __future__ import annotations

import secrets

from httpx import AsyncClient
from sqlalchemy import select

from app.api.v1.auth import STATE_COOKIE_NAME
from app.core.legal import TERMS_VERSION
from app.core.security import sign_oauth_state
from app.db.models import Organization, User
from app.db.session import AsyncSessionLocal
from app.main import app
from app.services.google_oauth import GoogleProfile, get_google_oauth_client


class FakeGoogleOAuthClient:
    def __init__(self, profile: GoogleProfile) -> None:
        self.profile = profile

    def build_authorize_url(self, state: str) -> str:
        return f"https://accounts.google.com/o/oauth2/v2/auth?state={state}"

    async def exchange_code_for_profile(self, code: str) -> GoogleProfile:
        return self.profile


async def _login(client: AsyncClient, *, google_id: str, email: str) -> str:
    profile = GoogleProfile(google_id=google_id, email=email, name="Terms User", picture=None)
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
        return callback.headers["location"].split("#access_token=", 1)[1]
    finally:
        app.dependency_overrides.pop(get_google_oauth_client, None)


async def test_create_organization_requires_business_declaration(client: AsyncClient) -> None:
    """Without the ticked declaration the org is not provisioned — 422, never a default."""
    suffix = secrets.token_hex(3)
    token = await _login(client, google_id=f"g-terms-{suffix}", email=f"terms-{suffix}@testorg.cz")
    headers = {"Authorization": f"Bearer {token}"}

    missing = await client.post(
        "/api/v1/onboarding/organization",
        json={"name": f"No Terms {suffix}"},
        headers=headers,
    )
    assert missing.status_code == 422, missing.text

    unticked = await client.post(
        "/api/v1/onboarding/organization",
        json={"name": f"No Terms {suffix}", "business_declaration": False},
        headers=headers,
    )
    assert unticked.status_code == 422, unticked.text

    async with AsyncSessionLocal() as s:
        user = (
            await s.execute(select(User).where(User.email == f"terms-{suffix}@testorg.cz"))
        ).scalar_one()
        assert user.organization_id is None


async def test_create_organization_records_terms_acceptance(client: AsyncClient) -> None:
    """The ticked declaration is stamped server-side: time, version, accepting user."""
    suffix = secrets.token_hex(3)
    email = f"terms-ok-{suffix}@testorg.cz"
    token = await _login(client, google_id=f"g-terms-ok-{suffix}", email=email)
    headers = {"Authorization": f"Bearer {token}"}

    create = await client.post(
        "/api/v1/onboarding/organization",
        json={"name": f"Terms {suffix}", "business_declaration": True},
        headers=headers,
    )
    assert create.status_code == 201, create.text

    current = await client.get("/api/v1/organizations/current", headers=headers)
    assert current.status_code == 200, current.text
    body = current.json()
    assert body["terms_version"] == TERMS_VERSION
    assert body["terms_accepted_at"] is not None

    async with AsyncSessionLocal() as s:
        user = (await s.execute(select(User).where(User.email == email))).scalar_one()
        org = (
            await s.execute(select(Organization).where(Organization.id == user.organization_id))
        ).scalar_one()
        assert org.terms_accepted_by_user_id == user.id
        assert org.terms_version == TERMS_VERSION
