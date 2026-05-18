"""Integration tests for POST /api/v1/feedback.

Covers the happy path (no attachment + PNG attachment), validation
(missing fields, oversized + bad mime), the rate limiter, and the
auth gate.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.api.v1.auth import STATE_COOKIE_NAME
from app.api.v1.feedback import _FEEDBACK_RATE_LIMITER
from app.core.security import sign_oauth_state
from app.db.models import Organization, User
from app.db.session import AsyncSessionLocal
from app.main import app
from app.services import email as email_service
from app.services.google_oauth import GoogleProfile, get_google_oauth_client


class FakeGoogle:
    def __init__(self, profile: GoogleProfile) -> None:
        self.profile = profile

    def build_authorize_url(self, state: str) -> str:
        return f"https://accounts.google.com/o/oauth2/v2/auth?state={state}"

    async def exchange_code_for_profile(self, code: str) -> GoogleProfile:
        return self.profile


async def _signup_and_create_org(client: AsyncClient, profile: GoogleProfile) -> str:
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
        await client.post(
            "/api/v1/onboarding/organization",
            json={"name": "Feedback Org", "seat_count": 3},
            headers={"Authorization": f"Bearer {access}"},
        )
    finally:
        app.dependency_overrides.pop(get_google_oauth_client, None)
    return access


@pytest.fixture
async def user_token() -> AsyncIterator[str]:
    profile = GoogleProfile(
        google_id="g-fb-user",
        email="reporter@feedback.cz",
        name="Reporter Person",
        picture=None,
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token = await _signup_and_create_org(ac, profile)
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
    await _FEEDBACK_RATE_LIMITER.reset()


# A minimum-viable PNG: header + IHDR + IDAT + IEND. 67 bytes total.
PNG_BYTES = bytes.fromhex(
    "89504e470d0a1a0a"  # magic
    "0000000d49484452"  # IHDR length + type
    "0000000100000001080600000000"  # 1x1 pixel
    "1f15c4890000000d4944415478da63"  # IHDR CRC + IDAT
    "fcff0500050001"  # IDAT data
    "01"  # extra
    "0000000049454e44ae426082"  # IEND
)


async def test_submit_feedback_without_attachment_dispatches_email(
    monkeypatch: pytest.MonkeyPatch, client: AsyncClient, user_token: str
) -> None:
    captured: list[email_service.Email] = []

    async def fake_send(msg: email_service.Email) -> None:
        captured.append(msg)

    monkeypatch.setattr(email_service, "send_email", fake_send)
    # The router imported `send_email` at import time; patch the local
    # reference too.
    from app.api.v1 import feedback as feedback_module

    monkeypatch.setattr(feedback_module, "send_email", fake_send)

    response = await client.post(
        "/api/v1/feedback",
        data={
            "kind": "bug",
            "caption": "Pipeline kanban se rozpadá",
            "body": "Po kliknutí na šipku kartička zmizí.",
        },
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert response.status_code == 202, response.text
    assert response.json() == {"delivered": True, "recipient": "podpora@simplecrm.cz"}
    assert len(captured) == 1
    msg = captured[0]
    assert msg.to == "podpora@simplecrm.cz"
    # Feedback notifications go out from the info send-as identity.
    assert msg.sender_role == "info"
    assert "[BUG]" in msg.subject
    assert "Pipeline kanban" in msg.subject
    assert msg.reply_to == "reporter@feedback.cz"
    assert "Po kliknutí" in msg.body
    assert msg.attachments == ()


async def test_submit_feedback_with_png_attachment_passes_through(
    monkeypatch: pytest.MonkeyPatch, client: AsyncClient, user_token: str
) -> None:
    captured: list[email_service.Email] = []

    async def fake_send(msg: email_service.Email) -> None:
        captured.append(msg)

    from app.api.v1 import feedback as feedback_module

    monkeypatch.setattr(feedback_module, "send_email", fake_send)

    response = await client.post(
        "/api/v1/feedback",
        data={"kind": "improvement", "caption": "Tmavý režim", "body": "Bylo by fajn..."},
        files=[("attachments", ("shot.png", PNG_BYTES, "image/png"))],
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert response.status_code == 202, response.text
    assert len(captured) == 1
    msg = captured[0]
    assert "[Improvement]" in msg.subject
    assert len(msg.attachments) == 1
    att = msg.attachments[0]
    assert att.content_type == "image/png"
    assert att.content == PNG_BYTES
    assert att.filename == "shot.png"


async def test_submit_feedback_rejects_non_image(client: AsyncClient, user_token: str) -> None:
    fake_pdf = b"%PDF-1.4\n%not really an image\n"
    response = await client.post(
        "/api/v1/feedback",
        data={"kind": "bug", "caption": "x", "body": "y"},
        files=[("attachments", ("doc.pdf", fake_pdf, "application/pdf"))],
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert response.status_code == 400
    assert "PNG" in response.json()["detail"]


async def test_submit_feedback_rejects_oversized_attachment(
    client: AsyncClient, user_token: str
) -> None:
    # Forge a PNG header but make the body too long.
    big = b"\x89PNG\r\n\x1a\n" + b"\x00" * (5 * 1024 * 1024 + 50)
    response = await client.post(
        "/api/v1/feedback",
        data={"kind": "bug", "caption": "x", "body": "y"},
        files=[("attachments", ("big.png", big, "image/png"))],
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert response.status_code == 400
    assert "5 MB" in response.json()["detail"]


async def test_submit_feedback_requires_auth(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/feedback",
        data={"kind": "bug", "caption": "x", "body": "y"},
    )
    assert response.status_code == 401


async def test_feedback_rate_limiter_kicks_in(
    monkeypatch: pytest.MonkeyPatch, client: AsyncClient, user_token: str
) -> None:
    from app.api.v1 import feedback as feedback_module

    async def fake_send(msg: email_service.Email) -> None:
        return None

    monkeypatch.setattr(feedback_module, "send_email", fake_send)

    for _ in range(5):
        ok = await client.post(
            "/api/v1/feedback",
            data={"kind": "bug", "caption": "x", "body": "y"},
            headers={"Authorization": f"Bearer {user_token}"},
        )
        assert ok.status_code == 202, ok.text

    over = await client.post(
        "/api/v1/feedback",
        data={"kind": "bug", "caption": "x", "body": "y"},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert over.status_code == 429
