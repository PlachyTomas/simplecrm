"""Integration tests for invitations + onboarding endpoints."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select

from app.api.v1.auth import STATE_COOKIE_NAME
from app.core.security import sign_oauth_state
from app.db.models import Organization, User, UserRole
from app.db.session import AsyncSessionLocal
from app.main import app
from app.services.google_oauth import GoogleProfile, get_google_oauth_client


class FakeGoogle:
    def __init__(self, profile: GoogleProfile) -> None:
        self.profile = profile

    def build_authorize_url(self, state: str) -> str:
        return f"https://accounts.google.com/o/oauth2/v2/auth?state={state}"

    async def exchange_code_for_profile(self, code: str) -> GoogleProfile:
        return self.profile


async def _signup_and_create_org(
    client: AsyncClient, *, profile: GoogleProfile, org_name: str
) -> str:
    """End-to-end: Google login → POST /onboarding/organization. Returns the access token."""
    app.dependency_overrides[get_google_oauth_client] = lambda: FakeGoogle(profile)
    try:
        state = sign_oauth_state({"nonce": "n"})
        callback = await client.get(
            "/api/v1/auth/google/callback",
            params={"code": "test-auth-code", "state": state},
            cookies={STATE_COOKIE_NAME: state},
            follow_redirects=False,
        )
        access = callback.headers["location"].split("#access_token=", 1)[1]
        # Provision more than one seat so the invitation tests aren't
        # capped by the founding admin's slot.
        create = await client.post(
            "/api/v1/onboarding/organization",
            json={"name": org_name, "seat_count": 25},
            headers={"Authorization": f"Bearer {access}"},
        )
        if create.status_code not in (201, 409):
            raise AssertionError(f"create-org failed: {create.status_code} {create.text}")
    finally:
        app.dependency_overrides.pop(get_google_oauth_client, None)
    return access


@pytest.fixture
async def admin_token() -> AsyncIterator[str]:
    profile = GoogleProfile(
        google_id="g-inv-admin",
        email="admin-inv@testorg.cz",
        name="Inv Admin",
        picture=None,
    )
    async with AsyncClient(
        transport=__import__("httpx").ASGITransport(app=app), base_url="http://test"
    ) as ac:
        token = await _signup_and_create_org(ac, profile=profile, org_name="Inv Org")
        yield token
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


async def test_create_invite_returns_url_and_lists(client: AsyncClient, admin_token: str) -> None:
    create = await client.post(
        "/api/v1/invitations",
        json={
            "email": "newhire@example.cz",
            "role": "salesperson",
            "team_id": None,
            "can_invite": False,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert create.status_code == 201, create.text
    body = create.json()
    assert body["invite_url"]
    assert "/invite/" in body["invite_url"]
    invitation_id = body["invitation"]["id"]

    listing = await client.get(
        "/api/v1/invitations",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert listing.status_code == 200
    items = listing.json()["items"]
    assert any(i["id"] == invitation_id for i in items)


async def test_invite_preview_returns_org_name(client: AsyncClient, admin_token: str) -> None:
    create = await client.post(
        "/api/v1/invitations",
        json={
            "email": "preview@example.cz",
            "role": "manager",
            "team_id": None,
            "can_invite": True,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert create.status_code == 201
    invite_url = create.json()["invite_url"]
    token = invite_url.rsplit("/invite/", 1)[1]

    preview = await client.get(f"/api/v1/onboarding/invite/{token}")
    assert preview.status_code == 200
    body = preview.json()
    assert body["organization_name"] == "Inv Org"
    assert body["email"] == "preview@example.cz"
    assert body["role"] == "manager"


async def test_revoke_invitation_204(client: AsyncClient, admin_token: str) -> None:
    create = await client.post(
        "/api/v1/invitations",
        json={
            "email": "tobere@example.cz",
            "role": "salesperson",
            "team_id": None,
            "can_invite": False,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    invitation_id = create.json()["invitation"]["id"]

    delete_resp = await client.delete(
        f"/api/v1/invitations/{invitation_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert delete_resp.status_code == 204

    listing = await client.get(
        "/api/v1/invitations",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    items = listing.json()["items"]
    assert all(i["id"] != invitation_id for i in items)


async def test_create_invite_rejects_email_already_in_other_org(
    client: AsyncClient, admin_token: str
) -> None:
    # Create a user in another org first.
    async with AsyncSessionLocal() as s:
        other_org = Organization(name="Other Org")
        s.add(other_org)
        await s.flush()
        other_user = User(
            email="poached@other.cz",
            name="Poached",
            role=UserRole.salesperson,
            organization_id=other_org.id,
        )
        s.add(other_user)
        await s.commit()
        other_user_id = other_user.id
        other_org_id = other_org.id

    try:
        resp = await client.post(
            "/api/v1/invitations",
            json={
                "email": "poached@other.cz",
                "role": "salesperson",
                "team_id": None,
                "can_invite": False,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 409
        assert resp.json()["detail"]["code"] == "user_already_in_organization"
    finally:
        async with AsyncSessionLocal() as s:
            await s.execute(delete(User).where(User.id == other_user_id))
            await s.execute(delete(Organization).where(Organization.id == other_org_id))
            await s.commit()


async def test_invite_preview_404_for_bad_token(client: AsyncClient) -> None:
    preview = await client.get("/api/v1/onboarding/invite/bogus-token")
    assert preview.status_code == 404


async def test_create_invite_requires_admin_or_can_invite(
    client: AsyncClient, admin_token: str
) -> None:
    """A salesperson without `can_invite` cannot post invitations."""
    # Provision a salesperson via direct DB (no can_invite, role=salesperson),
    # mint a token, attempt POST /invitations → 403.
    from app.core.security import create_access_token

    async with AsyncSessionLocal() as s:
        org = (
            await s.execute(select(Organization).where(Organization.name == "Inv Org"))
        ).scalar_one()
        worker = User(
            email="worker@example.cz",
            name="Worker",
            role=UserRole.salesperson,
            organization_id=org.id,
            can_invite=False,
        )
        s.add(worker)
        await s.commit()
        worker_id = worker.id
        worker_token = create_access_token(worker.id, org.id, UserRole.salesperson)

    try:
        resp = await client.post(
            "/api/v1/invitations",
            json={
                "email": "stranger@example.cz",
                "role": "salesperson",
                "team_id": None,
                "can_invite": False,
            },
            headers={"Authorization": f"Bearer {worker_token}"},
        )
        assert resp.status_code == 403
    finally:
        async with AsyncSessionLocal() as s:
            await s.execute(delete(User).where(User.id == worker_id))
            await s.commit()


async def test_can_invite_nonadmin_cannot_grant_admin_role(
    client: AsyncClient, admin_token: str
) -> None:
    """Regression (review P1): a non-admin holding can_invite must NOT be able
    to mint an admin (or another can_invite) via an invitation — that would be
    a privilege escalation past the admin-only role gate on PUT /users/{id}."""
    from app.core.security import create_access_token

    async with AsyncSessionLocal() as s:
        org = (
            await s.execute(select(Organization).where(Organization.name == "Inv Org"))
        ).scalar_one()
        delegate = User(
            email="delegate@example.cz",
            name="Delegate",
            role=UserRole.salesperson,
            organization_id=org.id,
            can_invite=True,  # allowed to invite, but only peers
        )
        s.add(delegate)
        await s.commit()
        delegate_id = delegate.id
        delegate_token = create_access_token(delegate.id, org.id, UserRole.salesperson)

    try:
        resp = await client.post(
            "/api/v1/invitations",
            json={
                "email": "escalate@example.cz",
                "role": "admin",
                "team_id": None,
                "can_invite": True,
            },
            headers={"Authorization": f"Bearer {delegate_token}"},
        )
        assert resp.status_code == 403, resp.text
    finally:
        async with AsyncSessionLocal() as s:
            await s.execute(delete(User).where(User.id == delegate_id))
            await s.commit()


async def test_cannot_invite_email_already_in_this_org(
    client: AsyncClient, admin_token: str
) -> None:
    """Regression (review P0): inviting an email that already maps to a member
    of your own org must be rejected. Otherwise the invite-accept flow can mint
    a session for that existing member (e.g. the org admin) = account takeover."""
    async with AsyncSessionLocal() as s:
        org = (
            await s.execute(select(Organization).where(Organization.name == "Inv Org"))
        ).scalar_one()
        member = User(
            email="existing-member@example.cz",
            name="Existing Member",
            role=UserRole.manager,
            organization_id=org.id,
        )
        s.add(member)
        await s.commit()
        member_id = member.id

    try:
        resp = await client.post(
            "/api/v1/invitations",
            json={
                "email": "existing-member@example.cz",
                "role": "salesperson",
                "team_id": None,
                "can_invite": False,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code in (400, 409), resp.text
    finally:
        async with AsyncSessionLocal() as s:
            await s.execute(delete(User).where(User.id == member_id))
            await s.commit()


async def test_invite_accept_rejects_wrong_password_for_existing_credentialed_user(
    admin_token: str,
) -> None:
    """Regression (review P0): accepting an invite for a user who ALREADY has a
    password must verify that password before adopting the org + issuing a
    session. A pre-org self-signup (org_id=None, password set) is the reachable
    case; an arbitrary password must NOT log the attacker in as that user."""
    from app.core.passwords import hash_password
    from app.services.invitations import (
        InvitationPasswordMismatchError,
        create_invitation,
    )

    async with AsyncSessionLocal() as s:
        org = (
            await s.execute(select(Organization).where(Organization.name == "Inv Org"))
        ).scalar_one()
        admin = (
            await s.execute(
                select(User).where(User.organization_id == org.id, User.role == UserRole.admin)
            )
        ).scalars().first()
        assert admin is not None
        victim = User(
            email="preorg-victim@example.cz",
            name="Pre-org Victim",
            role=UserRole.salesperson,
            organization_id=None,  # self-signed-up, not yet in an org
            password_hash=hash_password("the-real-password"),
        )
        s.add(victim)
        await s.flush()
        issued = await create_invitation(
            s,
            organization_id=org.id,
            inviter=admin,
            email="preorg-victim@example.cz",
            role=UserRole.salesperson,
            team_id=None,
            can_invite=False,
        )
        token = issued.token
        victim_id = victim.id
        await s.commit()

    try:
        async with AsyncSessionLocal() as s:
            from app.services.invitations import accept_invitation_for_email_signup

            with pytest.raises(InvitationPasswordMismatchError):
                await accept_invitation_for_email_signup(
                    s, token=token, password="attacker-guess", name="Attacker"
                )
    finally:
        async with AsyncSessionLocal() as s:
            from app.db.models import Invitation

            await s.execute(delete(Invitation).where(Invitation.email == "preorg-victim@example.cz"))
            await s.execute(delete(User).where(User.id == victim_id))
            await s.commit()


async def test_invite_returns_422_when_seat_limit_reached(
    client: AsyncClient,
) -> None:
    """A separate org with seat_count=1 (just the founding admin) can't
    issue any invites — the cap is reached."""
    profile = GoogleProfile(
        google_id="g-cap-admin",
        email="cap-admin@cap-test.cz",
        name="Cap Admin",
        picture=None,
    )
    async with AsyncClient(
        transport=__import__("httpx").ASGITransport(app=app), base_url="http://test"
    ) as ac:
        app.dependency_overrides[get_google_oauth_client] = lambda: FakeGoogle(profile)
        try:
            state = sign_oauth_state({"nonce": "n"})
            callback = await ac.get(
                "/api/v1/auth/google/callback",
                params={"code": "test-auth-code", "state": state},
                cookies={STATE_COOKIE_NAME: state},
                follow_redirects=False,
            )
            access = callback.headers["location"].split("#access_token=", 1)[1]
            await ac.post(
                "/api/v1/onboarding/organization",
                json={"name": "Cap Org", "seat_count": 1},
                headers={"Authorization": f"Bearer {access}"},
            )
        finally:
            app.dependency_overrides.pop(get_google_oauth_client, None)

    try:
        resp = await client.post(
            "/api/v1/invitations",
            json={
                "email": "second@cap-test.cz",
                "role": "salesperson",
                "team_id": None,
                "can_invite": False,
            },
            headers={"Authorization": f"Bearer {access}"},
        )
        assert resp.status_code == 422
        assert resp.json()["detail"]["code"] == "seat_limit_reached"
    finally:
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
