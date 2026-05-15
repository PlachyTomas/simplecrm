"""Tests for `run_overdue_invoice_sweep` — the bank-transfer lockout job.

When ComGate is off, this is the job that flips a sub to `past_due`
when the customer doesn't pay an invoice by `due_at`. Once past_due,
the existing 7-day grace in `is_app_access_allowed` runs out and the
pay-gate locks.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select, update

from app.db.models import (
    Activity,
    BillingSettings,
    Organization,
    Plan,
    Subscription,
    User,
    UserRole,
)
from app.db.session import AsyncSessionLocal
from app.services.invoicing.service import InvoiceService, ManualLineIn
from app.services.scheduler import run_overdue_invoice_sweep
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


async def _seed_active_sub(*, is_comp: bool = False) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    """Returns (org_id, sub_id, admin_user_id)."""
    async with AsyncSessionLocal() as s:
        org = Organization(name=f"Overdue-{uuid.uuid4().hex[:6]}")
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
        plan_id = (
            await s.execute(select(Plan.id).where(Plan.code == ("comp" if is_comp else "monthly")))
        ).scalar_one()
        now = datetime.now(tz=UTC)
        sub = Subscription(
            organization_id=org.id,
            plan_id=plan_id,
            status="active",
            is_comp=is_comp,
            started_at=now - timedelta(days=30),
            current_period_starts_at=now - timedelta(days=30),
            current_period_ends_at=now - timedelta(days=2),
            seat_count=2,
            contracted_seat_count=2,
        )
        s.add(sub)
        await s.commit()
        return org.id, sub.id, admin.id


async def _issue_invoice(
    org_id: uuid.UUID, admin_id: uuid.UUID, *, link: bool, due_at: date | None
) -> uuid.UUID:
    svc = InvoiceService()
    async with AsyncSessionLocal() as s:
        inv = await svc.issue_manual(
            s,
            org_id=org_id,
            lines_in=[
                ManualLineIn(
                    description="SimpleCRM, plán Měsíční",
                    quantity=Decimal("2"),
                    unit_price_minor=9900,
                    unit_label="uživatel",
                )
            ],
            note=None,
            due_at=due_at,
            by_admin_id=admin_id,
            link_subscription=link,
        )
        await s.commit()
        return inv.id


async def test_sweep_flips_overdue_linked_invoice_to_past_due(
    cleanup_orgs: list[uuid.UUID],
) -> None:
    """Issued, subscription-linked invoice past `due_at` → sub becomes
    `past_due` and an Activity row records the flip."""
    org_id, sub_id, admin_id = await _seed_active_sub()
    cleanup_orgs.append(org_id)

    yesterday = (datetime.now(tz=UTC) - timedelta(days=2)).date()
    await _issue_invoice(org_id, admin_id, link=True, due_at=yesterday)

    flipped = await run_overdue_invoice_sweep()
    assert flipped >= 1

    async with AsyncSessionLocal() as s:
        sub = await s.get(Subscription, sub_id)
        assert sub.status == "past_due"

        # Activity row was written.
        rows = (
            (
                await s.execute(
                    select(Activity).where(
                        Activity.organization_id == org_id,
                        Activity.payload["action"].astext == "overdue_invoice_past_due",
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1


async def test_sweep_skips_unlinked_invoice(cleanup_orgs: list[uuid.UUID]) -> None:
    """Manual invoice without subscription_id (refund / one-off) does
    NOT lock the org out — those invoices aren't part of the renewal
    pay-cycle."""
    org_id, sub_id, admin_id = await _seed_active_sub()
    cleanup_orgs.append(org_id)

    yesterday = (datetime.now(tz=UTC) - timedelta(days=2)).date()
    await _issue_invoice(org_id, admin_id, link=False, due_at=yesterday)

    await run_overdue_invoice_sweep()

    async with AsyncSessionLocal() as s:
        sub = await s.get(Subscription, sub_id)
        assert sub.status == "active"


async def test_sweep_skips_paid_invoice(cleanup_orgs: list[uuid.UUID]) -> None:
    """An invoice that's been marked paid mustn't trigger lockout, even
    if its `due_at` is in the past (paid late but received)."""
    org_id, sub_id, admin_id = await _seed_active_sub()
    cleanup_orgs.append(org_id)

    yesterday = (datetime.now(tz=UTC) - timedelta(days=2)).date()
    invoice_id = await _issue_invoice(org_id, admin_id, link=True, due_at=yesterday)

    # Mark paid — this also extends the sub via the wiring from task #1.
    svc = InvoiceService()
    async with AsyncSessionLocal() as s:
        await svc.mark_paid(s, invoice_id, paid_at=None, by_admin_id=admin_id)
        await s.commit()

    flipped = await run_overdue_invoice_sweep()
    assert flipped == 0

    async with AsyncSessionLocal() as s:
        sub = await s.get(Subscription, sub_id)
        assert sub.status == "active"


async def test_sweep_skips_comp_org(cleanup_orgs: list[uuid.UUID]) -> None:
    """Comp orgs never lock out — even if the founder issued + linked
    an invoice and the customer ignored it."""
    org_id, sub_id, admin_id = await _seed_active_sub(is_comp=True)
    cleanup_orgs.append(org_id)

    yesterday = (datetime.now(tz=UTC) - timedelta(days=2)).date()
    await _issue_invoice(org_id, admin_id, link=True, due_at=yesterday)

    await run_overdue_invoice_sweep()

    async with AsyncSessionLocal() as s:
        sub = await s.get(Subscription, sub_id)
        assert sub.status == "active"
        assert sub.is_comp is True


async def test_sweep_is_idempotent(cleanup_orgs: list[uuid.UUID]) -> None:
    """Running the sweep twice doesn't double-flip — sub is filtered out
    on the second pass because status is already past_due. The Activity
    row from the first pass remains the only record.

    (Tests can't roll back Activity rows because the invoice flow's
    triggers fight with the test transaction; we wipe at teardown.)
    """
    org_id, _, admin_id = await _seed_active_sub()
    cleanup_orgs.append(org_id)

    yesterday = (datetime.now(tz=UTC) - timedelta(days=2)).date()
    await _issue_invoice(org_id, admin_id, link=True, due_at=yesterday)

    await run_overdue_invoice_sweep()
    await run_overdue_invoice_sweep()

    async with AsyncSessionLocal() as s:
        rows = (
            (
                await s.execute(
                    select(Activity).where(
                        Activity.organization_id == org_id,
                        Activity.payload["action"].astext == "overdue_invoice_past_due",
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1, "second sweep must not re-flip an already-past_due sub"


async def test_sweep_collapses_multiple_overdue_invoices(
    cleanup_orgs: list[uuid.UUID],
) -> None:
    """An org with two overdue invoices flips its single subscription
    once, not twice. Past-due is a per-sub state, not a per-invoice one."""
    org_id, sub_id, admin_id = await _seed_active_sub()
    cleanup_orgs.append(org_id)

    yesterday = (datetime.now(tz=UTC) - timedelta(days=2)).date()
    await _issue_invoice(org_id, admin_id, link=True, due_at=yesterday)
    await _issue_invoice(org_id, admin_id, link=True, due_at=yesterday)

    flipped = await run_overdue_invoice_sweep()
    assert flipped == 1

    async with AsyncSessionLocal() as s:
        sub = await s.get(Subscription, sub_id)
        assert sub.status == "past_due"
