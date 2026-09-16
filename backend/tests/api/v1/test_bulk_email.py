"""Integration tests for /api/v1/companies/bulk-email/* (Task B4)."""

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
    Activity,
    ActivityEntityType,
    ActivityType,
    Company,
    Deal,
    EmailCampaignRecipient,
    EmailRecipientStatus,
    Organization,
    SentEmail,
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


def _fake_result(unit, status: EmailRecipientStatus, error: str | None) -> dict[str, object]:
    return {
        "company_id": unit.company_id,
        "contact_id": unit.contact_id,
        "email": unit.email,
        "company_name": unit.company_name,
        "status": status,
        "error": error,
        "sent_at": datetime.now(tz=UTC) if status is EmailRecipientStatus.sent else None,
        "tracking_token": unit.tracking_token,
        "rendered_subject": f"Nabídka pro {unit.company_name}",
        "rendered_body": f"Dobrý den, {unit.company_name}",
        "message_id": f"<{uuid.uuid4().hex}@firma.cz>",
    }


def _fake_loop(config, subject, body, context, signature, units, attachments):
    return [_fake_result(u, EmailRecipientStatus.sent, None) for u in units]


def _fake_loop_second_fails(config, subject, body, context, signature, units, attachments):
    return [
        _fake_result(u, EmailRecipientStatus.sent, None)
        if i == 0
        else _fake_result(u, EmailRecipientStatus.failed, "550 mailbox unavailable")
        for i, u in enumerate(units)
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

    r = await client.post("/api/v1/companies/bulk-email/recipients", json={}, headers=_auth(sales))
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


async def test_send_writes_sent_emails_rows_linked_to_campaign(
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
        "subject": "Nabídka pro {firma}",
        "body": "Dobrý den, {firma}",
        "recipients": [{"company_id": str(co.id), "emails": ["acme@x.cz"]}],
    }
    r = await client.post(
        "/api/v1/companies/bulk-email/send",
        data={"payload": json.dumps(payload)},
        headers=_auth(sales),
    )
    assert r.status_code == 200, r.text
    campaign_id = r.json()["id"]
    recipient = (
        await db_session.execute(
            select(EmailCampaignRecipient).where(
                EmailCampaignRecipient.campaign_id == uuid.UUID(campaign_id)
            )
        )
    ).scalar_one()

    rows = (
        (await db_session.execute(select(SentEmail).where(SentEmail.company_id == co.id)))
        .scalars()
        .all()
    )
    assert len(rows) == 1
    row = rows[0]
    assert str(row.campaign_id) == campaign_id
    assert row.sender_user_id == sales.id
    assert row.to_emails == ["acme@x.cz"]
    # The history shows what the recipient got — merge fields resolved.
    assert row.subject == "Nabídka pro ACME"
    assert row.body == "Dobrý den, ACME"
    assert row.status.value == "sent"
    assert row.deal_id is None
    # One token drives both the recipient row and the history row.
    assert row.tracking_token is not None
    assert row.tracking_token == recipient.tracking_token

    history = await client.get(f"/api/v1/emails?company_id={co.id}", headers=_auth(sales))
    assert history.status_code == 200, history.text
    items = history.json()["items"]
    assert [i["id"] for i in items] == [str(row.id)]
    assert items[0]["campaign_id"] == campaign_id

    activity = (
        await db_session.execute(
            select(Activity).where(
                Activity.company_id == co.id,
                Activity.activity_type == ActivityType.email_sent,
            )
        )
    ).scalar_one()
    assert activity.payload["campaign_id"] == campaign_id
    assert activity.payload["email_id"] == str(row.id)


async def test_send_with_create_deals_links_rows_to_the_new_deal(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.services.bulk_email._run_send_loop", _fake_loop)
    org, sales = await _seed_user(db_session, owned_cleanup)
    await create_default_pipeline(db_session, org.id)
    await db_session.commit()
    await _verify_smtp(db_session, sales, org)
    co = Company(organization_id=org.id, name="ACME", email="acme@x.cz", owner_user_id=sales.id)
    db_session.add(co)
    await db_session.commit()
    payload = {
        "subject": "Nabídka",
        "body": "Dobrý den",
        "create_deals": True,
        "deal_title": "Kampaň září",
        "recipients": [{"company_id": str(co.id), "emails": ["acme@x.cz"]}],
    }
    r = await client.post(
        "/api/v1/companies/bulk-email/send",
        data={"payload": json.dumps(payload)},
        headers=_auth(sales),
    )
    assert r.status_code == 200, r.text

    deal = (await db_session.execute(select(Deal).where(Deal.company_id == co.id))).scalar_one()
    assert deal.name == "Kampaň září"
    row = (
        await db_session.execute(select(SentEmail).where(SentEmail.company_id == co.id))
    ).scalar_one()
    assert row.deal_id == deal.id

    history = await client.get(f"/api/v1/emails?deal_id={deal.id}", headers=_auth(sales))
    assert history.status_code == 200, history.text
    assert [i["id"] for i in history.json()["items"]] == [str(row.id)]

    # The mail is logged on the deal it opened, so the deal's Průběh shows it.
    activity = (
        await db_session.execute(
            select(Activity).where(
                Activity.company_id == co.id, Activity.activity_type == ActivityType.email_sent
            )
        )
    ).scalar_one()
    assert activity.entity_type == ActivityEntityType.deal
    assert activity.entity_id == deal.id
    assert activity.payload["deal_name"] == "Kampaň září"
    assert activity.payload["email_id"] == str(row.id)


async def test_send_records_failed_recipients_as_failed_rows_and_skips_skipped(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.services.bulk_email._run_send_loop", _fake_loop_second_fails)
    org, sales = await _seed_user(db_session, owned_cleanup)
    await _verify_smtp(db_session, sales, org)
    ok = Company(organization_id=org.id, name="OK", email="ok@x.cz", owner_user_id=sales.id)
    bad = Company(organization_id=org.id, name="Bad", email="bad@x.cz", owner_user_id=sales.id)
    db_session.add_all([ok, bad])
    await db_session.commit()
    payload = {
        "subject": "Nabídka",
        "body": "Dobrý den",
        "recipients": [
            {"company_id": str(ok.id), "emails": ["ok@x.cz"]},
            {"company_id": str(bad.id), "emails": ["bad@x.cz"]},
            # Not one of the company's addresses → skipped, never attempted.
            {"company_id": str(ok.id), "emails": ["stranger@elsewhere.cz"]},
        ],
    }
    r = await client.post(
        "/api/v1/companies/bulk-email/send",
        data={"payload": json.dumps(payload)},
        headers=_auth(sales),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["sent_count"], body["failed_count"], body["skipped_count"]) == (1, 1, 1)

    rows = (
        (await db_session.execute(select(SentEmail).where(SentEmail.organization_id == org.id)))
        .scalars()
        .all()
    )
    by_company = {row.company_id: row for row in rows}
    assert set(by_company) == {ok.id, bad.id}
    assert by_company[ok.id].status.value == "sent"
    assert by_company[bad.id].status.value == "failed"
    assert by_company[bad.id].error == "550 mailbox unavailable"
    assert by_company[bad.id].sent_at is None
    # A failed attempt is not a sent mail — no activity for it.
    activities = (
        (
            await db_session.execute(
                select(Activity).where(
                    Activity.organization_id == org.id,
                    Activity.activity_type == ActivityType.email_sent,
                )
            )
        )
        .scalars()
        .all()
    )
    assert [a.company_id for a in activities] == [ok.id]


async def test_send_never_persists_a_foreign_company_id_on_a_skip_row(
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
        "subject": "Nabídka",
        "body": "Dobrý den",
        "recipients": [
            {"company_id": str(co.id), "emails": ["acme@x.cz"]},
            # A UUID that exists in no org: skipped, and it must not reach the
            # recipient row's FK (that would 500 after the first mail went out).
            {"company_id": str(uuid.uuid4()), "emails": ["x@y.cz"]},
        ],
    }
    r = await client.post(
        "/api/v1/companies/bulk-email/send",
        data={"payload": json.dumps(payload)},
        headers=_auth(sales),
    )
    assert r.status_code == 200, r.text
    assert (r.json()["sent_count"], r.json()["skipped_count"]) == (1, 1)
    detail = await client.get(
        f"/api/v1/companies/bulk-email/campaigns/{r.json()['id']}", headers=_auth(sales)
    )
    skipped = next(x for x in detail.json()["recipients"] if x["status"] == "skipped")
    assert skipped["company_id"] is None
    assert skipped["error"] == "not_allowed"


async def test_recipients_industry_filter_is_a_folded_substring_match(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, sales = await _seed_user(db_session, owned_cleanup)
    machines = Company(
        organization_id=org.id,
        name="Machines",
        email="m@x.cz",
        owner_user_id=sales.id,
        industry="Strojírenství",
    )
    food = Company(
        organization_id=org.id,
        name="Food",
        email="f@x.cz",
        owner_user_id=sales.id,
        industry="Potravinářství",
    )
    db_session.add_all([machines, food])
    await db_session.commit()

    r = await client.post(
        "/api/v1/companies/bulk-email/recipients",
        json={"industry": "stroji"},
        headers=_auth(sales),
    )
    assert r.status_code == 200, r.text
    assert {c["company_name"] for c in r.json()} == {"Machines"}


async def test_recipients_by_company_ids_stay_in_scope_and_ignore_filters(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, sales = await _seed_user(db_session, owned_cleanup)
    mine = Company(
        organization_id=org.id,
        name="Mine",
        email="m@x.cz",
        owner_user_id=sales.id,
        industry="Strojírenství",
    )
    pool = Company(organization_id=org.id, name="Pool", email="p@x.cz", owner_user_id=None)
    db_session.add_all([mine, pool])
    await db_session.commit()

    r = await client.post(
        "/api/v1/companies/bulk-email/recipients",
        json={"company_ids": [str(mine.id), str(pool.id)], "industry": "nesmysl"},
        headers=_auth(sales),
    )
    assert r.status_code == 200, r.text
    assert [c["company_name"] for c in r.json()] == ["Mine"]
