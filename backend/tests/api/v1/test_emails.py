"""Integration tests for /api/v1/emails (single-email send + history)."""

from __future__ import annotations

import smtplib
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
    Activity,
    ActivityType,
    Company,
    Deal,
    Organization,
    SentEmail,
    SentEmailStatus,
    Stage,
    User,
    UserRole,
    UserSmtpSettings,
)
from app.db.session import AsyncSessionLocal
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
    session: AsyncSession, owned_cleanup: dict[str, list], *, verified_smtp: bool = True
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

    if verified_smtp:
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


async def test_send_success_records_sent_and_logs_activity(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin, _, deal = await _seed(db_session, owned_cleanup)

    async def _ok(_message: object, _config: object) -> None:
        return None

    monkeypatch.setattr("app.services.mailer.send_email_via", _ok)

    resp = await client.post(
        "/api/v1/emails",
        headers=_auth(admin),
        data={
            "payload": (
                '{"to": ["a@ex.cz"], "subject": "Ahoj", "body": "Text", '
                f'"deal_id": "{deal.id}"}}'
            )
        },
        files=[("attachments", ("smlouva.pdf", b"%PDF-1.4 data", "application/pdf"))],
    )
    assert resp.status_code == 201, resp.text
    out = resp.json()
    assert out["status"] == "sent"
    assert out["attachment_filenames"] == ["smlouva.pdf"]

    sent = (
        (await db_session.execute(select(SentEmail).where(SentEmail.deal_id == deal.id)))
        .scalars()
        .all()
    )
    assert len(sent) == 1
    assert sent[0].status is SentEmailStatus.sent

    acts = (
        (
            await db_session.execute(
                select(Activity).where(
                    Activity.company_id == deal.company_id,
                    Activity.activity_type == ActivityType.email_sent,
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(acts) == 1


async def test_send_transport_failure_records_failed_no_activity(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin, _, deal = await _seed(db_session, owned_cleanup)

    async def _boom(_message: object, _config: object) -> None:
        raise smtplib.SMTPException("mailbox unavailable")

    monkeypatch.setattr("app.services.mailer.send_email_via", _boom)

    resp = await client.post(
        "/api/v1/emails",
        headers=_auth(admin),
        data={"payload": f'{{"to": ["a@ex.cz"], "subject": "S", "deal_id": "{deal.id}"}}'},
    )
    assert resp.status_code == 201, resp.text
    out = resp.json()
    assert out["status"] == "failed"
    assert "mailbox unavailable" in (out["error"] or "")

    acts = (
        (
            await db_session.execute(
                select(Activity).where(
                    Activity.company_id == deal.company_id,
                    Activity.activity_type == ActivityType.email_sent,
                )
            )
        )
        .scalars()
        .all()
    )
    assert acts == []


async def test_send_without_verified_smtp_is_409_and_writes_nothing(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    admin, _, deal = await _seed(db_session, owned_cleanup, verified_smtp=False)
    resp = await client.post(
        "/api/v1/emails",
        headers=_auth(admin),
        data={"payload": f'{{"to": ["a@ex.cz"], "subject": "S", "deal_id": "{deal.id}"}}'},
    )
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "smtp_not_verified"
    count = (
        await db_session.execute(select(SentEmail).where(SentEmail.deal_id == deal.id))
    ).scalars().all()
    assert count == []


async def test_reply_shares_thread_and_links_in_reply_to(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin, _, deal = await _seed(db_session, owned_cleanup)

    async def _ok(_message: object, _config: object) -> None:
        return None

    monkeypatch.setattr("app.services.mailer.send_email_via", _ok)

    first = await client.post(
        "/api/v1/emails",
        headers=_auth(admin),
        data={"payload": f'{{"to": ["a@ex.cz"], "subject": "Hi", "deal_id": "{deal.id}"}}'},
    )
    parent = first.json()

    reply = await client.post(
        "/api/v1/emails",
        headers=_auth(admin),
        data={
            "payload": (
                '{"to": ["a@ex.cz"], "subject": "Re: Hi", '
                f'"deal_id": "{deal.id}", "reply_to_email_id": "{parent["id"]}"}}'
            )
        },
    )
    assert reply.status_code == 201, reply.text
    child = reply.json()
    assert child["thread_id"] == parent["thread_id"]
    assert child["in_reply_to_message_id"] == parent["message_id"]


async def test_attachment_too_large_is_422(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin, _, deal = await _seed(db_session, owned_cleanup)
    monkeypatch.setattr("app.services.mailer.send_email_via", lambda *a, **k: None)
    big = b"x" * (10 * 1024 * 1024 + 1)
    resp = await client.post(
        "/api/v1/emails",
        headers=_auth(admin),
        data={"payload": f'{{"to": ["a@ex.cz"], "subject": "S", "deal_id": "{deal.id}"}}'},
        files=[("attachments", ("big.pdf", big, "application/pdf"))],
    )
    assert resp.status_code == 422


async def test_attachment_disallowed_type_is_422(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin, _, deal = await _seed(db_session, owned_cleanup)
    monkeypatch.setattr("app.services.mailer.send_email_via", lambda *a, **k: None)
    resp = await client.post(
        "/api/v1/emails",
        headers=_auth(admin),
        data={"payload": f'{{"to": ["a@ex.cz"], "subject": "S", "deal_id": "{deal.id}"}}'},
        files=[("attachments", ("evil.exe", b"MZ", "application/x-msdownload"))],
    )
    assert resp.status_code == 422


async def test_history_lists_deal_emails(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin, _, deal = await _seed(db_session, owned_cleanup)

    async def _ok(_message: object, _config: object) -> None:
        return None

    monkeypatch.setattr("app.services.mailer.send_email_via", _ok)
    await client.post(
        "/api/v1/emails",
        headers=_auth(admin),
        data={"payload": f'{{"to": ["a@ex.cz"], "subject": "One", "deal_id": "{deal.id}"}}'},
    )
    resp = await client.get(f"/api/v1/emails?deal_id={deal.id}", headers=_auth(admin))
    assert resp.status_code == 200
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["subject"] == "One"
