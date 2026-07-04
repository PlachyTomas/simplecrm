"""Tests for the bank-transfer manual-payment flow.

Covers `billing.apply_manual_payment_success` (the sibling of
`apply_renewal_success` for non-Comgate flows) and the wiring inside
`InvoiceService.mark_paid` that calls it. Until ComGate is wired,
this is the path that keeps paying customers active and locks out
non-paying ones.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, update

from app.db.models import (
    BillingSettings,
    InvoiceAuditLog,
    Organization,
    Plan,
    Subscription,
    User,
    UserRole,
)
from app.db.session import AsyncSessionLocal
from app.services import billing
from app.services.invoicing.service import InvoiceService, ManualLineIn
from tests.conftest import wipe_invoicing_for_org


@pytest.fixture
async def cleanup_orgs() -> list[uuid.UUID]:
    ids: list[uuid.UUID] = []
    try:
        yield ids
    finally:
        if ids:
            await wipe_invoicing_for_org(ids)


@pytest.fixture(autouse=True)
async def _ensure_billing_baseline() -> None:
    async with AsyncSessionLocal() as s:
        await s.execute(
            update(BillingSettings).values(
                default_payment_term_days=14,
                seller_iban="CZ6508000000192000145399",
                seller_ico="12345678",
                issuer_name="T",
                issuer_address_street="A",
                issuer_address_city="B",
                issuer_address_zip="1",
                issuer_register_text="r",
            )
        )
        await s.commit()
    yield


async def _seed_org_with_sub(
    *,
    plan_code: str,
    status: str = "active",
    is_comp: bool = False,
    period_ends_at: datetime | None = None,
) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    """Returns (org_id, sub_id, admin_user_id). The admin is the
    by_admin_id passed into invoice service calls (audit-log FK)."""
    async with AsyncSessionLocal() as s:
        org = Organization(name=f"Pay-{uuid.uuid4().hex[:6]}")
        s.add(org)
        await s.flush()
        admin = User(
            email=f"admin-{uuid.uuid4().hex[:8]}@ex.cz",
            name="Admin",
            role=UserRole.admin,
            organization_id=org.id,
            is_super_admin=True,
        )
        s.add(admin)
        plan_id = (await s.execute(select(Plan.id).where(Plan.code == plan_code))).scalar_one()
        now = datetime.now(tz=UTC)
        sub = Subscription(
            organization_id=org.id,
            plan_id=plan_id,
            status=status,
            is_comp=is_comp,
            started_at=now - timedelta(days=30),
            current_period_starts_at=now - timedelta(days=30),
            current_period_ends_at=period_ends_at or now - timedelta(days=1),
            seat_count=2,
            contracted_seat_count=2,
        )
        s.add(sub)
        await s.commit()
        return org.id, sub.id, admin.id


# --------------------------------------------------------------------------- #
# apply_manual_payment_success
# --------------------------------------------------------------------------- #


async def test_apply_manual_payment_success_extends_active_monthly_sub(
    cleanup_orgs: list[uuid.UUID],
) -> None:
    """Active monthly sub past its period end gets a fresh 30-day window."""
    org_id, _, _ = await _seed_org_with_sub(plan_code="monthly", status="active")
    cleanup_orgs.append(org_id)

    async with AsyncSessionLocal() as s:
        result = await billing.apply_manual_payment_success(
            s, org_id=org_id, invoice_number="2026-0042", paid_at=datetime.now(tz=UTC)
        )
        await s.commit()

    assert result is not None
    assert result.status == "active"
    # One calendar month from now (anchored at now because period had ended).
    expected_end = billing._add_months(datetime.now(tz=UTC), 1)
    assert abs((result.current_period_ends_at - expected_end).total_seconds()) < 60


async def test_apply_manual_payment_anchors_at_period_end_when_still_open(
    cleanup_orgs: list[uuid.UUID],
) -> None:
    """If the period is still open (founder pre-bills a renewal), the new
    period stacks on top of the unused tail rather than discarding it."""
    future_end = datetime.now(tz=UTC) + timedelta(days=5)
    org_id, _, _ = await _seed_org_with_sub(
        plan_code="monthly", status="active", period_ends_at=future_end
    )
    cleanup_orgs.append(org_id)

    async with AsyncSessionLocal() as s:
        result = await billing.apply_manual_payment_success(
            s, org_id=org_id, invoice_number="2026-0042", paid_at=datetime.now(tz=UTC)
        )
        await s.commit()

    assert result is not None
    expected = billing._add_months(future_end, 1)
    assert abs((result.current_period_ends_at - expected).total_seconds()) < 60


async def test_apply_manual_payment_success_skips_comp_org(
    cleanup_orgs: list[uuid.UUID],
) -> None:
    """Comp orgs don't run on a paid clock; payment is a no-op."""
    org_id, _, _ = await _seed_org_with_sub(plan_code="comp", is_comp=True)
    cleanup_orgs.append(org_id)

    async with AsyncSessionLocal() as s:
        result = await billing.apply_manual_payment_success(
            s, org_id=org_id, invoice_number="2026-0042", paid_at=datetime.now(tz=UTC)
        )

    assert result is None


async def test_apply_manual_payment_success_skips_canceled_sub(
    cleanup_orgs: list[uuid.UUID],
) -> None:
    """A hard-canceled sub stays canceled — reactivation is an explicit
    `activate_subscription` admin action, not an invoice payment."""
    org_id, _, _ = await _seed_org_with_sub(plan_code="monthly", status="canceled")
    cleanup_orgs.append(org_id)

    async with AsyncSessionLocal() as s:
        result = await billing.apply_manual_payment_success(
            s, org_id=org_id, invoice_number="2026-0042", paid_at=datetime.now(tz=UTC)
        )

    assert result is None


async def test_apply_manual_payment_success_recovers_past_due_sub(
    cleanup_orgs: list[uuid.UUID],
) -> None:
    """The canonical lockout-recovery path: customer pays late, founder
    marks invoice paid, sub flips back to active and the pay-gate reopens."""
    org_id, _, _ = await _seed_org_with_sub(plan_code="monthly", status="past_due")
    cleanup_orgs.append(org_id)

    async with AsyncSessionLocal() as s:
        result = await billing.apply_manual_payment_success(
            s, org_id=org_id, invoice_number="2026-0042", paid_at=datetime.now(tz=UTC)
        )
        await s.commit()

    assert result is not None
    assert result.status == "active"
    assert result.dunning_attempts == 0


# --------------------------------------------------------------------------- #
# InvoiceService.mark_paid wiring
# --------------------------------------------------------------------------- #


async def _issue_manual_linked(org_id: uuid.UUID, admin_id: uuid.UUID, *, link: bool) -> uuid.UUID:
    """Issue a manual invoice via the service; optionally link it to the
    org's subscription. Returns the new invoice ID."""
    from decimal import Decimal as _Decimal

    svc = InvoiceService()
    async with AsyncSessionLocal() as s:
        inv = await svc.issue_manual(
            s,
            org_id=org_id,
            lines_in=[
                ManualLineIn(
                    description="SimpleCRM, plán Měsíční, 2 uživatelé",
                    quantity=_Decimal("2"),
                    unit_price_minor=9900,
                    unit_label="uživatel",
                )
            ],
            note=None,
            by_admin_id=admin_id,
            link_subscription=link,
        )
        await s.commit()
        return inv.id


async def test_mark_paid_extends_subscription_when_linked(
    cleanup_orgs: list[uuid.UUID],
) -> None:
    """End-to-end: linked manual invoice → mark paid → subscription
    period extends. Audit log records both `paid` and
    `subscription_extended` events."""
    org_id, sub_id, admin_id = await _seed_org_with_sub(plan_code="monthly", status="past_due")
    cleanup_orgs.append(org_id)

    invoice_id = await _issue_manual_linked(org_id, admin_id, link=True)

    svc = InvoiceService()
    async with AsyncSessionLocal() as s:
        await svc.mark_paid(s, invoice_id, paid_at=None, by_admin_id=admin_id)
        await s.commit()

    async with AsyncSessionLocal() as s:
        sub = await s.get(Subscription, sub_id)
        assert sub.status == "active"
        assert sub.current_period_ends_at > datetime.now(tz=UTC)

        events = (
            (
                await s.execute(
                    select(InvoiceAuditLog.event).where(InvoiceAuditLog.invoice_id == invoice_id)
                )
            )
            .scalars()
            .all()
        )
        assert "paid" in events
        assert "subscription_extended" in events


async def test_mark_paid_leaves_subscription_alone_when_unlinked(
    cleanup_orgs: list[uuid.UUID],
) -> None:
    """A manual invoice without subscription_id (refund / one-off) must
    NOT touch the subscription. Otherwise issuing a refund against a
    past_due tenant would silently unlock them."""
    org_id, sub_id, admin_id = await _seed_org_with_sub(plan_code="monthly", status="past_due")
    cleanup_orgs.append(org_id)

    invoice_id = await _issue_manual_linked(org_id, admin_id, link=False)

    svc = InvoiceService()
    async with AsyncSessionLocal() as s:
        await svc.mark_paid(s, invoice_id, paid_at=None, by_admin_id=admin_id)
        await s.commit()

    async with AsyncSessionLocal() as s:
        sub = await s.get(Subscription, sub_id)
        assert sub.status == "past_due", "unlinked invoice payment must not touch sub"

        events = (
            (
                await s.execute(
                    select(InvoiceAuditLog.event).where(InvoiceAuditLog.invoice_id == invoice_id)
                )
            )
            .scalars()
            .all()
        )
        assert "paid" in events
        assert "subscription_extended" not in events
