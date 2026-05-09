"""Tests for `BillingService` — subscription lifecycle + access predicate."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Activity,
    ActivityEntityType,
    ActivityType,
    BillingSettings,
    Organization,
    Plan,
    Subscription,
    User,
    UserRole,
)
from app.services import billing

# ---------------------------------------------------------------------------
# Test fixtures
# ---------------------------------------------------------------------------


async def _seed_org_with_trial(db_session: AsyncSession) -> tuple[Organization, User]:
    """Create an org + admin user + trialing Subscription pointing at the
    seeded `trial` plan. Mirrors what the onboarding service produces.
    """
    org = Organization(name=f"Org-{uuid.uuid4().hex[:6]}")
    db_session.add(org)
    await db_session.flush()

    admin = User(
        email=f"a-{uuid.uuid4().hex[:8]}@ex.cz",
        name="Admin",
        role=UserRole.admin,
        organization_id=org.id,
    )
    db_session.add(admin)

    trial_plan_id = (
        await db_session.execute(select(Plan.id).where(Plan.code == "trial"))
    ).scalar_one()
    sub = Subscription(
        organization_id=org.id,
        plan_id=trial_plan_id,
        status="trialing",
        started_at=org.created_at,
        current_period_starts_at=org.created_at,
        current_period_ends_at=org.trial_ends_at,
    )
    db_session.add(sub)
    await db_session.flush()
    await db_session.refresh(sub, attribute_names=["plan"])
    return org, admin


# ---------------------------------------------------------------------------
# Pure-function helpers
# ---------------------------------------------------------------------------


def test_compute_savings_one_user() -> None:
    s = billing.compute_savings(1)
    assert s.monthly_total_minor == 9900 * 12  # 118 800
    assert s.annual_total_minor == 99900
    assert s.savings_minor == 18900
    assert 15.0 < s.savings_percent < 16.5


def test_compute_savings_eight_users() -> None:
    s = billing.compute_savings(8)
    # 8 × 18 900 = 151 200 minor (1 512 Kč) — matches the prompt example.
    assert s.savings_minor == 8 * 18900
    assert s.savings_percent == billing.compute_savings(1).savings_percent


def test_compute_savings_rejects_negative() -> None:
    with pytest.raises(billing.BillingError):
        billing.compute_savings(-1)


async def test_compute_with_vat_off(db_session: AsyncSession) -> None:
    out = await billing.compute_with_vat(db_session, base_minor=9900)
    assert out.with_vat_minor == 9900
    assert out.vat_amount_minor == 0


async def test_compute_with_vat_on(db_session: AsyncSession) -> None:
    settings = (await db_session.execute(select(BillingSettings))).scalar_one()
    settings.is_vat_payer = True
    await db_session.flush()
    out = await billing.compute_with_vat(db_session, base_minor=9900)
    # 9900 × 1.21 = 11 979 (no rounding required)
    assert out.with_vat_minor == 11979
    assert out.vat_amount_minor == 2079


# ---------------------------------------------------------------------------
# is_app_access_allowed truth table
# ---------------------------------------------------------------------------


@pytest.fixture
def fresh_sub() -> Subscription:
    """Detached Subscription instance for the access-predicate tests."""
    return Subscription(
        organization_id=uuid.uuid4(),
        plan_id=uuid.uuid4(),
        status="trialing",
        started_at=datetime.now(tz=UTC),
    )


def test_access_comp_is_always_allowed(fresh_sub: Subscription) -> None:
    fresh_sub.is_comp = True
    fresh_sub.status = "canceled"  # comp wins
    fresh_sub.current_period_ends_at = datetime(2020, 1, 1, tzinfo=UTC)
    assert billing.is_app_access_allowed(fresh_sub) is True


def test_access_trialing_within_period(fresh_sub: Subscription) -> None:
    fresh_sub.status = "trialing"
    fresh_sub.current_period_ends_at = datetime.now(tz=UTC) + timedelta(days=10)
    assert billing.is_app_access_allowed(fresh_sub) is True


def test_access_trialing_expired(fresh_sub: Subscription) -> None:
    fresh_sub.status = "trialing"
    fresh_sub.current_period_ends_at = datetime.now(tz=UTC) - timedelta(days=1)
    assert billing.is_app_access_allowed(fresh_sub) is False


def test_access_active_within_period(fresh_sub: Subscription) -> None:
    fresh_sub.status = "active"
    fresh_sub.current_period_ends_at = datetime.now(tz=UTC) + timedelta(days=30)
    assert billing.is_app_access_allowed(fresh_sub) is True


def test_access_active_expired(fresh_sub: Subscription) -> None:
    fresh_sub.status = "active"
    fresh_sub.current_period_ends_at = datetime.now(tz=UTC) - timedelta(days=1)
    assert billing.is_app_access_allowed(fresh_sub) is False


def test_access_past_due_within_grace(fresh_sub: Subscription) -> None:
    fresh_sub.status = "past_due"
    fresh_sub.current_period_ends_at = datetime.now(tz=UTC) - timedelta(days=3)
    assert billing.is_app_access_allowed(fresh_sub) is True


def test_access_past_due_outside_grace(fresh_sub: Subscription) -> None:
    fresh_sub.status = "past_due"
    fresh_sub.current_period_ends_at = datetime.now(tz=UTC) - timedelta(days=10)
    assert billing.is_app_access_allowed(fresh_sub) is False


def test_access_canceled_denied(fresh_sub: Subscription) -> None:
    fresh_sub.status = "canceled"
    fresh_sub.current_period_ends_at = datetime.now(tz=UTC) + timedelta(days=30)
    assert billing.is_app_access_allowed(fresh_sub) is False


def test_access_pending_activation_denied(fresh_sub: Subscription) -> None:
    fresh_sub.status = "pending_activation"
    fresh_sub.current_period_ends_at = datetime.now(tz=UTC) + timedelta(days=30)
    assert billing.is_app_access_allowed(fresh_sub) is False


# ---------------------------------------------------------------------------
# Lifecycle methods
# ---------------------------------------------------------------------------


async def test_get_current_subscription_returns_seeded(
    db_session: AsyncSession,
) -> None:
    org, _admin = await _seed_org_with_trial(db_session)
    sub = await billing.get_current_subscription(db_session, org.id)
    assert sub.organization_id == org.id
    assert sub.status == "trialing"


async def test_get_effective_price_uses_override(db_session: AsyncSession) -> None:
    org, _admin = await _seed_org_with_trial(db_session)
    sub = await billing.get_current_subscription(db_session, org.id)
    assert billing.get_effective_price_per_user_minor(sub) == 0  # trial price
    sub.override_price_per_user_minor = 12345
    assert billing.get_effective_price_per_user_minor(sub) == 12345


async def test_choose_plan_marks_pending_and_audits(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: list = []

    async def fake_send(message):  # type: ignore[no-untyped-def]
        sent.append(message)

    monkeypatch.setattr("app.services.billing.send_email", fake_send)

    org, admin = await _seed_org_with_trial(db_session)
    sub = await billing.choose_plan(
        db_session,
        org_id=org.id,
        plan_code="annual",
        requested_by_user_id=admin.id,
    )
    assert sub.status == "pending_activation"
    annual_id = (
        await db_session.execute(select(Plan.id).where(Plan.code == "annual"))
    ).scalar_one()
    assert sub.plan_id == annual_id
    assert len(sent) == 1
    assert "Roční" in sent[0].subject
    activities = (
        (await db_session.execute(select(Activity).where(Activity.organization_id == org.id)))
        .scalars()
        .all()
    )
    assert any(
        a.activity_type is ActivityType.subscription_change
        and a.entity_type is ActivityEntityType.organization
        and a.payload.get("action") == "choose"
        for a in activities
    )


async def test_choose_plan_idempotent(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = 0

    async def fake_send(message):  # type: ignore[no-untyped-def]
        nonlocal calls
        calls += 1

    monkeypatch.setattr("app.services.billing.send_email", fake_send)

    org, admin = await _seed_org_with_trial(db_session)
    await billing.choose_plan(
        db_session, org_id=org.id, plan_code="monthly", requested_by_user_id=admin.id
    )
    await billing.choose_plan(
        db_session, org_id=org.id, plan_code="monthly", requested_by_user_id=admin.id
    )
    assert calls == 1  # second choose was a no-op


async def test_choose_plan_rejects_invalid_code(db_session: AsyncSession) -> None:
    org, admin = await _seed_org_with_trial(db_session)
    with pytest.raises(billing.BillingError):
        await billing.choose_plan(
            db_session,
            org_id=org.id,
            plan_code="enterprise",
            requested_by_user_id=admin.id,
        )


async def test_activate_subscription_sets_period(db_session: AsyncSession) -> None:
    org, admin = await _seed_org_with_trial(db_session)
    sub = await billing.activate_subscription(
        db_session,
        org_id=org.id,
        plan_code="monthly",
        by_admin_id=admin.id,
    )
    assert sub.status == "active"
    assert sub.current_period_starts_at is not None
    assert sub.current_period_ends_at is not None
    delta = sub.current_period_ends_at - sub.current_period_starts_at
    # 30-day months — close to 30 days.
    assert 29 * 86400 < delta.total_seconds() < 31 * 86400


async def test_activate_enterprise_requires_override(db_session: AsyncSession) -> None:
    org, admin = await _seed_org_with_trial(db_session)
    with pytest.raises(billing.BillingError):
        await billing.activate_subscription(
            db_session,
            org_id=org.id,
            plan_code="enterprise",
            by_admin_id=admin.id,
            period_months=12,
        )


async def test_set_comp_clears_override_and_marks_active(
    db_session: AsyncSession,
) -> None:
    org, admin = await _seed_org_with_trial(db_session)
    sub = await billing.set_comp(
        db_session,
        org_id=org.id,
        reason="podcast partnership",
        by_admin_id=admin.id,
    )
    assert sub.is_comp is True
    assert sub.status == "active"
    assert sub.override_price_per_user_minor is None
    comp_plan_id = (
        await db_session.execute(select(Plan.id).where(Plan.code == "comp"))
    ).scalar_one()
    assert sub.plan_id == comp_plan_id


async def test_set_comp_requires_reason(db_session: AsyncSession) -> None:
    org, admin = await _seed_org_with_trial(db_session)
    with pytest.raises(billing.BillingError):
        await billing.set_comp(db_session, org_id=org.id, reason="   ", by_admin_id=admin.id)


async def test_set_enterprise_applies_override(db_session: AsyncSession) -> None:
    org, admin = await _seed_org_with_trial(db_session)
    sub = await billing.set_enterprise(
        db_session,
        org_id=org.id,
        override_price_per_user_minor=49900,
        period_months=12,
        by_admin_id=admin.id,
        notes="negotiated with CFO",
    )
    assert sub.status == "active"
    assert sub.override_price_per_user_minor == 49900
    assert sub.is_comp is False
    assert billing.get_effective_price_per_user_minor(sub) == 49900


async def test_cancel_marks_canceled_and_audits(db_session: AsyncSession) -> None:
    org, admin = await _seed_org_with_trial(db_session)
    sub = await billing.cancel(db_session, org_id=org.id, by_admin_id=admin.id)
    assert sub.status == "canceled"
    assert sub.canceled_at is not None
    activities = (
        (
            await db_session.execute(
                select(Activity)
                .where(Activity.organization_id == org.id)
                .where(Activity.activity_type == ActivityType.subscription_change)
            )
        )
        .scalars()
        .all()
    )
    assert any(a.payload.get("action") == "cancel" for a in activities)


async def test_extend_trial_pushes_dates(db_session: AsyncSession) -> None:
    org, admin = await _seed_org_with_trial(db_session)
    before_trial_ends = org.trial_ends_at
    before_period_ends = (
        await billing.get_current_subscription(db_session, org.id)
    ).current_period_ends_at
    assert before_period_ends is not None

    sub = await billing.extend_trial(db_session, org_id=org.id, days=14, by_admin_id=admin.id)
    assert sub.status == "trialing"
    assert sub.current_period_ends_at == before_period_ends + timedelta(days=14)
    await db_session.refresh(org)
    assert org.trial_ends_at == before_trial_ends + timedelta(days=14)


async def test_extend_trial_rejects_non_trialing(db_session: AsyncSession) -> None:
    org, admin = await _seed_org_with_trial(db_session)
    await billing.cancel(db_session, org_id=org.id, by_admin_id=admin.id)
    with pytest.raises(billing.BillingError):
        await billing.extend_trial(db_session, org_id=org.id, days=7, by_admin_id=admin.id)
