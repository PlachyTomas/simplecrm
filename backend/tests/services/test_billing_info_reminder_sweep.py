"""Tests for `run_billing_info_reminder_sweep`.

Emails each trialing org's admins once when:
  - trial_ends_at is within ~1 week
  - org.ico / address fields are still missing
  - org.billing_info_reminder_sent_at is NULL (dedup)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.db.models import Organization, Plan, Subscription, User, UserRole
from app.db.session import AsyncSessionLocal
from app.services.scheduler import run_billing_info_reminder_sweep
from tests.conftest import wipe_invoicing_for_org


@pytest.fixture
async def cleanup_orgs() -> list[uuid.UUID]:
    ids: list[uuid.UUID] = []
    try:
        yield ids
    finally:
        if ids:
            await wipe_invoicing_for_org(ids)


async def _seed(
    *,
    days_to_trial_end: int,
    complete: bool,
    sub_status: str = "trialing",
    is_comp: bool = False,
    reminder_sent: bool = False,
) -> tuple[uuid.UUID, uuid.UUID]:
    """Returns (org_id, admin_user_id)."""
    async with AsyncSessionLocal() as s:
        now = datetime.now(tz=UTC)
        org = Organization(
            name=f"BillRem-{uuid.uuid4().hex[:6]}",
            trial_ends_at=now + timedelta(days=days_to_trial_end),
            ico="12345678" if complete else None,
            address_street="Hlavní 1" if complete else None,
            address_city="Praha" if complete else None,
            address_zip="11000" if complete else None,
            billing_info_reminder_sent_at=now - timedelta(days=1) if reminder_sent else None,
        )
        s.add(org)
        await s.flush()
        admin = User(
            email=f"admin-{uuid.uuid4().hex[:8]}@ex.cz",
            name="Admin",
            role=UserRole.admin,
            organization_id=org.id,
        )
        s.add(admin)
        plan_id = (
            await s.execute(select(Plan.id).where(Plan.code == ("comp" if is_comp else "trial")))
        ).scalar_one()
        sub = Subscription(
            organization_id=org.id,
            plan_id=plan_id,
            status=sub_status,
            is_comp=is_comp,
            started_at=now - timedelta(days=23),
            current_period_starts_at=now - timedelta(days=23),
            current_period_ends_at=org.trial_ends_at,
            seat_count=1,
            contracted_seat_count=1,
        )
        s.add(sub)
        await s.commit()
        return org.id, admin.id


async def test_sweep_emails_admin_when_trial_close_and_info_missing(
    cleanup_orgs: list[uuid.UUID],
) -> None:
    org_id, _ = await _seed(days_to_trial_end=7, complete=False)
    cleanup_orgs.append(org_id)

    notified = await run_billing_info_reminder_sweep()
    assert notified == 1

    async with AsyncSessionLocal() as s:
        org = await s.get(Organization, org_id)
        assert org.billing_info_reminder_sent_at is not None


async def test_sweep_skips_when_billing_info_complete(
    cleanup_orgs: list[uuid.UUID],
) -> None:
    org_id, _ = await _seed(days_to_trial_end=7, complete=True)
    cleanup_orgs.append(org_id)

    notified = await run_billing_info_reminder_sweep()
    assert notified == 0

    async with AsyncSessionLocal() as s:
        org = await s.get(Organization, org_id)
        assert org.billing_info_reminder_sent_at is None


async def test_sweep_skips_when_trial_far_out(cleanup_orgs: list[uuid.UUID]) -> None:
    """Day-20 of remaining trial is outside the 5-8 day window — no nudge."""
    org_id, _ = await _seed(days_to_trial_end=20, complete=False)
    cleanup_orgs.append(org_id)

    assert await run_billing_info_reminder_sweep() == 0


async def test_sweep_skips_when_trial_already_ended(cleanup_orgs: list[uuid.UUID]) -> None:
    """Negative days_to_trial_end → trial already expired. The trial-end
    cliff is past; emailing the admin to fix billing info now is too late
    and the regular pay-gate has taken over."""
    org_id, _ = await _seed(days_to_trial_end=-1, complete=False)
    cleanup_orgs.append(org_id)

    assert await run_billing_info_reminder_sweep() == 0


async def test_sweep_skips_when_already_reminded(cleanup_orgs: list[uuid.UUID]) -> None:
    """Dedup: stamping `billing_info_reminder_sent_at` keeps the daily
    sweep idempotent."""
    org_id, _ = await _seed(days_to_trial_end=7, complete=False, reminder_sent=True)
    cleanup_orgs.append(org_id)

    assert await run_billing_info_reminder_sweep() == 0


async def test_sweep_skips_comp_orgs(cleanup_orgs: list[uuid.UUID]) -> None:
    """Comp orgs don't pay; they don't need an invoice; no nudge."""
    org_id, _ = await _seed(days_to_trial_end=7, complete=False, sub_status="active", is_comp=True)
    cleanup_orgs.append(org_id)

    assert await run_billing_info_reminder_sweep() == 0


async def test_sweep_skips_non_trialing_subs(cleanup_orgs: list[uuid.UUID]) -> None:
    """Already-active subscriptions are past the trial-end cliff
    semantically; the reminder is trial-specific."""
    org_id, _ = await _seed(days_to_trial_end=7, complete=False, sub_status="active")
    cleanup_orgs.append(org_id)

    assert await run_billing_info_reminder_sweep() == 0


async def test_sweep_is_idempotent_on_rerun(cleanup_orgs: list[uuid.UUID]) -> None:
    """First run notifies; second run on the same day must not re-fire."""
    org_id, _ = await _seed(days_to_trial_end=7, complete=False)
    cleanup_orgs.append(org_id)

    assert await run_billing_info_reminder_sweep() == 1
    assert await run_billing_info_reminder_sweep() == 0
