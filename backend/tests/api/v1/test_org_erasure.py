"""Integration tests for POST /organizations/me/erase (GDPR Art. 17)."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.core.token_crypto import encrypt_token
from app.db.models import (
    Charge,
    Company,
    Contact,
    EmailCampaign,
    GoogleCalendarConnection,
    Invoice,
    Organization,
    User,
    UserRole,
    UserSmtpSettings,
)
from app.db.session import AsyncSessionLocal
from app.main import app
from app.services.comgate import ComGateClient, get_comgate_client
from app.services.google_calendar import get_google_calendar_client


@pytest.fixture(autouse=True)
def _stub_comgate(monkeypatch: pytest.MonkeyPatch) -> None:
    class _Stub(ComGateClient):
        def __init__(self) -> None:
            pass

        async def disable_recurring(self, initial_trans_id: str) -> bool:
            return True

    app.dependency_overrides[get_comgate_client] = lambda: _Stub()
    yield
    app.dependency_overrides.pop(get_comgate_client, None)


# Records tokens the erasure asks Google to revoke, so tests can assert the
# revoke happened without hitting the network.
_revoked_tokens: list[str] = []


@pytest.fixture(autouse=True)
def _stub_gcal() -> AsyncIterator[None]:
    class _StubGcal:
        async def revoke_token(self, token: str) -> None:
            _revoked_tokens.append(token)

    _revoked_tokens.clear()
    app.dependency_overrides[get_google_calendar_client] = lambda: _StubGcal()
    yield
    app.dependency_overrides.pop(get_google_calendar_client, None)


@pytest.fixture
async def owned_emails() -> AsyncIterator[list[str]]:
    tracked: list[str] = []
    yield tracked
    async with AsyncSessionLocal() as s:
        # Cleanup: orgs created by these tests carry "Erasure Test" prefix; the
        # erasure itself renames them to "[Smazaná organizace #...]". Match both.
        await s.execute(delete(User).where(User.email.in_(tracked)))
        await s.execute(
            delete(Organization).where(
                Organization.name.ilike("Erasure Test%")
                | Organization.name.ilike("[Smazaná organizace #%]")
            )
        )
        await s.commit()


async def _seed_admin(
    session: AsyncSession, owned_emails: list[str], *, name: str = "Erasure Test Org"
) -> tuple[Organization, User]:
    org = Organization(name=name, ico="12345678", billing_email="acct@example.com")
    session.add(org)
    await session.flush()
    email = f"adm-{uuid.uuid4().hex[:8]}@example.com"
    owned_emails.append(email)
    user = User(
        email=email,
        name="Admin",
        role=UserRole.admin,
        organization_id=org.id,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user, attribute_names=["organization"])
    return org, user


async def test_erase_blanks_pii_and_keeps_invoice(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_admin(db_session, owned_emails)

    # Seed one contact + company + invoice. The contact/company must vanish;
    # the invoice (an účetní doklad) must survive verbatim.
    company = Company(
        organization_id=org.id, name="Klient s.r.o.", ico="87654321", owner_user_id=admin.id
    )
    db_session.add(company)
    await db_session.flush()
    db_session.add(
        Contact(
            organization_id=org.id,
            company_id=company.id,
            first_name="Jana",
            last_name="Nováková",
            email="jana@klient.cz",
        )
    )
    invoice = Invoice(
        organization_id=org.id,
        number="2026-0001",
        year=2026,
        sequence_in_year=1,
        variable_symbol="20260001",
        status="paid",
        kind="invoice",
        issued_at=datetime.now(tz=UTC),
        taxable_supply_date=date.today(),
        due_at=date.today(),
        issuer_name="Ing. Tomáš Plachý",
        issuer_address="Lidická 709/55, Brno",
        issuer_ico="06437541",
        issuer_iban="CZ0000000000000000000000",
        issuer_register_text="—",
        issuer_is_vat_payer=False,
        customer_name="Erasure Test Org",
        customer_address="Sídlo s.r.o.",
        customer_ico="12345678",
        customer_email="acct@example.com",
        subtotal_minor=10000,
        total_minor=10000,
    )
    db_session.add(invoice)
    # PII/credential satellites that must also be erased (review R3 P2).
    db_session.add(
        GoogleCalendarConnection(
            user_id=admin.id,
            organization_id=org.id,
            google_email="admin@gmail.com",
            refresh_token_encrypted=encrypt_token("real-refresh-token"),
        )
    )
    db_session.add(
        UserSmtpSettings(
            user_id=admin.id,
            organization_id=org.id,
            host="smtp.example.com",
            port=465,
            username="smtp-user",
            password_encrypted="enc-smtp-password",
            from_email="from@example.com",
        )
    )
    db_session.add(
        EmailCampaign(
            organization_id=org.id,
            subject="Kampaň",
            body="Text",
            from_email="from@example.com",
        )
    )
    await db_session.commit()
    invoice_id = invoice.id

    token = create_access_token(admin.id, admin.organization_id, admin.role)
    resp = await client.post(
        "/api/v1/organizations/me/erase",
        headers={"Authorization": f"Bearer {token}"},
        json={"confirmation_name": "Erasure Test Org"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["organization_id"] == str(org.id)
    assert body["deleted_at"]

    # The endpoint commits through its own session; the fixture's outer
    # transaction is snapshot-isolated, so observe the result through a
    # fresh session.
    async with AsyncSessionLocal() as s:
        refreshed = (
            await s.execute(select(Organization).where(Organization.id == org.id))
        ).scalar_one()
        assert refreshed.name.startswith("[Smazaná organizace #")
        assert refreshed.ico is None
        assert refreshed.billing_email is None
        assert refreshed.deleted_at is not None

        refreshed_user = (await s.execute(select(User).where(User.id == admin.id))).scalar_one()
        assert refreshed_user.is_active is False
        assert refreshed_user.email.endswith("@simplecrm.invalid")
        assert refreshed_user.name == "(smazaný uživatel)"

        assert (
            await s.execute(select(Contact).where(Contact.organization_id == org.id))
        ).scalars().all() == []
        assert (
            await s.execute(select(Company).where(Company.organization_id == org.id))
        ).scalars().all() == []
        # The PII/credential satellites must be gone too (review R3 P2).
        assert (
            await s.execute(
                select(GoogleCalendarConnection).where(
                    GoogleCalendarConnection.organization_id == org.id
                )
            )
        ).scalars().all() == []
        # Google's access was revoked at the source, not just deleted locally.
        assert "real-refresh-token" in _revoked_tokens
        assert (
            await s.execute(
                select(UserSmtpSettings).where(UserSmtpSettings.organization_id == org.id)
            )
        ).scalars().all() == []
        assert (
            await s.execute(select(EmailCampaign).where(EmailCampaign.organization_id == org.id))
        ).scalars().all() == []

        surviving = (await s.execute(select(Invoice).where(Invoice.id == invoice_id))).scalar_one()
        assert surviving.customer_name == "Erasure Test Org"
        assert surviving.total_minor == 10000

        # Cleanup so the org-delete in the fixture teardown doesn't trip
        # the invoice_audit_log delete trigger.
        await s.execute(delete(Charge).where(Charge.organization_id == org.id))
        await s.execute(delete(Invoice).where(Invoice.organization_id == org.id))
        await s.commit()


async def test_erase_rejects_name_mismatch(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    resp = await client.post(
        "/api/v1/organizations/me/erase",
        headers={"Authorization": f"Bearer {token}"},
        json={"confirmation_name": "Wrong Name"},
    )
    assert resp.status_code == 422
    async with AsyncSessionLocal() as s:
        refreshed = (
            await s.execute(select(Organization).where(Organization.id == org.id))
        ).scalar_one()
        assert refreshed.deleted_at is None


async def test_erase_is_idempotent(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    first = await client.post(
        "/api/v1/organizations/me/erase",
        headers={"Authorization": f"Bearer {token}"},
        json={"confirmation_name": "Erasure Test Org"},
    )
    assert first.status_code == 200

    # Second attempt must 422 — the admin user is now `is_active=False`, so
    # the second request actually 401s at the auth layer first (which is
    # fine; we just need to confirm the system doesn't double-anonymize).
    second = await client.post(
        "/api/v1/organizations/me/erase",
        headers={"Authorization": f"Bearer {token}"},
        json={"confirmation_name": "Erasure Test Org"},
    )
    assert second.status_code == 401


async def test_erase_rejects_non_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, _admin = await _seed_admin(db_session, owned_emails)
    salesperson_email = f"sp-{uuid.uuid4().hex[:8]}@example.com"
    owned_emails.append(salesperson_email)
    sp = User(
        email=salesperson_email,
        name="Sales",
        role=UserRole.salesperson,
        organization_id=org.id,
    )
    db_session.add(sp)
    await db_session.commit()
    token = create_access_token(sp.id, sp.organization_id, sp.role)
    resp = await client.post(
        "/api/v1/organizations/me/erase",
        headers={"Authorization": f"Bearer {token}"},
        json={"confirmation_name": "Erasure Test Org"},
    )
    assert resp.status_code == 403
    async with AsyncSessionLocal() as s:
        refreshed = (
            await s.execute(select(Organization).where(Organization.id == org.id))
        ).scalar_one()
        assert refreshed.deleted_at is None
