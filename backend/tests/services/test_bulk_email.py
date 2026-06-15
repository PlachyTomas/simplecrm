"""Tests for the bulk-email service (Task B3)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    BlockedCompany,
    BlockedCompanyReason,
    Company,
    Deal,
    EmailRecipientStatus,
    Organization,
    User,
    UserRole,
)
from app.schemas.bulk_email import (
    BulkEmailFilters,
    BulkEmailRecipientIn,
    BulkEmailSendIn,
)
from app.services.bulk_email import (
    BulkEmailError,
    render_message,
    resolve_recipients,
    send_campaign,
)
from app.services.pipeline import create_default_pipeline


async def _seed_org(db_session: AsyncSession) -> Organization:
    org = Organization(name=f"Org-{uuid.uuid4().hex[:6]}")
    db_session.add(org)
    await db_session.flush()
    return org


async def _user(db_session: AsyncSession, org: Organization, role: UserRole) -> User:
    u = User(
        email=f"u-{uuid.uuid4().hex[:8]}@ex.cz",
        name="Petr Prodejce",
        role=role,
        organization_id=org.id,
    )
    db_session.add(u)
    await db_session.flush()
    return u


def test_render_message_merges_fields() -> None:
    subj, body = render_message(
        "Nabídka pro {firma}",
        "Dobrý den {kontakt}, posílá {vlastnik}.",
        company_name="ACME",
        contact_name="Jan",
        sender_name="Petr",
    )
    assert subj == "Nabídka pro ACME"
    assert body == "Dobrý den Jan, posílá Petr."


def test_render_message_blank_contact() -> None:
    _subj, body = render_message(
        "x", "Dobrý den {kontakt}.", company_name="ACME", contact_name="", sender_name="Petr"
    )
    assert body == "Dobrý den ."


async def test_resolve_only_own_book_for_salesperson(db_session: AsyncSession) -> None:
    org = await _seed_org(db_session)
    sales = await _user(db_session, org, UserRole.salesperson)
    other = await _user(db_session, org, UserRole.salesperson)
    mine = Company(organization_id=org.id, name="Mine", email="mine@x.cz", owner_user_id=sales.id)
    pool = Company(organization_id=org.id, name="Pool", email="pool@x.cz", owner_user_id=None)
    theirs = Company(
        organization_id=org.id, name="Theirs", email="t@x.cz", owner_user_id=other.id
    )
    db_session.add_all([mine, pool, theirs])
    await db_session.flush()

    cands = await resolve_recipients(db_session, sales, BulkEmailFilters())
    ids = {c.company_id for c in cands}
    assert mine.id in ids
    assert pool.id not in ids  # owned-only excludes the pool
    assert theirs.id not in ids  # salesperson sees only their own book


async def test_resolve_marks_no_email_and_blocked(db_session: AsyncSession) -> None:
    org = await _seed_org(db_session)
    sales = await _user(db_session, org, UserRole.salesperson)
    ok = Company(organization_id=org.id, name="OK", email="ok@x.cz", owner_user_id=sales.id)
    no_email = Company(organization_id=org.id, name="NoEmail", owner_user_id=sales.id)
    blocked = Company(
        organization_id=org.id, name="Blocked", email="b@x.cz", ico="12345678",
        owner_user_id=sales.id,
    )
    db_session.add_all([ok, no_email, blocked])
    db_session.add(
        BlockedCompany(
            organization_id=org.id,
            ico="12345678",
            reason_category=BlockedCompanyReason.do_not_contact,
        )
    )
    await db_session.flush()

    by_id = {c.company_id: c for c in await resolve_recipients(db_session, sales, BulkEmailFilters())}
    assert by_id[ok.id].emailable is True
    assert by_id[no_email.id].emailable is False
    assert by_id[no_email.id].skip_reason == "no_email"
    assert by_id[blocked.id].emailable is False
    assert by_id[blocked.id].skip_reason == "blocked"


async def test_resolve_industry_filter(db_session: AsyncSession) -> None:
    org = await _seed_org(db_session)
    sales = await _user(db_session, org, UserRole.salesperson)
    it = Company(
        organization_id=org.id, name="IT Co", email="it@x.cz", industry="IT",
        owner_user_id=sales.id,
    )
    farm = Company(
        organization_id=org.id, name="Farm", email="f@x.cz", industry="Zemědělství",
        owner_user_id=sales.id,
    )
    db_session.add_all([it, farm])
    await db_session.flush()
    cands = await resolve_recipients(db_session, sales, BulkEmailFilters(industry="IT"))
    assert {c.company_id for c in cands} == {it.id}


async def test_resolve_no_order_since_days(db_session: AsyncSession) -> None:
    org = await _seed_org(db_session)
    sales = await _user(db_session, org, UserRole.salesperson)
    stale = Company(
        organization_id=org.id, name="Stale", email="s@x.cz", owner_user_id=sales.id,
        last_order_at=datetime.now(tz=UTC) - timedelta(days=200),
    )
    fresh = Company(
        organization_id=org.id, name="Fresh", email="fr@x.cz", owner_user_id=sales.id,
        last_order_at=datetime.now(tz=UTC) - timedelta(days=5),
    )
    never = Company(organization_id=org.id, name="Never", email="n@x.cz", owner_user_id=sales.id)
    db_session.add_all([stale, fresh, never])
    await db_session.flush()
    cands = await resolve_recipients(
        db_session, sales, BulkEmailFilters(no_order_since_days=90)
    )
    ids = {c.company_id for c in cands}
    assert stale.id in ids and never.id in ids and fresh.id not in ids


async def test_send_requires_verified_smtp(db_session: AsyncSession) -> None:
    org = await _seed_org(db_session)
    sales = await _user(db_session, org, UserRole.salesperson)
    co = Company(organization_id=org.id, name="ACME", email="acme@x.cz", owner_user_id=sales.id)
    db_session.add(co)
    await db_session.flush()
    payload = BulkEmailSendIn(
        subject="Hi",
        body="Body",
        recipients=[BulkEmailRecipientIn(company_id=co.id, emails=["acme@x.cz"])],
    )
    with pytest.raises(BulkEmailError):
        await send_campaign(db_session, sales, payload, None)


async def _verified_smtp(db_session: AsyncSession, user: User, org: Organization) -> None:
    from app.core.token_crypto import encrypt_token
    from app.db.models import UserSmtpSettings

    db_session.add(
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
            from_name="Petr Prodejce",
            verified_at=datetime.now(tz=UTC),
        )
    )
    await db_session.flush()


async def test_send_campaign_records_status_and_creates_deal(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = await _seed_org(db_session)
    await create_default_pipeline(db_session, org.id)
    sales = await _user(db_session, org, UserRole.salesperson)
    await _verified_smtp(db_session, sales, org)
    co = Company(organization_id=org.id, name="ACME", email="acme@x.cz", owner_user_id=sales.id)
    db_session.add(co)
    await db_session.flush()

    # Mock the synchronous send loop so no real SMTP happens; mark all sent.
    def fake_loop(config, subject, body, sender_name, units, attachments):
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

    monkeypatch.setattr("app.services.bulk_email._run_send_loop", fake_loop)

    payload = BulkEmailSendIn(
        subject="Nová nabídka",
        body="Dobrý den {kontakt}",
        recipients=[BulkEmailRecipientIn(company_id=co.id, emails=["acme@x.cz"])],
        create_deals=True,
    )
    campaign = await send_campaign(db_session, sales, payload, None)
    assert campaign.sent_count == 1
    assert campaign.total == 1
    assert campaign.recipients[0].status == EmailRecipientStatus.sent

    deals = (await db_session.execute(Deal.__table__.select().where(Deal.company_id == co.id)))
    rows = deals.fetchall()
    assert len(rows) == 1
    assert rows[0].name == "Nová nabídka"


async def test_send_campaign_skips_unknown_email(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = await _seed_org(db_session)
    sales = await _user(db_session, org, UserRole.salesperson)
    await _verified_smtp(db_session, sales, org)
    co = Company(organization_id=org.id, name="ACME", email="acme@x.cz", owner_user_id=sales.id)
    db_session.add(co)
    await db_session.flush()

    def fake_loop(config, subject, body, sender_name, units, attachments):
        return [
            {
                "company_id": u.company_id, "contact_id": u.contact_id, "email": u.email,
                "company_name": u.company_name, "status": EmailRecipientStatus.sent,
                "error": None, "sent_at": datetime.now(tz=UTC),
            }
            for u in units
        ]

    monkeypatch.setattr("app.services.bulk_email._run_send_loop", fake_loop)

    # Requested email that doesn't belong to the company → skipped, not sent.
    payload = BulkEmailSendIn(
        subject="Hi",
        body="Body",
        recipients=[BulkEmailRecipientIn(company_id=co.id, emails=["stranger@evil.cz"])],
    )
    campaign = await send_campaign(db_session, sales, payload, None)
    assert campaign.sent_count == 0
    assert campaign.skipped_count == 1
    assert campaign.recipients[0].status == EmailRecipientStatus.skipped
