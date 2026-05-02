"""Subscription lifecycle. The single funnel for every billing-related write.

Every mutating method in this module:
- Loads the org's `Subscription` (each org has exactly one row, enforced
  by the unique index on `subscriptions.organization_id`).
- Mutates it.
- Writes one `Activity` record (`entity_type='organization'`,
  `activity_type='subscription_change'`) so the super-admin UI can show
  a per-org billing timeline without us inventing a second audit table.

The methods are deliberately decoupled from FastAPI: they take an
`AsyncSession` so the same logic backs the org-admin endpoints, the
super-admin endpoints, and the eventual scheduled-job that flips
`active → past_due` on missed renewals. The caller commits.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import (
    Activity,
    ActivityEntityType,
    ActivityType,
    BillingSettings,
    Organization,
    Plan,
    Subscription,
)
from app.services.email import build_subscription_pending_email, send_email

# Default period lengths by plan. Custom plans (`enterprise`) require an
# explicit period_months at the call site.
_PLAN_PERIOD_MONTHS: dict[str, int | None] = {
    "monthly": 1,
    "annual": 12,
    "enterprise": None,
    "comp": None,
    "trial": None,
}

# Subscription status grace window for past_due before access is denied.
PAST_DUE_GRACE = timedelta(days=7)


class BillingError(ValueError):
    """Raised on validation failures inside BillingService."""


@dataclass(frozen=True)
class SavingsBreakdown:
    monthly_total_minor: int
    annual_total_minor: int
    savings_minor: int
    savings_percent: float


@dataclass(frozen=True)
class VatBreakdown:
    base_minor: int
    with_vat_minor: int
    vat_amount_minor: int


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


async def get_current_subscription(
    session: AsyncSession, org_id: uuid.UUID
) -> Subscription:
    """Return the unique Subscription row for `org_id` (eagerly joins Plan
    and pending_plan — both are read by the SubscriptionOut serializer)."""
    sub = (
        await session.execute(
            select(Subscription)
            .options(
                selectinload(Subscription.plan),
                selectinload(Subscription.pending_plan),
            )
            .where(Subscription.organization_id == org_id)
        )
    ).scalar_one_or_none()
    if sub is None:
        raise BillingError(f"organization {org_id} has no subscription")
    return sub


def get_effective_price_per_user_minor(sub: Subscription) -> int | None:
    """Override beats plan price. Caller must have loaded `sub.plan`."""
    if sub.override_price_per_user_minor is not None:
        return sub.override_price_per_user_minor
    return sub.plan.price_per_user_minor


def compute_savings(user_count: int) -> SavingsBreakdown:
    """Annual-vs-monthly savings for `user_count` seats.

    Hardcodes the public price ladder (99 Kč / 999 Kč). Anyone on a
    negotiated price computes savings off their override at the call site.
    """
    if user_count < 0:
        raise BillingError("user_count must be non-negative")
    monthly_per_user = 9900  # minor units
    annual_per_user = 99900
    monthly_total = monthly_per_user * 12 * user_count
    annual_total = annual_per_user * user_count
    savings = monthly_total - annual_total
    percent = round((savings / monthly_total) * 100.0, 1) if monthly_total else 0.0
    return SavingsBreakdown(
        monthly_total_minor=monthly_total,
        annual_total_minor=annual_total,
        savings_minor=savings,
        savings_percent=percent,
    )


async def compute_with_vat(session: AsyncSession, base_minor: int) -> VatBreakdown:
    """Apply DPH if the seller is currently a plátce."""
    settings = (await session.execute(select(BillingSettings))).scalar_one()
    if not settings.is_vat_payer:
        return VatBreakdown(
            base_minor=base_minor, with_vat_minor=base_minor, vat_amount_minor=0
        )
    multiplier = Decimal(1) + (settings.vat_rate_percent / Decimal(100))
    with_vat = int((Decimal(base_minor) * multiplier).to_integral_value())
    return VatBreakdown(
        base_minor=base_minor,
        with_vat_minor=with_vat,
        vat_amount_minor=with_vat - base_minor,
    )


# ---------------------------------------------------------------------------
# Pay-gate predicate
# ---------------------------------------------------------------------------


def is_app_access_allowed(sub: Subscription, now: datetime | None = None) -> bool:
    """The single source of truth for "should the pay-gate fire?".

    Comp orgs are always in. Trialing/active orgs are in while their
    period is open. Past-due orgs get a 7-day grace before being
    locked out.
    """
    if sub.is_comp:
        return True
    moment = now or datetime.now(tz=UTC)
    if sub.status in {"trialing", "active"}:
        ends = sub.current_period_ends_at
        return ends is None or ends >= moment
    if sub.status == "past_due":
        ends = sub.current_period_ends_at
        if ends is None:
            return True
        return moment - ends < PAST_DUE_GRACE
    return False


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _load_plan_by_code(session: AsyncSession, code: str) -> Plan:
    plan = (
        await session.execute(select(Plan).where(Plan.code == code))
    ).scalar_one_or_none()
    if plan is None:
        raise BillingError(f"unknown plan code: {code}")
    return plan


async def _audit(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID | None,
    action: str,
    payload: dict[str, Any],
) -> None:
    """Insert one billing-audit Activity row and flush so callers can read it
    back in the same transaction (the org-detail endpoint joins Activity for
    the timeline; tests assert it directly).
    """
    activity = Activity(
        organization_id=organization_id,
        entity_type=ActivityEntityType.organization,
        entity_id=organization_id,
        user_id=user_id,
        activity_type=ActivityType.subscription_change,
        payload={"action": action, **payload},
    )
    session.add(activity)
    await session.flush()


def _add_months(start: datetime, months: int) -> datetime:
    """Approximate calendar-month addition (30-day months).

    Real billing systems would use a proper calendar walk, but for a
    bank-transfer-only flow with manual activation the founder picks
    the renewal date by hand if it matters. 30-day months keep the
    math honest enough for sub-period mid-cycle changes.
    """
    return start + timedelta(days=30 * months)


# ---------------------------------------------------------------------------
# Mutations
# ---------------------------------------------------------------------------


async def choose_plan(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    plan_code: str,
    requested_by_user_id: uuid.UUID,
) -> Subscription:
    """Customer (org admin) picks a plan from the pay-gate.

    Records intent only — does NOT mark active. The founder activates
    manually once payment lands. Idempotent: re-running with the same
    plan_code on an already-pending subscription returns it unchanged
    and does not re-send the email.
    """
    if plan_code not in {"monthly", "annual"}:
        raise BillingError(f"plan_code must be 'monthly' or 'annual', got {plan_code!r}")

    sub = await get_current_subscription(session, org_id)
    plan = await _load_plan_by_code(session, plan_code)

    if (
        sub.status == "pending_activation"
        and sub.plan_id == plan.id
    ):
        return sub  # idempotent — same intent, same plan

    sub.plan_id = plan.id
    sub.plan = plan
    sub.plan = plan
    sub.status = "pending_activation"
    await session.flush()

    org = await session.get(Organization, org_id)
    if org is None:
        raise BillingError(f"organization {org_id} not found")
    email = build_subscription_pending_email(
        org_name=org.name, plan_display=plan.display_name_cs
    )
    await send_email(email)

    await _audit(
        session,
        organization_id=org_id,
        user_id=requested_by_user_id,
        action="choose",
        payload={"plan_code": plan_code, "status_after": sub.status},
    )
    return sub


async def activate_subscription(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    plan_code: str,
    by_admin_id: uuid.UUID,
    override_price_minor: int | None = None,
    period_months: int | None = None,
) -> Subscription:
    """Super-admin marks a pending subscription as active (payment received)."""
    sub = await get_current_subscription(session, org_id)
    plan = await _load_plan_by_code(session, plan_code)

    if plan_code == "enterprise" and override_price_minor is None:
        raise BillingError(
            "enterprise activation requires override_price_per_user_minor"
        )

    months = period_months or _PLAN_PERIOD_MONTHS.get(plan_code)
    if months is None and plan_code in {"monthly", "annual", "enterprise"}:
        raise BillingError(f"period_months required for plan_code={plan_code}")

    now = datetime.now(tz=UTC)
    sub.plan_id = plan.id
    sub.plan = plan
    sub.status = "active"
    sub.is_comp = False
    sub.override_price_per_user_minor = override_price_minor
    sub.canceled_at = None
    sub.current_period_starts_at = now
    sub.current_period_ends_at = _add_months(now, months) if months else None

    await _audit(
        session,
        organization_id=org_id,
        user_id=by_admin_id,
        action="activate",
        payload={
            "plan_code": plan_code,
            "override_price_minor": override_price_minor,
            "period_months": months,
        },
    )
    return sub


async def set_comp(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    reason: str,
    by_admin_id: uuid.UUID,
    ends_at: datetime | None = None,
) -> Subscription:
    if not reason.strip():
        raise BillingError("comp_reason must not be empty")

    sub = await get_current_subscription(session, org_id)
    plan = await _load_plan_by_code(session, "comp")

    sub.plan_id = plan.id
    sub.plan = plan
    sub.status = "active"
    sub.is_comp = True
    sub.comp_reason = reason.strip()
    sub.override_price_per_user_minor = None
    sub.canceled_at = None
    sub.current_period_starts_at = datetime.now(tz=UTC)
    sub.current_period_ends_at = ends_at

    await _audit(
        session,
        organization_id=org_id,
        user_id=by_admin_id,
        action="set_comp",
        payload={"reason": sub.comp_reason, "ends_at": ends_at.isoformat() if ends_at else None},
    )
    return sub


async def set_enterprise(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    override_price_per_user_minor: int,
    period_months: int,
    by_admin_id: uuid.UUID,
    notes: str | None = None,
) -> Subscription:
    if override_price_per_user_minor < 0:
        raise BillingError("override_price_per_user_minor must be non-negative")
    if period_months <= 0:
        raise BillingError("period_months must be positive")

    sub = await get_current_subscription(session, org_id)
    plan = await _load_plan_by_code(session, "enterprise")

    now = datetime.now(tz=UTC)
    sub.plan_id = plan.id
    sub.plan = plan
    sub.status = "active"
    sub.is_comp = False
    sub.comp_reason = None
    sub.override_price_per_user_minor = override_price_per_user_minor
    sub.canceled_at = None
    sub.current_period_starts_at = now
    sub.current_period_ends_at = _add_months(now, period_months)
    if notes is not None:
        sub.notes = notes

    await _audit(
        session,
        organization_id=org_id,
        user_id=by_admin_id,
        action="set_enterprise",
        payload={
            "override_price_minor": override_price_per_user_minor,
            "period_months": period_months,
        },
    )
    return sub


async def cancel(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    by_admin_id: uuid.UUID,
    effective_at: datetime | None = None,
) -> Subscription:
    sub = await get_current_subscription(session, org_id)
    sub.status = "canceled"
    sub.canceled_at = effective_at or datetime.now(tz=UTC)

    await _audit(
        session,
        organization_id=org_id,
        user_id=by_admin_id,
        action="cancel",
        payload={"effective_at": sub.canceled_at.isoformat()},
    )
    return sub


async def extend_trial(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    days: int,
    by_admin_id: uuid.UUID,
) -> Subscription:
    if days <= 0:
        raise BillingError("days must be positive")

    sub = await get_current_subscription(session, org_id)
    if sub.status != "trialing":
        raise BillingError(
            f"extend_trial only valid for trialing subscriptions; status={sub.status}"
        )

    org = await session.get(Organization, org_id)
    if org is None:
        raise BillingError(f"organization {org_id} not found")
    delta = timedelta(days=days)
    org.trial_ends_at = org.trial_ends_at + delta
    if sub.current_period_ends_at is not None:
        sub.current_period_ends_at = sub.current_period_ends_at + delta
    else:
        sub.current_period_ends_at = org.trial_ends_at

    await _audit(
        session,
        organization_id=org_id,
        user_id=by_admin_id,
        action="extend_trial",
        payload={"days": days, "trial_ends_at": org.trial_ends_at.isoformat()},
    )
    return sub
