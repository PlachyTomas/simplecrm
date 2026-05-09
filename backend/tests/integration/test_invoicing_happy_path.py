"""End-to-end happy path: ComGate webhook → auto-issued tax invoice.

Walks the full pipeline that ships every paid charge into a Czech-law-
compliant invoice, then asserts the customer surfaces (list + PDF) +
audit log show the right state.

This file is the **canonical reference** for the invoicing flow —
read it first when debugging or onboarding to understand how the
pieces fit together. The unit-level tests in
`tests/services/test_invoicing_*.py` cover individual modules; this
file proves they integrate.

Idempotency assertion: re-firing the same webhook MUST NOT produce a
second invoice. The invoice-uniqueness contract is enforced inside
`InvoiceService.issue_for_charge` (idempotency check on `charge_id`),
which we exercise here against the live route.

Trigger immutability assertion: tampering with an issued invoice's
total via raw SQL MUST raise the trigger error. This guards against
service-layer bugs that bypass the `mark_paid`/`void`/`issue_credit_note`
state-transition contracts.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import IntegrityError as SAIntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import (
    BillingSettings,
    Charge,
    Invoice,
    InvoiceAuditLog,
    Organization,
    Plan,
    Subscription,
    User,
    UserRole,
)
from app.db.session import AsyncSessionLocal
from tests.conftest import wipe_invoicing_for_org


@pytest.fixture(autouse=True)
def _comgate_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    """Same env wiring as test_payments — without it the webhook
    signature path 503s."""
    monkeypatch.setenv("COMGATE_MERCHANT_ID", "1234567")
    monkeypatch.setenv("COMGATE_SECRET", "test-secret")
    from app.core.config import get_settings

    get_settings.cache_clear()
    from app.services import comgate

    comgate.reset_default_client()
    yield
    get_settings.cache_clear()
    comgate.reset_default_client()


def _sign(body: bytes) -> str:
    return hmac.new(b"test-secret", body, hashlib.sha256).hexdigest()


async def _configure_issuer(session: AsyncSession) -> None:
    await session.execute(
        update(BillingSettings).values(
            seller_iban="CZ6508000000192000145399",
            seller_ico="12345678",
            issuer_name="Tomáš Test OSVČ",
            issuer_address_street="Testovací 1",
            issuer_address_city="Praha",
            issuer_address_zip="100 00",
            issuer_register_text="Zapsán v živnostenském rejstříku",
        )
    )
    await session.commit()


async def _seed_trial_org_with_pending_charge(
    session: AsyncSession,
) -> tuple[Organization, User, Charge, str]:
    """Pre-webhook state: trial org, pending initial charge, no
    invoice yet. Mirrors the moment after `/payments/initial-payment-init`
    has redirected the user to ComGate."""
    org = Organization(name=f"E2E-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.flush()

    admin = User(
        email=f"e2e-{uuid.uuid4().hex[:8]}@ex.cz",
        name="E2E Admin",
        role=UserRole.admin,
        organization_id=org.id,
    )
    session.add(admin)

    monthly = (await session.execute(select(Plan.id).where(Plan.code == "monthly"))).scalar_one()
    session.add(
        Subscription(
            organization_id=org.id,
            plan_id=monthly,
            status="trialing",
            started_at=datetime.now(tz=UTC),
            seat_count=3,
            contracted_seat_count=1,
        )
    )
    trans_id = f"E2E-TX-{uuid.uuid4().hex[:12]}"
    charge = Charge(
        organization_id=org.id,
        kind="initial",
        amount_minor=29700,  # 3 × 99 Kč
        currency="CZK",
        status="pending",
        seats=3,
        comgate_trans_id=trans_id,
    )
    session.add(charge)
    await session.commit()
    return org, admin, charge, trans_id


async def _post_webhook(client: AsyncClient, *, charge_id: uuid.UUID, trans_id: str) -> None:
    body = json.dumps({"transId": trans_id, "status": "PAID", "refId": str(charge_id)}).encode()
    response = await client.post(
        "/api/v1/payments/webhook",
        content=body,
        headers={
            "content-type": "application/json",
            "x-comgate-signature": _sign(body),
        },
    )
    assert response.status_code == 204, response.text


def _bearer(user: User) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {create_access_token(user.id, user.organization_id, user.role)}"
    }


@pytest.fixture
async def cleanup_orgs() -> list[uuid.UUID]:
    ids: list[uuid.UUID] = []
    try:
        yield ids
    finally:
        if ids:
            await wipe_invoicing_for_org(ids)
        # Also wipe the WebhookEvent rows the test inserted — there's no
        # FK linking them to Organization, so wipe_invoicing_for_org
        # leaves them behind.
        async with AsyncSessionLocal() as s:
            await s.execute(
                text("DELETE FROM webhook_events WHERE comgate_event_id LIKE 'E2E-TX-%'")
            )
            await s.commit()


# --------------------------------------------------------------------------- #


async def test_paid_webhook_creates_invoice_visible_to_customer(
    client: AsyncClient, cleanup_orgs: list[uuid.UUID]
) -> None:
    """Full pipeline: pending charge → PAID webhook → auto-issued
    invoice → /organizations/current/invoices lists it →
    /{id}/pdf streams a valid PDF → audit log shows the issuance trail.
    """
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, admin, charge, trans_id = await _seed_trial_org_with_pending_charge(s)
        cleanup_orgs.append(org.id)
        charge_id = charge.id

    await _post_webhook(client, charge_id=charge_id, trans_id=trans_id)

    # Backend should have issued exactly one Invoice for this charge.
    async with AsyncSessionLocal() as s:
        invoices = (
            (await s.execute(select(Invoice).where(Invoice.charge_id == charge_id))).scalars().all()
        )
        assert len(invoices) == 1, [i.number for i in invoices]
        invoice = invoices[0]
        assert invoice.status == "issued"
        assert invoice.pdf_object_key is not None
        assert invoice.pdf_sha256 is not None
        invoice_id = invoice.id

    # Customer list endpoint shows the invoice.
    list_resp = await client.get("/api/v1/organizations/current/invoices", headers=_bearer(admin))
    assert list_resp.status_code == 200, list_resp.text
    body = list_resp.json()
    assert any(item["id"] == str(invoice_id) for item in body["items"])

    # PDF endpoint streams valid bytes.
    pdf_resp = await client.get(
        f"/api/v1/organizations/current/invoices/{invoice_id}/pdf", headers=_bearer(admin)
    )
    assert pdf_resp.status_code == 200, pdf_resp.text
    assert pdf_resp.headers["content-type"] == "application/pdf"
    assert pdf_resp.content.startswith(b"%PDF-")

    # Audit log shows the full issuance trail.
    async with AsyncSessionLocal() as s:
        events = (
            (
                await s.execute(
                    select(InvoiceAuditLog.event).where(InvoiceAuditLog.invoice_id == invoice_id)
                )
            )
            .scalars()
            .all()
        )
        for required in ("allocated", "issued", "pdf_stored"):
            assert required in events, (required, events)


async def test_replayed_webhook_does_not_create_duplicate_invoice(
    client: AsyncClient, cleanup_orgs: list[uuid.UUID]
) -> None:
    """Re-delivering the same webhook (transient ComGate retry) MUST
    leave the invoice count at exactly one. Defence in depth — the
    webhook_event table dedupes at the transport layer too, but the
    invoice-issuance contract is the load-bearing one for the
    accountant's nightmares."""
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, _admin, charge, trans_id = await _seed_trial_org_with_pending_charge(s)
        cleanup_orgs.append(org.id)
        charge_id = charge.id

    await _post_webhook(client, charge_id=charge_id, trans_id=trans_id)
    await _post_webhook(client, charge_id=charge_id, trans_id=trans_id)

    async with AsyncSessionLocal() as s:
        n_invoices = (
            await s.execute(
                select(func.count()).select_from(Invoice).where(Invoice.charge_id == charge_id)
            )
        ).scalar_one()
        assert n_invoices == 1


async def test_immutability_trigger_blocks_post_issue_total_change(
    client: AsyncClient, cleanup_orgs: list[uuid.UUID]
) -> None:
    """Tampering with an issued invoice's `total_minor` via raw SQL
    must raise the database trigger. Status transitions remain allowed
    (paid_at, sent_at, status itself) — only the financial + identity
    fields are locked."""
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, _admin, charge, trans_id = await _seed_trial_org_with_pending_charge(s)
        cleanup_orgs.append(org.id)
        charge_id = charge.id

    await _post_webhook(client, charge_id=charge_id, trans_id=trans_id)

    async with AsyncSessionLocal() as s:
        invoice = (
            await s.execute(select(Invoice).where(Invoice.charge_id == charge_id))
        ).scalar_one()
        invoice_id = invoice.id

    async with AsyncSessionLocal() as s:
        with pytest.raises(SAIntegrityError):
            await s.execute(
                text("UPDATE invoices SET total_minor = 1 WHERE id = :id"),
                {"id": str(invoice_id)},
            )
            await s.commit()
        await s.rollback()
