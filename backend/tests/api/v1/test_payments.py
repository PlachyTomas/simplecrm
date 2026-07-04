"""Integration tests for /api/v1/payments/*.

Coverage:
  - Webhook verification via authoritative status re-query
    (unknown transId ignored; transient upstream → 503 retry)
  - Webhook idempotency (re-delivery is a no-op)
  - Webhook routes paid initial → status=active + payment_method saved
  - Webhook routes paid seat_upgrade → seat_count + contracted lifted
  - Webhook routes failure → charge marked failed
  - Return URL handling (200 + Location header reflects charge status)
  - GET /charges requires admin
  - POST /seat-change-init returns 422 without saved card
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import (
    BillingSettings,
    Charge,
    Invoice,
    InvoiceAuditLog,
    InvoiceLine,
    Organization,
    PaymentMethod,
    Plan,
    Subscription,
    User,
    UserRole,
    WebhookEvent,
)
from app.db.session import AsyncSessionLocal
from app.main import app
from app.services.comgate import PaymentStatus, get_comgate_client

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _wipe_invoices_for_org(session: AsyncSession, org_id) -> None:
    """Delete invoices + lines + audit-log rows for an org so the
    cascading Organization DELETE in test cleanup doesn't trip the FK
    constraint to invoice_audit_log. The audit-log trigger rejects
    DELETE unconditionally, so we disable it for the cleanup window.
    """
    from sqlalchemy import text

    invoice_ids = (
        (await session.execute(select(Invoice.id).where(Invoice.organization_id == org_id)))
        .scalars()
        .all()
    )
    if not invoice_ids:
        return
    await session.execute(
        text("ALTER TABLE invoice_audit_log DISABLE TRIGGER trg_invoice_audit_log_no_delete")
    )
    await session.execute(
        delete(InvoiceAuditLog).where(InvoiceAuditLog.invoice_id.in_(invoice_ids))
    )
    await session.execute(
        text("ALTER TABLE invoice_audit_log ENABLE TRIGGER trg_invoice_audit_log_no_delete")
    )
    await session.execute(delete(InvoiceLine).where(InvoiceLine.invoice_id.in_(invoice_ids)))
    await session.execute(delete(Invoice).where(Invoice.id.in_(invoice_ids)))


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _set_comgate_secret(monkeypatch) -> None:
    """Populate ComGate creds so credentialed paths run.

    Without these, the customer-facing endpoints (and the real status
    re-query) would 503 on `_require_credentials`. Cleared automatically
    per-test via monkeypatch.
    """
    monkeypatch.setenv("COMGATE_MERCHANT_ID", "1234567")
    monkeypatch.setenv("COMGATE_SECRET", "test-secret")
    from app.core.config import get_settings

    get_settings.cache_clear()
    from app.services import comgate

    comgate.reset_default_client()
    yield
    get_settings.cache_clear()
    comgate.reset_default_client()


@pytest.fixture
async def owned_payments_emails() -> AsyncIterator[list[str]]:
    tracked: list[str] = []
    yield tracked
    async with AsyncSessionLocal() as session:
        if tracked:
            # Some webhook tests auto-issue invoices; wipe those first so
            # the cascading Organization delete doesn't trip the
            # invoice_audit_log FK.
            stale_org_ids = (
                (
                    await session.execute(
                        select(Organization.id).where(
                            Organization.name.in_(("Payments Test Org", "Auto-Issue Test"))
                        )
                    )
                )
                .scalars()
                .all()
            )
            for org_id in stale_org_ids:
                await _wipe_invoices_for_org(session, org_id)
            await session.execute(delete(User).where(User.email.in_(tracked)))
            await session.execute(
                delete(Organization).where(
                    Organization.name.in_(("Payments Test Org", "Auto-Issue Test"))
                )
            )
            await session.commit()


async def _seed_active_org_with_card(
    session: AsyncSession, owned_emails: list[str]
) -> tuple[Organization, User, Subscription]:
    """Seed an org in active state with a saved payment method —
    matches the post-initial-activation state."""
    org = Organization(name="Payments Test Org")
    session.add(org)
    await session.flush()

    email = f"pay-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_emails.append(email)
    admin = User(email=email, name="PayAdmin", role=UserRole.admin, organization_id=org.id)
    session.add(admin)

    monthly_plan_id = (
        await session.execute(select(Plan.id).where(Plan.code == "monthly"))
    ).scalar_one()
    now = datetime.now(tz=UTC)
    sub = Subscription(
        organization_id=org.id,
        plan_id=monthly_plan_id,
        status="active",
        started_at=now,
        current_period_starts_at=now - timedelta(days=15),
        current_period_ends_at=now + timedelta(days=15),
        seat_count=5,
        contracted_seat_count=5,
        next_renewal_charge_at=now + timedelta(days=15),
    )
    session.add(sub)
    session.add(
        PaymentMethod(
            organization_id=org.id,
            comgate_initial_trans_id="ORIGINAL-TRANS-ID",
            card_brand="visa",
            card_last4="4242",
        )
    )
    await session.commit()
    await session.refresh(admin, attribute_names=["organization"])
    await session.refresh(sub)
    return org, admin, sub


class _StubComgate:
    """Stand-in for ComGateClient in webhook tests. The handler verifies
    a callback by re-querying `get_payment_status`; we feed it canned
    answers keyed by transId so no network call happens.

    A registered value may be a `PaymentStatus` (returned) or an
    `Exception` (raised, to exercise the transient-retry path).
    Unregistered transIds come back `found=False`.
    """

    def __init__(self, statuses: dict) -> None:
        self._statuses = statuses

    async def get_payment_status(self, trans_id: str) -> PaymentStatus:
        result = self._statuses.get(trans_id)
        if result is None:
            return PaymentStatus(trans_id=trans_id, found=False)
        if isinstance(result, Exception):
            raise result
        return result


@pytest.fixture
def comgate_status() -> AsyncIterator[dict]:
    """Override `get_comgate_client` with a stub. Tests register the
    authoritative status the re-query should return:

        comgate_status[trans_id] = PaymentStatus(
            trans_id=trans_id, found=True, status="PAID", ref_id=str(charge_id)
        )
    """
    statuses: dict = {}
    stub = _StubComgate(statuses)
    app.dependency_overrides[get_comgate_client] = lambda: stub
    yield statuses
    app.dependency_overrides.pop(get_comgate_client, None)


def _paid(trans_id: str, charge_id) -> PaymentStatus:
    return PaymentStatus(trans_id=trans_id, found=True, status="PAID", ref_id=str(charge_id))


# ---------------------------------------------------------------------------
# Webhook verification (status re-query)
# ---------------------------------------------------------------------------


async def test_webhook_ignores_unknown_transid(client: AsyncClient, comgate_status: dict) -> None:
    """A transId the status API doesn't recognise (spoofed/garbage) is
    ACKed (204) and changes nothing — no retry storm."""
    response = await client.post(
        "/api/v1/payments/webhook",
        json={"transId": "TOTALLY-BOGUS"},
    )
    assert response.status_code == 204


async def test_webhook_returns_503_on_transient_status_error(
    client: AsyncClient, comgate_status: dict
) -> None:
    """If the re-query itself fails (network/upstream), respond 5xx so
    ComGate re-delivers rather than dropping the payment."""
    from app.services.comgate import ComGateError

    trans_id = "TRANSIENT-TX"
    comgate_status[trans_id] = ComGateError("upstream down")
    response = await client.post(
        "/api/v1/payments/webhook",
        json={"transId": trans_id},
    )
    assert response.status_code == 503


async def test_webhook_missing_transid_is_400(client: AsyncClient, comgate_status: dict) -> None:
    response = await client.post("/api/v1/payments/webhook", json={})
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Webhook routing — initial payment success
# ---------------------------------------------------------------------------


async def test_initial_payment_init_rejects_when_already_active(
    client: AsyncClient,
    owned_payments_emails: list[str],
) -> None:
    """Regression (review R2 P1): an org whose subscription is already active
    must not be able to start another initial payment — that would double-charge
    the card and issue a duplicate tax invoice."""
    async with AsyncSessionLocal() as session:
        _org, admin, _sub = await _seed_active_org_with_card(session, owned_payments_emails)
        token = create_access_token(admin.id, admin.organization_id, UserRole.admin)

    resp = await client.post(
        "/api/v1/payments/initial-payment-init",
        json={"plan_code": "monthly"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"]["code"] == "already_active"


async def test_initial_payment_init_rejects_recent_pending_charge(
    client: AsyncClient,
    owned_payments_emails: list[str],
) -> None:
    """Regression (review R2 P1 residual): a second checkout while a recent
    initial charge is still pending is rejected, so two tabs can't both pay and
    double-capture the card."""
    async with AsyncSessionLocal() as session:
        org = Organization(
            name="Payments Test Org",
            ico="12345678",
            address_street="Testovací 1",
            address_city="Praha",
            address_zip="100 00",
        )
        session.add(org)
        await session.flush()
        email = f"pend-{uuid.uuid4().hex[:8]}@ex.cz"
        owned_payments_emails.append(email)
        admin = User(email=email, name="A", role=UserRole.admin, organization_id=org.id)
        session.add(admin)
        monthly_plan_id = (
            await session.execute(select(Plan.id).where(Plan.code == "monthly"))
        ).scalar_one()
        now = datetime.now(tz=UTC)
        session.add(
            Subscription(
                organization_id=org.id,
                plan_id=monthly_plan_id,
                status="trialing",
                started_at=now,
                current_period_starts_at=now,
                current_period_ends_at=now + timedelta(days=10),
                seat_count=5,
                contracted_seat_count=5,
            )
        )
        session.add(
            Charge(
                organization_id=org.id,
                kind="initial",
                amount_minor=49_500,
                currency="CZK",
                status="pending",
                seats=5,
            )
        )
        await session.commit()
        token = create_access_token(admin.id, org.id, UserRole.admin)

    resp = await client.post(
        "/api/v1/payments/initial-payment-init",
        json={"plan_code": "monthly"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"]["code"] == "payment_in_progress"


async def test_webhook_initial_paid_promotes_to_active(
    client: AsyncClient,
    owned_payments_emails: list[str],
    comgate_status: dict,
) -> None:
    """A PAID webhook for an initial-kind charge flips the subscription
    to active, sets contracted_seat_count = seat_count, and writes a
    PaymentMethod row keyed on the new transId."""
    trans_id = f"WEBHOOK-TX-{uuid.uuid4().hex[:12]}"
    async with AsyncSessionLocal() as setup:
        # Seed: trial org with seat_count=10, no payment method yet.
        org = Organization(name="Payments Test Org")
        setup.add(org)
        await setup.flush()
        email = f"init-{uuid.uuid4().hex[:8]}@ex.cz"
        owned_payments_emails.append(email)
        setup.add(User(email=email, name="A", role=UserRole.admin, organization_id=org.id))
        monthly_plan_id = (
            await setup.execute(select(Plan.id).where(Plan.code == "monthly"))
        ).scalar_one()
        setup.add(
            Subscription(
                organization_id=org.id,
                plan_id=monthly_plan_id,
                status="trialing",
                started_at=datetime.now(tz=UTC),
                seat_count=10,
                contracted_seat_count=1,
            )
        )
        charge = Charge(
            organization_id=org.id,
            kind="initial",
            amount_minor=99000,
            currency="CZK",
            status="pending",
            seats=10,
            comgate_trans_id=trans_id,
        )
        setup.add(charge)
        await setup.commit()
        charge_id = charge.id
        org_id = org.id

    comgate_status[trans_id] = _paid(trans_id, charge_id)
    response = await client.post(
        "/api/v1/payments/webhook",
        json={"transId": trans_id},
    )
    assert response.status_code == 204, response.text

    # Re-read state via a fresh session so we don't fight the
    # outer-rollback test fixture.
    async with AsyncSessionLocal() as fresh:
        sub = (
            await fresh.execute(select(Subscription).where(Subscription.organization_id == org_id))
        ).scalar_one()
        assert sub.status == "active"
        assert sub.contracted_seat_count == 10  # locked in from trial seat_count
        assert sub.current_period_ends_at is not None

        pm = (
            await fresh.execute(
                select(PaymentMethod).where(PaymentMethod.organization_id == org_id)
            )
        ).scalar_one()
        assert pm.comgate_initial_trans_id == trans_id

        inv = await fresh.get(Charge, charge_id)
        assert inv is not None
        assert inv.status == "paid"
        assert inv.paid_at is not None

        # Cleanup: invoice rows (auto-issued by the webhook) need to
        # come down before the org cascades; audit-log trigger blocks
        # DELETE so we go through the helper that disables it. webhook_
        # event has no org FK so wipe it manually.
        await _wipe_invoices_for_org(fresh, org_id)
        await fresh.execute(delete(Organization).where(Organization.id == org_id))
        await fresh.execute(delete(WebhookEvent).where(WebhookEvent.comgate_event_id == trans_id))
        await fresh.commit()


# ---------------------------------------------------------------------------
# Webhook auto-issues a tax invoice
# ---------------------------------------------------------------------------


async def test_webhook_paid_charge_auto_issues_tax_invoice(
    client: AsyncClient,
    owned_payments_emails: list[str],
    comgate_status: dict,
    tmp_path,
) -> None:
    """When a PAID webhook lands on a non-comp org with BillingSettings
    issuer fields configured, the orchestrator auto-issues a tax invoice
    inside the same transaction. Re-delivery returns the same invoice
    (no duplicate issuance, courtesy of the webhook-event dedup + the
    orchestrator's own idempotency check)."""
    from sqlalchemy import update

    # Configure issuer fields on the singleton — required for issuance
    # to pass validation. Other tests in this file don't care about
    # these values, so we just set them and don't bother resetting.
    async with AsyncSessionLocal() as setup:
        await setup.execute(
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
        await setup.commit()

    trans_id = f"WEBHOOK-INV-{uuid.uuid4().hex[:12]}"
    async with AsyncSessionLocal() as setup:
        org = Organization(name="Auto-Issue Test")
        setup.add(org)
        await setup.flush()
        email = f"auto-{uuid.uuid4().hex[:8]}@ex.cz"
        owned_payments_emails.append(email)
        setup.add(User(email=email, name="A", role=UserRole.admin, organization_id=org.id))
        monthly_plan_id = (
            await setup.execute(select(Plan.id).where(Plan.code == "monthly"))
        ).scalar_one()
        setup.add(
            Subscription(
                organization_id=org.id,
                plan_id=monthly_plan_id,
                status="trialing",
                started_at=datetime.now(tz=UTC),
                seat_count=1,
                contracted_seat_count=1,
            )
        )
        charge = Charge(
            organization_id=org.id,
            kind="initial",
            amount_minor=99000,
            currency="CZK",
            status="pending",
            seats=1,
            comgate_trans_id=trans_id,
        )
        setup.add(charge)
        await setup.commit()
        charge_id = charge.id
        org_id = org.id

    comgate_status[trans_id] = _paid(trans_id, charge_id)
    response = await client.post(
        "/api/v1/payments/webhook",
        json={"transId": trans_id},
    )
    assert response.status_code == 204, response.text

    async with AsyncSessionLocal() as fresh:
        invoices = (
            (await fresh.execute(select(Invoice).where(Invoice.charge_id == charge_id)))
            .scalars()
            .all()
        )
        assert len(invoices) == 1, "exactly one invoice issued for the paid charge"
        invoice = invoices[0]
        assert invoice.status == "issued"
        assert invoice.organization_id == org_id
        assert invoice.total_minor == 99000
        assert invoice.pdf_object_key is not None
        assert invoice.pdf_sha256 is not None

        # Cleanup: drop invoice rows + audit log entries before the
        # cascading org delete (audit log triggers reject DELETE; disable
        # the trigger for the cleanup window).
        from sqlalchemy import text

        await fresh.execute(
            text("ALTER TABLE invoice_audit_log DISABLE TRIGGER trg_invoice_audit_log_no_delete")
        )
        await fresh.execute(delete(InvoiceAuditLog).where(InvoiceAuditLog.invoice_id == invoice.id))
        await fresh.execute(
            text("ALTER TABLE invoice_audit_log ENABLE TRIGGER trg_invoice_audit_log_no_delete")
        )
        await fresh.execute(delete(InvoiceLine).where(InvoiceLine.invoice_id == invoice.id))
        await fresh.execute(delete(Invoice).where(Invoice.id == invoice.id))
        await fresh.execute(delete(Organization).where(Organization.id == org_id))
        await fresh.execute(delete(WebhookEvent).where(WebhookEvent.comgate_event_id == trans_id))
        await fresh.commit()


async def test_webhook_paid_charge_auto_emails_invoice(
    client: AsyncClient,
    owned_payments_emails: list[str],
    comgate_status: dict,
) -> None:
    """After auto-issuance the orchestrator emails the customer their
    daňový doklad. Czech B2B law requires the buyer to receive an
    invoice regardless of payment instrument, so the founder shouldn't
    have to manually press "Odeslat" in /admin/faktury after every
    successful card charge.

    With no `billing_email` on the org, the auto-send falls back to the
    earliest-created admin's email. `_block_real_smtp` autouse fixture
    bypasses smtplib — we assert `invoice.sent_at` + `sent_to_email`
    instead of inspecting a real outbox.
    """
    from sqlalchemy import update

    async with AsyncSessionLocal() as setup:
        await setup.execute(
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
        await setup.commit()

    trans_id = f"WEBHOOK-AUTOMAIL-{uuid.uuid4().hex[:12]}"
    async with AsyncSessionLocal() as setup:
        org = Organization(name="Auto-Mail Test")  # billing_email left None
        setup.add(org)
        await setup.flush()
        admin_email = f"admin-{uuid.uuid4().hex[:8]}@ex.cz"
        owned_payments_emails.append(admin_email)
        setup.add(
            User(email=admin_email, name="Admin", role=UserRole.admin, organization_id=org.id)
        )
        monthly_plan_id = (
            await setup.execute(select(Plan.id).where(Plan.code == "monthly"))
        ).scalar_one()
        setup.add(
            Subscription(
                organization_id=org.id,
                plan_id=monthly_plan_id,
                status="trialing",
                started_at=datetime.now(tz=UTC),
                seat_count=1,
                contracted_seat_count=1,
            )
        )
        charge = Charge(
            organization_id=org.id,
            kind="initial",
            amount_minor=99000,
            currency="CZK",
            status="pending",
            seats=1,
            comgate_trans_id=trans_id,
        )
        setup.add(charge)
        await setup.commit()
        charge_id = charge.id
        org_id = org.id

    comgate_status[trans_id] = _paid(trans_id, charge_id)
    response = await client.post(
        "/api/v1/payments/webhook",
        json={"transId": trans_id},
    )
    assert response.status_code == 204, response.text

    async with AsyncSessionLocal() as fresh:
        invoice = (
            await fresh.execute(select(Invoice).where(Invoice.charge_id == charge_id))
        ).scalar_one()
        assert invoice.sent_at is not None, "auto-send should populate sent_at"
        assert invoice.sent_to_email == admin_email, (
            "with no billing_email on the org, should fall back to admin"
        )

        # Cleanup
        from sqlalchemy import text

        await fresh.execute(
            text("ALTER TABLE invoice_audit_log DISABLE TRIGGER trg_invoice_audit_log_no_delete")
        )
        await fresh.execute(delete(InvoiceAuditLog).where(InvoiceAuditLog.invoice_id == invoice.id))
        await fresh.execute(
            text("ALTER TABLE invoice_audit_log ENABLE TRIGGER trg_invoice_audit_log_no_delete")
        )
        await fresh.execute(delete(InvoiceLine).where(InvoiceLine.invoice_id == invoice.id))
        await fresh.execute(delete(Invoice).where(Invoice.id == invoice.id))
        await fresh.execute(delete(Organization).where(Organization.id == org_id))
        await fresh.execute(delete(WebhookEvent).where(WebhookEvent.comgate_event_id == trans_id))
        await fresh.commit()


# ---------------------------------------------------------------------------
# Webhook idempotency
# ---------------------------------------------------------------------------


async def test_webhook_double_delivery_is_idempotent(
    client: AsyncClient,
    owned_payments_emails: list[str],
    comgate_status: dict,
) -> None:
    """Re-firing the same webhook (same transId) is a silent no-op.
    The charge + subscription state from the first delivery aren't
    re-applied or doubled-up.

    Uses AsyncSessionLocal directly (not the db_session fixture) so
    the webhook's own session doesn't fight an outer-transaction
    fixture for the same DB rows.
    """
    trans_id = f"UPGRADE-TX-{uuid.uuid4().hex[:12]}"
    async with AsyncSessionLocal() as setup:
        org, _admin, _sub = await _seed_active_org_with_card(setup, owned_payments_emails)
        charge = Charge(
            organization_id=org.id,
            kind="seat_upgrade",
            amount_minor=49500,
            currency="CZK",
            status="pending",
            seats=50,
            comgate_trans_id=trans_id,
        )
        setup.add(charge)
        await setup.commit()
        charge_id = charge.id
        org_id = org.id

    comgate_status[trans_id] = _paid(trans_id, charge_id)
    payload = {"transId": trans_id}

    r1 = await client.post("/api/v1/payments/webhook", json=payload)
    r2 = await client.post("/api/v1/payments/webhook", json=payload)
    assert r1.status_code == 204
    assert r2.status_code == 204  # idempotent

    async with AsyncSessionLocal() as fresh:
        # Exactly ONE webhook_event row for this trans_id.
        events = (
            (
                await fresh.execute(
                    select(WebhookEvent).where(WebhookEvent.comgate_event_id == trans_id)
                )
            )
            .scalars()
            .all()
        )
        assert len(events) == 1

        sub = (
            await fresh.execute(select(Subscription).where(Subscription.organization_id == org_id))
        ).scalar_one()
        # Seat upgrade applied exactly once: 5 → 50, not 5 → 50 → 50+50.
        assert sub.seat_count == 50
        assert sub.contracted_seat_count == 50

        # Cleanup: wipe auto-issued invoices first (audit-log trigger
        # blocks DELETE without the helper), then cascade the org.
        await _wipe_invoices_for_org(fresh, org_id)
        await fresh.execute(delete(Organization).where(Organization.id == org_id))
        await fresh.execute(delete(WebhookEvent).where(WebhookEvent.comgate_event_id == trans_id))
        await fresh.commit()


# ---------------------------------------------------------------------------
# Webhook failure path
# ---------------------------------------------------------------------------


async def test_webhook_failed_marks_charge_failed(
    client: AsyncClient,
    owned_payments_emails: list[str],
    comgate_status: dict,
) -> None:
    trans_id = f"FAIL-TX-{uuid.uuid4().hex[:12]}"
    async with AsyncSessionLocal() as setup:
        org, _admin, _sub = await _seed_active_org_with_card(setup, owned_payments_emails)
        charge = Charge(
            organization_id=org.id,
            kind="seat_upgrade",
            amount_minor=49500,
            currency="CZK",
            status="pending",
            seats=50,
            comgate_trans_id=trans_id,
        )
        setup.add(charge)
        await setup.commit()
        charge_id = charge.id
        org_id = org.id

    comgate_status[trans_id] = PaymentStatus(
        trans_id=trans_id,
        found=True,
        status="CANCELLED",
        ref_id=str(charge_id),
        raw={"message": "Customer cancelled"},
    )
    response = await client.post(
        "/api/v1/payments/webhook",
        json={"transId": trans_id},
    )
    assert response.status_code == 204, response.text
    # Settle the connection pool: ASGITransport's connection might
    # not have flushed back to PG by the time we open `fresh` below.
    import asyncio

    await asyncio.sleep(0.05)

    async with AsyncSessionLocal() as fresh:
        inv = await fresh.get(Charge, charge_id)
        assert inv is not None
        assert inv.status == "failed"
        assert "cancel" in (inv.failure_reason or "").lower()

        # Subscription unchanged — seat_count still at original 5.
        sub = (
            await fresh.execute(select(Subscription).where(Subscription.organization_id == org_id))
        ).scalar_one()
        assert sub.seat_count == 5
        assert sub.contracted_seat_count == 5

        # Cleanup: org-cascade does the heavy lifting; webhook_event
        # has no org FK so wipe it manually.
        await fresh.execute(delete(Organization).where(Organization.id == org_id))
        await fresh.execute(delete(WebhookEvent).where(WebhookEvent.comgate_event_id == trans_id))
        await fresh.commit()


# ---------------------------------------------------------------------------
# /payments/return + /payments/invoices (charges list)
# ---------------------------------------------------------------------------


async def test_return_url_redirects_to_frontend_with_status(
    client: AsyncClient,
) -> None:
    """The browser-facing return URL 302s to the frontend's billing-return
    page, carrying the charge status as a query param."""
    response = await client.get(
        "/api/v1/payments/return?transId=TX-XYZ&refId=not-a-uuid",
        follow_redirects=False,
    )
    assert response.status_code == 302
    location = response.headers["location"]
    assert location.endswith("/app/billing/return?status=pending&transId=TX-XYZ") or (
        "status=pending" in location and "transId=TX-XYZ" in location
    )


async def test_return_url_does_not_leak_charge_status(client: AsyncClient) -> None:
    # Review R1 P3: the unauthenticated return route must NOT reflect a charge's
    # DB status — that would let anyone holding a Charge UUID probe its payment
    # status across tenants. It always redirects with a neutral `pending`.
    async with AsyncSessionLocal() as s:
        org = Organization(name=f"ReturnLeak-{uuid.uuid4().hex[:6]}")
        s.add(org)
        await s.flush()
        charge = Charge(
            organization_id=org.id,
            kind="initial",
            amount_minor=9900,
            currency="CZK",
            status="paid",
            seats=1,
        )
        s.add(charge)
        await s.commit()
        charge_id = charge.id
        org_id = org.id

    try:
        resp = await client.get(
            f"/api/v1/payments/return?refId={charge_id}", follow_redirects=False
        )
        assert resp.status_code == 302
        location = resp.headers["location"]
        assert "status=pending" in location
        assert "status=paid" not in location
    finally:
        async with AsyncSessionLocal() as s:
            await s.execute(delete(Charge).where(Charge.id == charge_id))
            await s.execute(delete(Organization).where(Organization.id == org_id))
            await s.commit()


async def test_charges_requires_auth(client: AsyncClient) -> None:
    # Endpoint URL stays `/payments/invoices` (the customer-facing UI labels
    # this as "Faktury"); only the model + response-schema names changed.
    assert (await client.get("/api/v1/payments/invoices")).status_code == 401


async def test_seat_change_init_keeps_failed_charge_when_gateway_rejects(
    client: AsyncClient,
    owned_payments_emails: list[str],
) -> None:
    """Regression (review R2 P1): the pending charge is persisted BEFORE the
    card is billed, so a gateway rejection leaves an auditable failed charge
    (never a rolled-back row that a later webhook can't reconcile by refId)."""
    from app.services.comgate import ComGateError, get_comgate_client

    async with AsyncSessionLocal() as session:
        org, admin, _sub = await _seed_active_org_with_card(session, owned_payments_emails)
        org_id = org.id
        token = create_access_token(admin.id, admin.organization_id, UserRole.admin)

    class _RejectingComgate:
        async def create_recurring_payment(self, **_kwargs: object) -> object:
            raise ComGateError("card declined")

    app.dependency_overrides[get_comgate_client] = lambda: _RejectingComgate()
    try:
        resp = await client.post(
            "/api/v1/payments/seat-change-init",
            headers={"Authorization": f"Bearer {token}"},
            json={"seat_count": 50},
        )
        assert resp.status_code == 502, resp.text
    finally:
        app.dependency_overrides.pop(get_comgate_client, None)

    async with AsyncSessionLocal() as session:
        charges = (
            (
                await session.execute(
                    select(Charge).where(
                        Charge.organization_id == org_id, Charge.kind == "seat_upgrade"
                    )
                )
            )
            .scalars()
            .all()
        )
    assert len(charges) == 1, "the pending charge must survive a gateway rejection"
    assert charges[0].status == "failed"


async def test_seat_change_init_rejects_when_no_payment_method(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_payments_emails: list[str],
) -> None:
    """Active org without a saved card → 422 with code=no_payment_method
    (don't try to charge a card we don't have)."""
    org = Organization(name="Payments Test Org")
    db_session.add(org)
    await db_session.flush()
    email = f"nopm-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_payments_emails.append(email)
    admin = User(email=email, name="A", role=UserRole.admin, organization_id=org.id)
    db_session.add(admin)
    monthly_plan_id = (
        await db_session.execute(select(Plan.id).where(Plan.code == "monthly"))
    ).scalar_one()
    db_session.add(
        Subscription(
            organization_id=org.id,
            plan_id=monthly_plan_id,
            status="active",
            started_at=datetime.now(tz=UTC),
            current_period_starts_at=datetime.now(tz=UTC),
            current_period_ends_at=datetime.now(tz=UTC) + timedelta(days=30),
            seat_count=5,
            contracted_seat_count=5,
        )
    )
    await db_session.commit()

    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        "/api/v1/payments/seat-change-init",
        headers={"Authorization": f"Bearer {token}"},
        json={"seat_count": 50},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "no_payment_method"


# ---------------------------------------------------------------------------
# POST /demo-order — public gateway showcase (no auth)
# ---------------------------------------------------------------------------


class _FakeDemoComGate:
    """Captures create_demo_payment kwargs; returns a canned redirect."""

    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def create_demo_payment(self, **kwargs):
        from app.services.comgate import CreatedPayment

        self.calls.append(kwargs)
        return CreatedPayment(
            trans_id="DEMO-TX-1",
            redirect_url="https://payments.comgate.cz/client/instructions/index?id=DEMO-TX-1",
        )


@pytest.fixture
def demo_comgate():
    """Override the ComGate client + give the test its own rate limiter."""
    from app.api.v1.payments import get_demo_order_rate_limiter
    from app.main import app
    from app.services.comgate import get_comgate_client
    from app.services.lookup_cache import RateLimiter

    fake = _FakeDemoComGate()
    limiter = RateLimiter(max_calls=10, window_seconds=600)
    app.dependency_overrides[get_comgate_client] = lambda: fake
    app.dependency_overrides[get_demo_order_rate_limiter] = lambda: limiter
    try:
        yield fake
    finally:
        app.dependency_overrides.pop(get_comgate_client, None)
        app.dependency_overrides.pop(get_demo_order_rate_limiter, None)


async def test_demo_order_returns_redirect_without_auth(
    client: AsyncClient, demo_comgate: _FakeDemoComGate
) -> None:
    """Anonymous POST → hosted-page redirect URL; amount = seats × plan
    price; refId is the non-UUID "demo-…" shape the webhook ignores."""
    async with AsyncSessionLocal() as session:
        price = (
            await session.execute(select(Plan.price_per_user_minor).where(Plan.code == "monthly"))
        ).scalar_one()

    response = await client.post(
        "/api/v1/payments/demo-order",
        json={"plan_code": "monthly", "seats": 3, "email": "reviewer@comgate.cz"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["redirect_url"].startswith("https://payments.comgate.cz/")
    assert body["amount_minor"] == 3 * price

    assert len(demo_comgate.calls) == 1
    call = demo_comgate.calls[0]
    assert call["ref_id"].startswith("demo-")
    assert call["label"] == "SimpleCRM demo"
    assert call["url_paid"].endswith("/objednavka/navrat?status=paid")
    assert call["url_cancelled"].endswith("/objednavka/navrat?status=cancelled")
    assert call["url_pending"].endswith("/objednavka/navrat?status=pending")
    # No DB rows for demo orders.
    async with AsyncSessionLocal() as session:
        count = (
            await session.execute(
                select(func.count())
                .select_from(Charge)
                .where(Charge.comgate_trans_id == "DEMO-TX-1")
            )
        ).scalar_one()
    assert count == 0


async def test_demo_order_validates_seat_bounds(
    client: AsyncClient, demo_comgate: _FakeDemoComGate
) -> None:
    for seats in (0, 26):
        response = await client.post(
            "/api/v1/payments/demo-order",
            json={"plan_code": "monthly", "seats": seats, "email": "a@b.cz"},
        )
        assert response.status_code == 422
    assert demo_comgate.calls == []


async def test_demo_order_rate_limited_per_ip(client: AsyncClient) -> None:
    from app.api.v1.payments import get_demo_order_rate_limiter
    from app.main import app
    from app.services.comgate import get_comgate_client
    from app.services.lookup_cache import RateLimiter

    fake = _FakeDemoComGate()
    limiter = RateLimiter(max_calls=2, window_seconds=600)
    app.dependency_overrides[get_comgate_client] = lambda: fake
    app.dependency_overrides[get_demo_order_rate_limiter] = lambda: limiter
    try:
        payload = {"plan_code": "monthly", "seats": 1, "email": "a@b.cz"}
        for _ in range(2):
            ok = await client.post("/api/v1/payments/demo-order", json=payload)
            assert ok.status_code == 200
        blocked = await client.post("/api/v1/payments/demo-order", json=payload)
        assert blocked.status_code == 429
    finally:
        app.dependency_overrides.pop(get_comgate_client, None)
        app.dependency_overrides.pop(get_demo_order_rate_limiter, None)
