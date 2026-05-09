"""Integration tests for the email + password auth flow.

Covers signup → verify → login, password reset, oauth-only refusal, and
the resend cooldown. Each test uses a unique email and cleans up the user
+ any leftover tokens/refresh-rows on teardown so the suite stays
deterministic against the shared dev DB.
"""

from __future__ import annotations

import secrets
import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select

from app.api.v1.auth import REFRESH_COOKIE_NAME, _verify_email_link
from app.core.auth_tokens import RESEND_COOLDOWN_SECONDS, sign_action_token
from app.core.config import get_settings
from app.db.models import AuthActionToken, RefreshToken, User, UserRole
from app.db.session import AsyncSessionLocal

# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _unique_email() -> str:
    """Each test gets its own email so the shared DB stays clean even when
    a previous run aborted before teardown."""
    return f"emailauth-{secrets.token_hex(4)}@example.cz"


@pytest.fixture
async def cleanup_emails() -> AsyncIterator[list[str]]:
    """Tracks emails created during the test and deletes their User rows on
    teardown. Children rows (auth_action_tokens, refresh_tokens) cascade."""
    emails: list[str] = []
    try:
        yield emails
    finally:
        if emails:
            async with AsyncSessionLocal() as s:
                await s.execute(delete(User).where(User.email.in_(emails)))
                await s.commit()


# --------------------------------------------------------------------------- #
# Signup
# --------------------------------------------------------------------------- #


async def test_signup_creates_unverified_user_and_action_token(
    client: AsyncClient, cleanup_emails: list[str]
) -> None:
    email = _unique_email()
    cleanup_emails.append(email)

    response = await client.post(
        "/api/v1/auth/signup",
        json={"email": email, "password": "correcthorsebattery1", "name": "Newbie"},
    )
    assert response.status_code == 202

    async with AsyncSessionLocal() as s:
        user = (
            await s.execute(select(User).where(User.email == email))
        ).scalar_one()
        assert user.password_hash is not None
        assert user.email_verified is False
        token_count = (
            await s.execute(
                select(AuthActionToken).where(AuthActionToken.user_id == user.id)
            )
        ).all()
        assert len(token_count) == 1
        assert token_count[0][0].purpose == "verify_email"


async def test_signup_rejects_weak_password(
    client: AsyncClient, cleanup_emails: list[str]
) -> None:
    email = _unique_email()
    response = await client.post(
        "/api/v1/auth/signup",
        json={"email": email, "password": "short", "name": "Newbie"},
    )
    # Pydantic catches min_length=12 first → 422 from FastAPI validation
    assert response.status_code == 422


async def test_signup_rejects_duplicate_registered_email(
    client: AsyncClient, cleanup_emails: list[str]
) -> None:
    email = _unique_email()
    cleanup_emails.append(email)

    # First signup succeeds
    first = await client.post(
        "/api/v1/auth/signup",
        json={"email": email, "password": "correcthorsebattery1", "name": "Newbie"},
    )
    assert first.status_code == 202

    # Second signup with the same email → 409
    second = await client.post(
        "/api/v1/auth/signup",
        json={"email": email, "password": "correcthorsebattery2", "name": "Newbie"},
    )
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "email_already_registered"


# --------------------------------------------------------------------------- #
# Verify email
# --------------------------------------------------------------------------- #


async def _signup_and_get_token(client: AsyncClient, email: str, password: str) -> str:
    response = await client.post(
        "/api/v1/auth/signup",
        json={"email": email, "password": password, "name": "Newbie"},
    )
    assert response.status_code == 202
    async with AsyncSessionLocal() as s:
        user = (await s.execute(select(User).where(User.email == email))).scalar_one()
        token_row = (
            await s.execute(
                select(AuthActionToken).where(AuthActionToken.user_id == user.id)
            )
        ).scalar_one()
    return sign_action_token(token_row.jti)


async def test_verify_check_returns_email_and_no_password_required(
    client: AsyncClient, cleanup_emails: list[str]
) -> None:
    email = _unique_email()
    cleanup_emails.append(email)
    token = await _signup_and_get_token(client, email, "correcthorsebattery1")

    response = await client.post("/api/v1/auth/verify-email/check", json={"token": token})
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == email
    assert body["requires_password"] is False  # password was set at signup


async def test_verify_consume_logs_user_in_and_marks_verified(
    client: AsyncClient, cleanup_emails: list[str]
) -> None:
    email = _unique_email()
    cleanup_emails.append(email)
    token = await _signup_and_get_token(client, email, "correcthorsebattery1")

    response = await client.post("/api/v1/auth/verify-email/consume", json={"token": token})
    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert body["user"]["email"] == email
    assert REFRESH_COOKIE_NAME in response.cookies

    async with AsyncSessionLocal() as s:
        user = (await s.execute(select(User).where(User.email == email))).scalar_one()
        assert user.email_verified is True
        assert user.email_verified_at is not None
        # Token row was deleted on consume
        leftover = (
            await s.execute(
                select(AuthActionToken).where(AuthActionToken.user_id == user.id)
            )
        ).all()
        assert leftover == []


async def test_verify_consume_rejects_bad_token(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/verify-email/consume", json={"token": "garbage"}
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "token_invalid"


# --------------------------------------------------------------------------- #
# Login
# --------------------------------------------------------------------------- #


async def test_login_succeeds_after_verification(
    client: AsyncClient, cleanup_emails: list[str]
) -> None:
    email = _unique_email()
    password = "correcthorsebattery1"
    cleanup_emails.append(email)
    token = await _signup_and_get_token(client, email, password)
    consume = await client.post("/api/v1/auth/verify-email/consume", json={"token": token})
    assert consume.status_code == 200

    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert body["user"]["email"] == email
    assert REFRESH_COOKIE_NAME in response.cookies


async def test_login_rejects_unverified_user(
    client: AsyncClient, cleanup_emails: list[str]
) -> None:
    email = _unique_email()
    password = "correcthorsebattery1"
    cleanup_emails.append(email)
    await _signup_and_get_token(client, email, password)

    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "email_not_verified"


async def test_login_rejects_wrong_password(
    client: AsyncClient, cleanup_emails: list[str]
) -> None:
    email = _unique_email()
    cleanup_emails.append(email)
    token = await _signup_and_get_token(client, email, "correcthorsebattery1")
    await client.post("/api/v1/auth/verify-email/consume", json={"token": token})

    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "wrong-password-1"}
    )
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "invalid_credentials"


async def test_login_rejects_oauth_only_account(
    client: AsyncClient, cleanup_emails: list[str]
) -> None:
    """Existing Google-only users (no password_hash) get a distinct 401 so
    the frontend can render a 'use Google' CTA."""
    email = _unique_email()
    cleanup_emails.append(email)

    async with AsyncSessionLocal() as s:
        user = User(
            id=uuid.uuid4(),
            email=email,
            name="Google User",
            google_id=f"g-{secrets.token_hex(4)}",
            password_hash=None,
            email_verified=True,
            role=UserRole.salesperson,
        )
        s.add(user)
        await s.commit()

    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "anything12345"}
    )
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "oauth_only_account"


# --------------------------------------------------------------------------- #
# Account linking via signup (Google user adds a password)
# --------------------------------------------------------------------------- #


async def test_signup_for_oauth_only_user_sends_link_token_without_setting_password(
    client: AsyncClient, cleanup_emails: list[str]
) -> None:
    email = _unique_email()
    cleanup_emails.append(email)

    async with AsyncSessionLocal() as s:
        google_id = f"g-{secrets.token_hex(4)}"
        user = User(
            id=uuid.uuid4(),
            email=email,
            name="Google User",
            google_id=google_id,
            password_hash=None,
            email_verified=True,
            role=UserRole.salesperson,
        )
        s.add(user)
        await s.commit()

    # Signup with an attempted password — we should NOT write it now;
    # instead a verify_email token should be issued.
    response = await client.post(
        "/api/v1/auth/signup",
        json={"email": email, "password": "newpassword1234", "name": "Linker"},
    )
    assert response.status_code == 202

    async with AsyncSessionLocal() as s:
        user_row = (await s.execute(select(User).where(User.email == email))).scalar_one()
        assert user_row.password_hash is None  # NOT written at signup time
        token_row = (
            await s.execute(
                select(AuthActionToken).where(AuthActionToken.user_id == user_row.id)
            )
        ).scalar_one()
        assert token_row.purpose == "verify_email"

    # Frontend would call verify-check first; check should report requires_password=True
    signed = sign_action_token(token_row.jti)
    check = await client.post("/api/v1/auth/verify-email/check", json={"token": signed})
    assert check.status_code == 200
    assert check.json()["requires_password"] is True

    # Consuming with a password writes it onto the existing row
    consume = await client.post(
        "/api/v1/auth/verify-email/consume",
        json={"token": signed, "password": "linkedpw123456"},
    )
    assert consume.status_code == 200

    async with AsyncSessionLocal() as s:
        user_row = (await s.execute(select(User).where(User.email == email))).scalar_one()
        assert user_row.password_hash is not None

    # Login with email/password works
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "linkedpw123456"},
    )
    assert login.status_code == 200


async def test_consume_oauth_link_without_password_returns_password_required(
    client: AsyncClient, cleanup_emails: list[str]
) -> None:
    email = _unique_email()
    cleanup_emails.append(email)

    async with AsyncSessionLocal() as s:
        user = User(
            id=uuid.uuid4(),
            email=email,
            name="Google User",
            google_id=f"g-{secrets.token_hex(4)}",
            password_hash=None,
            email_verified=True,
            role=UserRole.salesperson,
        )
        s.add(user)
        await s.commit()

    await client.post(
        "/api/v1/auth/signup",
        json={"email": email, "password": "newpassword1234", "name": "Linker"},
    )
    async with AsyncSessionLocal() as s:
        user_row = (await s.execute(select(User).where(User.email == email))).scalar_one()
        token_row = (
            await s.execute(
                select(AuthActionToken).where(AuthActionToken.user_id == user_row.id)
            )
        ).scalar_one()
    signed = sign_action_token(token_row.jti)

    response = await client.post(
        "/api/v1/auth/verify-email/consume", json={"token": signed}
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "password_required"


# --------------------------------------------------------------------------- #
# Password reset
# --------------------------------------------------------------------------- #


async def test_password_reset_revokes_existing_sessions(
    client: AsyncClient, cleanup_emails: list[str]
) -> None:
    email = _unique_email()
    password = "correcthorsebattery1"
    cleanup_emails.append(email)
    token = await _signup_and_get_token(client, email, password)
    await client.post("/api/v1/auth/verify-email/consume", json={"token": token})
    # Log in so we have a refresh row
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    assert login.status_code == 200

    async with AsyncSessionLocal() as s:
        user = (await s.execute(select(User).where(User.email == email))).scalar_one()
        before = (
            await s.execute(
                select(RefreshToken).where(RefreshToken.user_id == user.id)
            )
        ).all()
        assert len(before) >= 1

    # Trigger a reset
    request = await client.post(
        "/api/v1/auth/password-reset/request", json={"email": email}
    )
    assert request.status_code == 202

    async with AsyncSessionLocal() as s:
        user = (await s.execute(select(User).where(User.email == email))).scalar_one()
        reset_token = (
            await s.execute(
                select(AuthActionToken).where(
                    AuthActionToken.user_id == user.id,
                    AuthActionToken.purpose == "reset_password",
                )
            )
        ).scalar_one()
    signed = sign_action_token(reset_token.jti)

    new_password = "freshhorsebattery2"
    confirm = await client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": signed, "new_password": new_password},
    )
    assert confirm.status_code == 200

    # Old refresh tokens are gone; the only one left is the freshly minted one
    async with AsyncSessionLocal() as s:
        user = (await s.execute(select(User).where(User.email == email))).scalar_one()
        after = (
            await s.execute(
                select(RefreshToken).where(RefreshToken.user_id == user.id)
            )
        ).all()
        assert len(after) == 1

    # Old password no longer works; new one does
    old_login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    assert old_login.status_code == 401
    new_login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": new_password}
    )
    assert new_login.status_code == 200


async def test_password_reset_request_silent_for_unknown_email(
    client: AsyncClient,
) -> None:
    """We don't reveal whether an email is registered."""
    response = await client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": "definitely-not-a-user@example.cz"},
    )
    assert response.status_code == 202


# --------------------------------------------------------------------------- #
# Cooldown
# --------------------------------------------------------------------------- #


async def test_resend_within_cooldown_returns_429(
    client: AsyncClient, cleanup_emails: list[str]
) -> None:
    email = _unique_email()
    cleanup_emails.append(email)
    await client.post(
        "/api/v1/auth/signup",
        json={"email": email, "password": "correcthorsebattery1", "name": "Newbie"},
    )

    # Immediate resend → cooldown
    response = await client.post(
        "/api/v1/auth/verify-email/resend", json={"email": email}
    )
    assert response.status_code == 429
    assert "Retry-After" in response.headers
    retry_after = int(response.headers["Retry-After"])
    assert 1 <= retry_after <= RESEND_COOLDOWN_SECONDS


# --------------------------------------------------------------------------- #
# Sanity: link helper builds the expected URL shape
# --------------------------------------------------------------------------- #


def test_verify_email_link_uses_configured_path() -> None:
    settings = get_settings()
    link = _verify_email_link("abc.def.ghi")
    assert link.startswith(("http://", "https://"))
    assert settings.frontend_verify_email_path in link
    assert "token=abc.def.ghi" in link


# --------------------------------------------------------------------------- #
# Invitation acceptance via email signup
# --------------------------------------------------------------------------- #
#
# Mirrors the Google-invite flow: an admin invites someone, the invitee
# clicks the link, and the new endpoint creates/adopts the user with a
# password instead of routing through OAuth. The invite click itself proves
# email ownership, so no separate verification email is sent.

from app.api.v1.auth import STATE_COOKIE_NAME  # noqa: E402
from app.core.security import sign_oauth_state  # noqa: E402
from app.db.models import Invitation, Organization  # noqa: E402
from app.main import app  # noqa: E402
from app.services.google_oauth import (  # noqa: E402
    GoogleProfile,
    get_google_oauth_client,
)


class _FakeGoogle:
    def __init__(self, profile: GoogleProfile) -> None:
        self.profile = profile

    def build_authorize_url(self, state: str) -> str:
        return f"https://accounts.google.com/o/oauth2/v2/auth?state={state}"

    async def exchange_code_for_profile(self, code: str) -> GoogleProfile:
        return self.profile


async def _bootstrap_org_admin(
    client: AsyncClient, *, email: str, name: str
) -> str:
    """Same shape as test_invitations.py's _signup_and_create_org — bootstrap
    a fresh org with a Google admin, return their access token. Lets us
    exercise /api/v1/invitations without spinning up our own org fixture."""
    profile = GoogleProfile(google_id=f"g-{secrets.token_hex(4)}", email=email, name=name, picture=None)
    app.dependency_overrides[get_google_oauth_client] = lambda: _FakeGoogle(profile)
    try:
        state = sign_oauth_state({"nonce": "n"})
        cb = await client.get(
            "/api/v1/auth/google/callback",
            params={"code": "test-auth-code", "state": state},
            cookies={STATE_COOKIE_NAME: state},
            follow_redirects=False,
        )
        access = cb.headers["location"].split("#access_token=", 1)[1]
        create = await client.post(
            "/api/v1/onboarding/organization",
            json={"name": f"Org-{secrets.token_hex(2)}", "seat_count": 25},
            headers={"Authorization": f"Bearer {access}"},
        )
        if create.status_code not in (201, 409):
            raise AssertionError(f"create-org failed: {create.status_code} {create.text}")
    finally:
        app.dependency_overrides.pop(get_google_oauth_client, None)
    return access


@pytest.fixture
async def org_admin_with_invite() -> AsyncIterator[tuple[str, str, str]]:
    """Provisions an org + admin + an open invitation. Yields
    (admin_token, invite_url_token, invitee_email). Tears down all rows on
    exit so the shared dev DB stays clean."""
    from httpx import ASGITransport
    from httpx import AsyncClient as Ac

    admin_email = f"invadmin-{secrets.token_hex(4)}@example.cz"
    invitee_email = f"invitee-{secrets.token_hex(4)}@example.cz"

    async with Ac(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token = await _bootstrap_org_admin(ac, email=admin_email, name="Inv Admin")
        invite_resp = await ac.post(
            "/api/v1/invitations",
            json={
                "email": invitee_email,
                "role": "salesperson",
                "team_id": None,
                "can_invite": False,
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert invite_resp.status_code == 201, invite_resp.text
        invite_url = invite_resp.json()["invite_url"]
        invite_token = invite_url.rsplit("/", 1)[-1]

    try:
        yield token, invite_token, invitee_email
    finally:
        async with AsyncSessionLocal() as s:
            for email in (admin_email, invitee_email):
                user = (
                    await s.execute(select(User).where(User.email == email))
                ).scalar_one_or_none()
                if user is None:
                    continue
                org_id = user.organization_id
                await s.execute(delete(Invitation).where(Invitation.organization_id == org_id))
                await s.execute(delete(User).where(User.organization_id == org_id))
                if org_id is not None:
                    await s.execute(delete(Organization).where(Organization.id == org_id))
            await s.commit()


async def test_invite_accept_creates_user_and_logs_in(
    client: AsyncClient, org_admin_with_invite: tuple[str, str, str]
) -> None:
    _admin_token, invite_token, invitee_email = org_admin_with_invite

    response = await client.post(
        "/api/v1/auth/invite/accept",
        json={
            "token": invite_token,
            "password": "invitedpass1234",
            "name": "Invited Person",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert "access_token" in body
    assert body["user"]["email"] == invitee_email
    assert REFRESH_COOKIE_NAME in response.cookies

    # User now belongs to the org with the invite's role + verified email
    async with AsyncSessionLocal() as s:
        user = (await s.execute(select(User).where(User.email == invitee_email))).scalar_one()
        assert user.organization_id is not None
        assert user.role == UserRole.salesperson
        assert user.password_hash is not None
        assert user.email_verified is True

    # Invitation is marked accepted; second accept should 409
    second = await client.post(
        "/api/v1/auth/invite/accept",
        json={
            "token": invite_token,
            "password": "anotherpass5678",
            "name": "Imposter",
        },
    )
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "invitation_consumed"


async def test_invite_accept_then_login_with_password(
    client: AsyncClient, org_admin_with_invite: tuple[str, str, str]
) -> None:
    _admin_token, invite_token, invitee_email = org_admin_with_invite
    accept = await client.post(
        "/api/v1/auth/invite/accept",
        json={
            "token": invite_token,
            "password": "invitedpass1234",
            "name": "Invited Person",
        },
    )
    assert accept.status_code == 200

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": invitee_email, "password": "invitedpass1234"},
    )
    assert login.status_code == 200


async def test_invite_accept_rejects_weak_password(
    client: AsyncClient, org_admin_with_invite: tuple[str, str, str]
) -> None:
    _admin_token, invite_token, _invitee_email = org_admin_with_invite
    response = await client.post(
        "/api/v1/auth/invite/accept",
        json={"token": invite_token, "password": "short", "name": "X"},
    )
    # Pydantic min_length=12 catches this first
    assert response.status_code == 422


async def test_invite_accept_invalid_token(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/invite/accept",
        json={"token": "garbage", "password": "valid12345678", "name": "X"},
    )
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "invitation_not_found"


async def test_invite_accept_links_existing_oauth_only_user(
    client: AsyncClient, org_admin_with_invite: tuple[str, str, str]
) -> None:
    """Invitee already has a Google-only User row (no password, no org).
    Accepting the invite should adopt them into the org AND set a password
    so they can later log in either way."""
    _admin_token, invite_token, invitee_email = org_admin_with_invite

    # Pre-create a Google-only user with the invitee's email
    async with AsyncSessionLocal() as s:
        s.add(
            User(
                id=uuid.uuid4(),
                email=invitee_email,
                name="Pre Existing",
                google_id=f"g-{secrets.token_hex(4)}",
                password_hash=None,
                email_verified=True,
                role=UserRole.salesperson,
            )
        )
        await s.commit()

    response = await client.post(
        "/api/v1/auth/invite/accept",
        json={
            "token": invite_token,
            "password": "linkedpass1234",
            "name": "Pre Existing",
        },
    )
    assert response.status_code == 200, response.text

    async with AsyncSessionLocal() as s:
        user = (await s.execute(select(User).where(User.email == invitee_email))).scalar_one()
        assert user.organization_id is not None
        assert user.password_hash is not None  # password got set during link
        assert user.google_id is not None  # google_id preserved


async def test_invite_accept_rejects_user_in_other_org(
    client: AsyncClient, org_admin_with_invite: tuple[str, str, str]
) -> None:
    """If the invitee's email already belongs to a *different* org, refuse."""
    _admin_token, invite_token, invitee_email = org_admin_with_invite

    other_org_id = uuid.uuid4()
    async with AsyncSessionLocal() as s:
        s.add(
            Organization(
                id=other_org_id,
                name="Some Other Org",
                ico=None,
                locale="cs-CZ",
                currency="CZK",
            )
        )
        s.add(
            User(
                id=uuid.uuid4(),
                email=invitee_email,
                name="Other Org User",
                organization_id=other_org_id,
                password_hash=None,
                email_verified=True,
                role=UserRole.salesperson,
            )
        )
        await s.commit()

    try:
        response = await client.post(
            "/api/v1/auth/invite/accept",
            json={
                "token": invite_token,
                "password": "willnotmatter1234",
                "name": "Other Org User",
            },
        )
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "user_already_in_organization"
    finally:
        # Clean up the side-loaded other org + user; the fixture won't see them.
        async with AsyncSessionLocal() as s:
            await s.execute(delete(User).where(User.email == invitee_email))
            await s.execute(delete(Organization).where(Organization.id == other_org_id))
            await s.commit()
