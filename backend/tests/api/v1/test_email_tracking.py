"""Integration tests for email open/click tracking (feature F1).

Covers the two public endpoints (`/api/v1/t/o/{token}`, `/api/v1/t/c/{token}`)
and the send-side wiring: a tracked composer send builds multipart/alternative
with an untouched plain part, and `track=false` produces neither a token nor a
pixel.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.core.token_crypto import encrypt_token
from app.db.models import (
    Company,
    Deal,
    EmailCampaign,
    EmailCampaignRecipient,
    EmailRecipientStatus,
    Organization,
    SentEmail,
    Stage,
    User,
    UserRole,
    UserSmtpSettings,
)
from app.db.session import AsyncSessionLocal
from app.services.email import Email, _build_mime
from app.services.email_tracking import (
    TRACKING_PIXEL_GIF,
    encode_target,
    new_tracking_token,
    sign_target,
)
from app.services.pipeline import create_default_pipeline


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


async def _seed(
    session: AsyncSession, owned_cleanup: dict[str, list]
) -> tuple[User, Company, Deal]:
    org = Organization(name=f"Org-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.commit()
    await session.refresh(org)
    owned_cleanup["orgs"].append(org.id)
    pipeline = await create_default_pipeline(session, org.id)
    await session.commit()
    await session.refresh(pipeline, attribute_names=["stages"])
    stage: Stage = pipeline.stages[0]

    email = f"u-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    admin = User(email=email, name="Admin", role=UserRole.admin, organization_id=org.id)
    company = Company(organization_id=org.id, name="Acme", email="info@acme.cz")
    session.add_all([admin, company])
    await session.commit()
    await session.refresh(admin)
    await session.refresh(company)

    session.add(
        UserSmtpSettings(
            user_id=admin.id,
            organization_id=org.id,
            host="smtp.example.com",
            port=587,
            use_ssl=False,
            use_starttls=True,
            username="admin@example.com",
            password_encrypted=encrypt_token("secret"),
            from_email="admin@example.com",
            from_name="Admin",
            verified_at=datetime.now(tz=UTC),
        )
    )
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=stage.id,
        owner_user_id=admin.id,
        name="Deal",
        value=0,
        currency="CZK",
    )
    session.add(deal)
    await session.commit()
    await session.refresh(deal)
    return admin, company, deal


def _auth(user: User) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {create_access_token(user.id, user.organization_id, user.role)}"
    }


# ---------------------------------------------------------------------------
# Open pixel
# ---------------------------------------------------------------------------


async def test_pixel_records_open_and_returns_gif(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    admin, company, _ = await _seed(db_session, owned_cleanup)
    token = new_tracking_token()
    sent = SentEmail(
        organization_id=admin.organization_id,
        sender_user_id=admin.id,
        company_id=company.id,
        to_emails=["a@ex.cz"],
        cc_emails=[],
        bcc_emails=[],
        subject="S",
        body="B",
        attachment_filenames=[],
        status="sent",
        message_id="<x@ex.cz>",
        thread_id=uuid.uuid4(),
        tracking_token=token,
    )
    db_session.add(sent)
    await db_session.commit()

    resp = await client.get(f"/api/v1/t/o/{token}")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/gif"
    assert resp.content == TRACKING_PIXEL_GIF
    assert "no-store" in resp.headers["cache-control"]

    async with AsyncSessionLocal() as check:
        row = (
            await check.execute(select(SentEmail).where(SentEmail.tracking_token == token))
        ).scalar_one()
        assert row.open_count == 1
        assert row.opened_at is not None
        first_open = row.opened_at

    # A second open bumps the counter but keeps the first-seen timestamp.
    await client.get(f"/api/v1/t/o/{token}")
    async with AsyncSessionLocal() as check:
        row = (
            await check.execute(select(SentEmail).where(SentEmail.tracking_token == token))
        ).scalar_one()
        assert row.open_count == 2
        assert row.opened_at == first_open


async def test_pixel_unknown_token_still_returns_gif(client: AsyncClient) -> None:
    """Never 404: that would leak which tokens exist and break the image."""
    resp = await client.get(f"/api/v1/t/o/{new_tracking_token()}")
    assert resp.status_code == 200
    assert resp.content == TRACKING_PIXEL_GIF


# ---------------------------------------------------------------------------
# Click redirect
# ---------------------------------------------------------------------------


async def _seed_sent(session: AsyncSession, admin: User, company: Company, token: str) -> None:
    session.add(
        SentEmail(
            organization_id=admin.organization_id,
            sender_user_id=admin.id,
            company_id=company.id,
            to_emails=["a@ex.cz"],
            cc_emails=[],
            bcc_emails=[],
            subject="S",
            body="B",
            attachment_filenames=[],
            status="sent",
            message_id="<x@ex.cz>",
            thread_id=uuid.uuid4(),
            tracking_token=token,
        )
    )
    await session.commit()


async def test_click_valid_signature_redirects_and_records(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    admin, company, _ = await _seed(db_session, owned_cleanup)
    token = new_tracking_token()
    await _seed_sent(db_session, admin, company, token)

    target = "https://example.com/nabidka?id=7&x=1"
    u = encode_target(target)
    resp = await client.get(f"/api/v1/t/c/{token}?u={u}&s={sign_target(token, u)}")
    assert resp.status_code == 302
    assert resp.headers["location"] == target

    async with AsyncSessionLocal() as check:
        row = (
            await check.execute(select(SentEmail).where(SentEmail.tracking_token == token))
        ).scalar_one()
        assert row.click_count == 1
        assert row.clicked_at is not None


async def test_click_tampered_signature_is_400_and_records_nothing(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    admin, company, _ = await _seed(db_session, owned_cleanup)
    token = new_tracking_token()
    await _seed_sent(db_session, admin, company, token)

    # Signature harvested for one target, replayed onto an attacker's.
    good = encode_target("https://example.com/ok")
    evil = encode_target("https://evil.example/steal")
    resp = await client.get(f"/api/v1/t/c/{token}?u={evil}&s={sign_target(token, good)}")
    assert resp.status_code == 400
    assert "location" not in resp.headers

    async with AsyncSessionLocal() as check:
        row = (
            await check.execute(select(SentEmail).where(SentEmail.tracking_token == token))
        ).scalar_one()
        assert row.click_count == 0
        assert row.clicked_at is None


async def test_click_non_http_scheme_is_400_even_with_valid_signature(
    client: AsyncClient,
) -> None:
    """Defense in depth: a correctly-signed `javascript:` target is still refused."""
    token = new_tracking_token()
    u = encode_target("javascript:alert(1)")
    resp = await client.get(f"/api/v1/t/c/{token}?u={u}&s={sign_target(token, u)}")
    assert resp.status_code == 400
    assert "location" not in resp.headers


async def test_click_signature_is_bound_to_its_token(client: AsyncClient) -> None:
    """A signature minted for one send can't be replayed under another token."""
    u = encode_target("https://example.com/ok")
    resp = await client.get(
        f"/api/v1/t/c/{new_tracking_token()}?u={u}&s={sign_target(new_tracking_token(), u)}"
    )
    assert resp.status_code == 400


async def test_click_unknown_token_never_redirects(client: AsyncClient) -> None:
    """Signing proves nothing about the token, so a correctly-signed link for a
    token that belongs to no send must NOT redirect — otherwise the endpoint is a
    general-purpose open redirect on our own API origin (review F1 P2)."""
    token = new_tracking_token()
    u = encode_target("https://evil.example/phish")
    resp = await client.get(f"/api/v1/t/c/{token}?u={u}&s={sign_target(token, u)}")
    assert resp.status_code == 400
    assert "location" not in resp.headers


async def test_click_non_ascii_signature_is_400_not_500(client: AsyncClient) -> None:
    """`hmac.compare_digest` raises TypeError on non-ASCII str. This endpoint is
    unauthenticated and mail scanners mangle query params, so a junk signature has
    to be a plain mismatch, never a 500 (review F1 P1)."""
    token = new_tracking_token()
    u = encode_target("https://example.com/ok")
    resp = await client.get(f"/api/v1/t/c/{token}?u={u}&s=řřř")
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Send pipeline
# ---------------------------------------------------------------------------


async def test_tracked_send_builds_multipart_with_pixel_and_rewritten_links(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin, _, deal = await _seed(db_session, owned_cleanup)
    captured: list[Email] = []

    async def _capture(message: Email, _config: object) -> None:
        captured.append(message)

    monkeypatch.setattr("app.services.mailer.send_email_via", _capture)

    body = "Dobrý den,\nnabídka: https://example.com/a?b=1&c=2\nS pozdravem"
    resp = await client.post(
        "/api/v1/emails",
        headers=_auth(admin),
        data={
            "payload": json.dumps(
                {
                    "to": ["a@ex.cz"],
                    "subject": "S",
                    "body": body,
                    "deal_id": str(deal.id),
                }
            )
        },
    )
    assert resp.status_code == 201, resp.text
    out = resp.json()
    assert out["open_count"] == 0 and out["click_count"] == 0

    async with AsyncSessionLocal() as check:
        row = (
            await check.execute(select(SentEmail).where(SentEmail.id == uuid.UUID(out["id"])))
        ).scalar_one()
        token = row.tracking_token
    assert token is not None

    message = captured[0]
    # Plain part is untouched: original URL, no redirector, no pixel.
    assert message.body == body
    assert "/t/c/" not in message.body
    assert "/t/o/" not in message.body
    assert message.html_body is not None
    assert f"/api/v1/t/o/{token}" in message.html_body
    assert f"/api/v1/t/c/{token}?u=" in message.html_body
    # The visible link text stays the original URL (escaped).
    assert "https://example.com/a?b=1&amp;c=2</a>" in message.html_body
    assert 'width="1" height="1" alt="" style="display:none"' in message.html_body

    mime = _build_mime(message, sender="admin@example.com")
    assert mime.get_content_type() == "multipart/alternative"
    subtypes = [p.get_content_type() for p in mime.iter_parts()]  # type: ignore[union-attr]
    assert subtypes == ["text/plain", "text/html"]
    plain = mime.get_body(preferencelist=("plain",))
    assert plain is not None
    assert plain.get_content().rstrip("\n") == body  # type: ignore[union-attr]


async def test_untracked_send_has_no_token_pixel_or_rewrite(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin, _, deal = await _seed(db_session, owned_cleanup)
    captured: list[Email] = []

    async def _capture(message: Email, _config: object) -> None:
        captured.append(message)

    monkeypatch.setattr("app.services.mailer.send_email_via", _capture)

    resp = await client.post(
        "/api/v1/emails",
        headers=_auth(admin),
        data={
            "payload": (
                '{"to": ["a@ex.cz"], "subject": "S", "body": "Odkaz https://example.com/x", '
                f'"deal_id": "{deal.id}", "track": false}}'
            )
        },
    )
    assert resp.status_code == 201, resp.text
    out = resp.json()

    async with AsyncSessionLocal() as check:
        row = (
            await check.execute(select(SentEmail).where(SentEmail.id == uuid.UUID(out["id"])))
        ).scalar_one()
        assert row.tracking_token is None

    message = captured[0]
    assert message.html_body is None
    assert message.body == "Odkaz https://example.com/x"
    mime = _build_mime(message, sender="admin@example.com")
    assert mime.get_content_type() == "text/plain"


# ---------------------------------------------------------------------------
# Campaign aggregates
# ---------------------------------------------------------------------------


async def test_campaign_detail_reports_open_and_click_aggregates(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    admin, company, _ = await _seed(db_session, owned_cleanup)
    token = new_tracking_token()
    campaign = EmailCampaign(
        organization_id=admin.organization_id,
        created_by_user_id=admin.id,
        subject="Kampaň",
        body="Text https://example.com/x",
        from_email="admin@example.com",
        total=2,
        sent_count=2,
        failed_count=0,
        skipped_count=0,
    )
    campaign.recipients.append(
        EmailCampaignRecipient(
            company_id=company.id,
            email="a@ex.cz",
            company_name="Acme",
            status=EmailRecipientStatus.sent,
            tracking_token=token,
        )
    )
    campaign.recipients.append(
        EmailCampaignRecipient(
            company_id=company.id,
            email="b@ex.cz",
            company_name="Acme",
            status=EmailRecipientStatus.sent,
            tracking_token=new_tracking_token(),
        )
    )
    db_session.add(campaign)
    await db_session.commit()

    await client.get(f"/api/v1/t/o/{token}")
    u = encode_target("https://example.com/x")
    await client.get(f"/api/v1/t/c/{token}?u={u}&s={sign_target(token, u)}")

    detail = await client.get(
        f"/api/v1/companies/bulk-email/campaigns/{campaign.id}", headers=_auth(admin)
    )
    assert detail.status_code == 200, detail.text
    data = detail.json()
    assert data["opened_count"] == 1
    assert data["clicked_count"] == 1
    assert data["open_rate"] == 0.5
    assert data["click_rate"] == 0.5
    by_email = {r["email"]: r for r in data["recipients"]}
    assert by_email["a@ex.cz"]["open_count"] == 1
    assert by_email["a@ex.cz"]["click_count"] == 1
    assert by_email["b@ex.cz"]["open_count"] == 0

    listing = await client.get("/api/v1/companies/bulk-email/campaigns", headers=_auth(admin))
    assert listing.status_code == 200
    row = next(c for c in listing.json()["items"] if c["id"] == str(campaign.id))
    assert row["opened_count"] == 1
    assert row["clicked_count"] == 1
