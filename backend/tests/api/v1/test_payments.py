"""Integration tests for /api/v1/payments/*.

Coverage:
  - Webhook signature verification (rejects unsigned + bad sig)
  - Webhook idempotency (re-delivery is a no-op)
  - Webhook routes paid initial → status=active + payment_method saved
  - Webhook routes paid seat_upgrade → seat_count + contracted lifted
  - Webhook routes failure → charge marked failed
  - Return URL handling (200 + Location header reflects charge status)
  - GET /charges requires admin
  - POST /seat-change-init returns 422 without saved card
"""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import (
    Charge,
    Organization,
    PaymentMethod,
    Plan,
    Subscription,
    User,
    UserRole,
    WebhookEvent,
)
from app.db.session import AsyncSessionLocal

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _set_comgate_secret(monkeypatch) -> None:
    """Populate ComGate creds so the webhook signature path runs.

    Without these, `verify_webhook_signature` (and any of the
    customer-facing endpoints) would 503 on `_require_credentials`.
    Cleared automatically per-test via monkeypatch.
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
            await session.execute(delete(User).where(User.email.in_(tracked)))
            await session.execute(
                delete(Organization).where(Organization.name == "Payments Test Org")
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


def _sign(body: bytes) -> str:
    return hmac.new(b"test-secret", body, hashlib.sha256).hexdigest()


# ---------------------------------------------------------------------------
# Webhook signature
# ---------------------------------------------------------------------------


async def test_webhook_rejects_unsigned_request(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/payments/webhook",
        json={"transId": "x", "status": "PAID"},
    )
    assert response.status_code == 400
    assert "signature" in response.json()["detail"].lower()


async def test_webhook_rejects_bad_signature(client: AsyncClient) -> None:
    body = json.dumps({"transId": "x", "status": "PAID"}).encode()
    response = await client.post(
        "/api/v1/payments/webhook",
        content=body,
        headers={
            "content-type": "application/json",
            "x-comgate-signature": "0" * 64,
        },
    )
    assert response.status_code == 400


async def test_webhook_rejects_when_body_tampered(client: AsyncClient) -> None:
    """Signing the original body, but POSTing a tampered one, must 400."""
    original = json.dumps({"transId": "x", "status": "PAID", "price": 9900}).encode()
    tampered = json.dumps({"transId": "x", "status": "PAID", "price": 1}).encode()
    sig = _sign(original)
    response = await client.post(
        "/api/v1/payments/webhook",
        content=tampered,
        headers={
            "content-type": "application/json",
            "x-comgate-signature": sig,
        },
    )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Webhook routing — initial payment success
# ---------------------------------------------------------------------------


async def test_webhook_initial_paid_promotes_to_active(
    client: AsyncClient,
    owned_payments_emails: list[str],
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

    body = json.dumps(
        {
            "transId": trans_id,
            "status": "PAID",
            "refId": str(charge_id),
        }
    ).encode()
    response = await client.post(
        "/api/v1/payments/webhook",
        content=body,
        headers={
            "content-type": "application/json",
            "x-comgate-signature": _sign(body),
        },
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

        # Cleanup: org-cascade does the heavy lifting; webhook_event
        # has no org FK so wipe it manually.
        await fresh.execute(delete(Organization).where(Organization.id == org_id))
        await fresh.execute(delete(WebhookEvent).where(WebhookEvent.comgate_event_id == trans_id))
        await fresh.commit()


# ---------------------------------------------------------------------------
# Webhook idempotency
# ---------------------------------------------------------------------------


async def test_webhook_double_delivery_is_idempotent(
    client: AsyncClient,
    owned_payments_emails: list[str],
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

    body = json.dumps(
        {
            "transId": trans_id,
            "status": "PAID",
            "refId": str(charge_id),
        }
    ).encode()
    sig = _sign(body)
    headers = {
        "content-type": "application/json",
        "x-comgate-signature": sig,
    }

    r1 = await client.post("/api/v1/payments/webhook", content=body, headers=headers)
    r2 = await client.post("/api/v1/payments/webhook", content=body, headers=headers)
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

        # Cleanup: delete the org and let ON DELETE CASCADE wipe
        # subscription / charge / payment_method. webhook_event has no
        # org FK so it needs its own delete.
        await fresh.execute(delete(Organization).where(Organization.id == org_id))
        await fresh.execute(delete(WebhookEvent).where(WebhookEvent.comgate_event_id == trans_id))
        await fresh.commit()


# ---------------------------------------------------------------------------
# Webhook failure path
# ---------------------------------------------------------------------------


async def test_webhook_failed_marks_charge_failed(
    client: AsyncClient,
    owned_payments_emails: list[str],
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

    body = json.dumps(
        {
            "transId": trans_id,
            "status": "CANCELLED",
            "refId": str(charge_id),
            "message": "Customer cancelled",
        }
    ).encode()
    response = await client.post(
        "/api/v1/payments/webhook",
        content=body,
        headers={
            "content-type": "application/json",
            "x-comgate-signature": _sign(body),
        },
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


async def test_charges_requires_auth(client: AsyncClient) -> None:
    # Endpoint URL stays `/payments/invoices` (the customer-facing UI labels
    # this as "Faktury"); only the model + response-schema names changed.
    assert (await client.get("/api/v1/payments/invoices")).status_code == 401


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
