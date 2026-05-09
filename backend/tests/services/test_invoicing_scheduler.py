"""Renewal-draft scheduler tests.

`run_renewal_draft_sweep` walks every active subscription whose period
ends within `RENEWAL_DRAFT_LEAD_DAYS` and asks the orchestrator to
build a status='draft' Invoice. Idempotent — re-running returns
existing drafts via `prepare_renewal_draft`'s uniqueness check.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, update

from app.db.models import (
    BillingSettings,
    Invoice,
    Organization,
    Plan,
    Subscription,
)
from app.db.session import AsyncSessionLocal
from app.services.scheduler import (
    RENEWAL_DRAFT_LEAD_DAYS,
    run_renewal_draft_sweep,
)
from tests.conftest import wipe_invoicing_for_org

# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


async def _seed_org_with_active_sub(
    session: AsyncSessionLocal,
    *,
    plan_code: str = "monthly",
    period_ends_at: datetime,
    is_comp: bool = False,
) -> Organization:
    org = Organization(name=f"DraftSched-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.flush()
    plan_id = (await session.execute(select(Plan.id).where(Plan.code == plan_code))).scalar_one()
    now = datetime.now(tz=UTC)
    sub = Subscription(
        organization_id=org.id,
        plan_id=plan_id,
        status="active",
        is_comp=is_comp,
        started_at=now - timedelta(days=30),
        current_period_starts_at=now - timedelta(days=30),
        current_period_ends_at=period_ends_at,
        seat_count=3,
        contracted_seat_count=3,
    )
    session.add(sub)
    await session.flush()
    return org


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
    """Drafts don't validate issuer fields, but `_advance_period` reads
    `BillingSettings.default_payment_term_days` etc. — make sure the
    singleton row is in a known state."""
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


# --------------------------------------------------------------------------- #
# Tests
# --------------------------------------------------------------------------- #


async def test_sweep_creates_draft_for_sub_ending_within_lead_window(
    cleanup_orgs: list[uuid.UUID],
) -> None:
    """A monthly sub whose period ends in 3 days (within the 7-day lead)
    gets a draft invoice. Status='draft', no PDF stored, real number
    allocated."""
    period_end = datetime.now(tz=UTC) + timedelta(days=3)
    async with AsyncSessionLocal() as s:
        org = await _seed_org_with_active_sub(s, period_ends_at=period_end)
        cleanup_orgs.append(org.id)
        await s.commit()
        org_id = org.id

    drafts = await run_renewal_draft_sweep()
    assert drafts >= 1

    async with AsyncSessionLocal() as s:
        invoice = (
            await s.execute(select(Invoice).where(Invoice.organization_id == org_id))
        ).scalar_one()
        assert invoice.status == "draft"
        assert invoice.pdf_object_key is None
        assert invoice.pdf_sha256 is None
        # Real number was allocated, in YYYY-NNNN format.
        assert "-" in invoice.number
        assert invoice.year == datetime.now(tz=UTC).year


async def test_sweep_skips_subs_outside_lead_window(
    cleanup_orgs: list[uuid.UUID],
) -> None:
    """A sub ending well beyond the 7-day lead is left alone."""
    period_end = datetime.now(tz=UTC) + timedelta(days=RENEWAL_DRAFT_LEAD_DAYS + 5)
    async with AsyncSessionLocal() as s:
        org = await _seed_org_with_active_sub(s, period_ends_at=period_end)
        cleanup_orgs.append(org.id)
        await s.commit()
        org_id = org.id

    await run_renewal_draft_sweep()

    async with AsyncSessionLocal() as s:
        invoices = (
            (await s.execute(select(Invoice).where(Invoice.organization_id == org_id)))
            .scalars()
            .all()
        )
        assert invoices == []


async def test_sweep_skips_comp_orgs(cleanup_orgs: list[uuid.UUID]) -> None:
    """Comp subs pay nothing, so no invoice — even if their period ends
    soon."""
    period_end = datetime.now(tz=UTC) + timedelta(days=2)
    async with AsyncSessionLocal() as s:
        org = await _seed_org_with_active_sub(s, period_ends_at=period_end, is_comp=True)
        cleanup_orgs.append(org.id)
        await s.commit()
        org_id = org.id

    await run_renewal_draft_sweep()

    async with AsyncSessionLocal() as s:
        invoices = (
            (await s.execute(select(Invoice).where(Invoice.organization_id == org_id)))
            .scalars()
            .all()
        )
        assert invoices == []


async def test_sweep_is_idempotent_on_rerun(cleanup_orgs: list[uuid.UUID]) -> None:
    """Running twice in the same window doesn't create a second draft —
    `prepare_renewal_draft` returns the existing row. The yearly counter
    is NOT bumped a second time."""
    period_end = datetime.now(tz=UTC) + timedelta(days=2)
    async with AsyncSessionLocal() as s:
        org = await _seed_org_with_active_sub(s, period_ends_at=period_end)
        cleanup_orgs.append(org.id)
        await s.commit()
        org_id = org.id

    await run_renewal_draft_sweep()
    await run_renewal_draft_sweep()

    async with AsyncSessionLocal() as s:
        invoices = (
            (await s.execute(select(Invoice).where(Invoice.organization_id == org_id)))
            .scalars()
            .all()
        )
        assert len(invoices) == 1, "second sweep created a duplicate draft"
