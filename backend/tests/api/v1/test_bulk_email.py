"""Integration tests for /api/v1/companies/bulk-email/* (Task B4)."""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.core.token_crypto import encrypt_token
from app.db.models import (
    Company,
    EmailRecipientStatus,
    Organization,
    User,
    UserRole,
    UserSmtpSettings,
)
from app.db.session import AsyncSessionLocal


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
    session: AsyncSession,
    owned_cleanup: dict[str, list],
    *,
    org: Organization | None = None,
    role: UserRole = UserRole.salesperson,
) -> tuple[Organization, User]:
    if org is None:
        org = Organization(name=f"Org-{uuid.uuid4().hex[:6]}")
        session.add(org)
        await session.commit()
        await session.refresh(org)
        owned_cleanup["orgs"].append(org.id)
    email = f"u-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    user = User(email=email, name="Petr", role=role, organization_id=org.id)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return org, user


async def _verify_smtp(session: AsyncSession, user: User, org: Organization) -> None:
    session.add(
        UserSmtpSettings(
            user_id=user.id,
            organization_id=org.id,
            host="mail.x.cz",
            port=465,
            use_ssl=True,
            use_starttls=False,
            username="petr@firma.cz",
            password_encrypted=encrypt_token("pw"),
            from_email="petr@firma.cz",
            verified_at=datetime.now(tz=UTC),
        )
    )
    await session.commit()


def _auth(user: User) -> dict[str, str]:
    token = create_access_token(user.id, user.organization_id, user.role)
    return {"Authorization": f"Bearer {token}"}


def _fake_loop(config, subject, body, sender_name, units, attachments):
    return [
        {
            "company_id": u.company_id,
            "contact_id": u.contact_id,
            "email": u.email,
            "company_name": u.company_name,
            "status": EmailRecipientStatus.sent,
            "error": None,
            "sent_at": datetime.now(tz=UTC),
        }
        for u in units
    ]


async def test_recipients_owned_only_with_skip_flags(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, sales = await _seed_user(db_session, owned_cleanup)
    mine = Company(organization_id=org.id, name="Mine", email="m@x.cz", owner_user_id=sales.id)
    pool = Company(organization_id=org.id, name="Pool", email="p@x.cz", owner_user_id=None)
    no_email = Company(organization_id=org.id, name="NoEmail", owner_user_id=sales.id)
    db_session.add_all([mine, pool, no_email])
    await db_session.commit()

    r = await client.post(
        "/api/v1/companies/bulk-email/recipients", json={}, headers=_auth(sales)
    )
    assert r.status_code == 200, r.text
    by_name = {c["company_name"]: c for c in r.json()}
    assert "Mine" in by_name and "Pool" not in by_name
    assert by_name["Mine"]["emailable"] is True
    assert by_name["NoEmail"]["emailable"] is False
    assert by_name["NoEmail"]["skip_reason"] == "no_email"


async def test_send_requires_verified_smtp(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, sales = await _seed_user(db_session, owned_cleanup)
    co = Company(organization_id=org.id, name="ACME", email="acme@x.cz", owner_user_id=sales.id)
    db_session.add(co)
    await db_session.commit()
    payload = {
        "subject": "Hi",
        "body": "Body",
        "recipients": [{"company_id": str(co.id), "emails": ["acme@x.cz"]}],
    }
    r = await client.post(
        "/api/v1/companies/bulk-email/send",
        data={"payload": json.dumps(payload)},
        headers=_auth(sales),
    )
    assert r.status_code == 422
    assert "SMTP" in r.json()["detail"]


async def test_send_happy_path(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.services.bulk_email._run_send_loop", _fake_loop)
    org, sales = await _seed_user(db_session, owned_cleanup)
    await _verify_smtp(db_session, sales, org)
    co = Company(organization_id=org.id, name="ACME", email="acme@x.cz", owner_user_id=sales.id)
    db_session.add(co)
    await db_session.commit()
    payload = {
        "subject": "Nová nabídka",
        "body": "Dobrý den",
        "recipients": [{"company_id": str(co.id), "emails": ["acme@x.cz"]}],
    }
    r = await client.post(
        "/api/v1/companies/bulk-email/send",
        data={"payload": json.dumps(payload)},
        headers=_auth(sales),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sent_count"] == 1
    assert body["total"] == 1
    campaign_id = body["id"]

    # History list + detail.
    lst = await client.get("/api/v1/companies/bulk-email/campaigns", headers=_auth(sales))
    assert lst.status_code == 200
    assert any(c["id"] == campaign_id for c in lst.json()["items"])

    detail = await client.get(
        f"/api/v1/companies/bulk-email/campaigns/{campaign_id}", headers=_auth(sales)
    )
    assert detail.status_code == 200
    assert detail.json()["recipients"][0]["status"] == "sent"
    assert detail.json()["body"] == "Dobrý den"


async def test_send_rejects_empty_recipients(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, sales = await _seed_user(db_session, owned_cleanup)
    await _verify_smtp(db_session, sales, org)
    payload = {"subject": "Hi", "body": "Body", "recipients": []}
    r = await client.post(
        "/api/v1/companies/bulk-email/send",
        data={"payload": json.dumps(payload)},
        headers=_auth(sales),
    )
    assert r.status_code == 422


async def test_campaign_detail_cross_user_scoping(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.services.bulk_email._run_send_loop", _fake_loop)
    org, sales = await _seed_user(db_session, owned_cleanup)
    await _verify_smtp(db_session, sales, org)
    co = Company(organization_id=org.id, name="ACME", email="acme@x.cz", owner_user_id=sales.id)
    db_session.add(co)
    await db_session.commit()
    payload = {
        "subject": "S",
        "body": "B",
        "recipients": [{"company_id": str(co.id), "emails": ["acme@x.cz"]}],
    }
    sent = await client.post(
        "/api/v1/companies/bulk-email/send",
        data={"payload": json.dumps(payload)},
        headers=_auth(sales),
    )
    campaign_id = sent.json()["id"]

    # A different salesperson in the same org cannot read it.
    _org, other = await _seed_user(db_session, owned_cleanup, org=org)
    r = await client.get(
        f"/api/v1/companies/bulk-email/campaigns/{campaign_id}", headers=_auth(other)
    )
    assert r.status_code == 404

    # An admin in the org can.
    _org2, admin = await _seed_user(db_session, owned_cleanup, org=org, role=UserRole.admin)
    r2 = await client.get(
        f"/api/v1/companies/bulk-email/campaigns/{campaign_id}", headers=_auth(admin)
    )
    assert r2.status_code == 200
