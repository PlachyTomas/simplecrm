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
    User,
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


async def get_current_subscription(session: AsyncSession, org_id: uuid.UUID) -> Subscription:
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
        return VatBreakdown(base_minor=base_minor, with_vat_minor=base_minor, vat_amount_minor=0)
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
        # past_due with NULL ends → no anchor for the grace window, treat
        # as immediately expired. Closes the latent finding-6 issue from
        # qa-artifacts/2026-05-03-adversary-testing-report.md (a past_due
        # row missing ends_at would otherwise grant access forever).
        if ends is None:
            return False
        return moment - ends < PAST_DUE_GRACE
    return False


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _load_plan_by_code(session: AsyncSession, code: str) -> Plan:
    plan = (await session.execute(select(Plan).where(Plan.code == code))).scalar_one_or_none()
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


async def _apply_queued_downsize(session: AsyncSession, sub: Subscription) -> list[str]:
    """Flip queued users to is_active=False, drop seat_count to
    pending_seat_count, clear pending_* fields. Returns the IDs that
    actually got deactivated (skips users that were already inactive
    or got deleted between queueing and apply).

    Reused by `activate_subscription` (super-admin manual flow for
    comp/enterprise) and `apply_renewal_success` (ComGate-driven
    period rollover). The two callers must run identical logic so a
    queued downsize lands the same way regardless of how the period
    advanced.
    """
    queued_ids = sub.pending_user_deactivations or []
    deactivated_ids: list[str] = []
    if queued_ids:
        # JSONB stores them as strings; re-parse to UUIDs for the query.
        parsed_ids = [uuid.UUID(str(i)) for i in queued_ids]
        victims = (
            (
                await session.execute(
                    select(User)
                    .where(User.organization_id == sub.organization_id)
                    .where(User.id.in_(parsed_ids))
                    .where(User.is_active.is_(True))
                )
            )
            .scalars()
            .all()
        )
        for victim in victims:
            victim.is_active = False
            deactivated_ids.append(str(victim.id))
    if sub.pending_seat_count is not None:
        sub.seat_count = sub.pending_seat_count
        # Contracted seat count tracks the downsize too — the customer's
        # paid baseline drops to the new level at the period boundary.
        sub.contracted_seat_count = sub.pending_seat_count
    sub.pending_seat_count = None
    sub.pending_user_deactivations = None
    return deactivated_ids


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

    if sub.status == "pending_activation" and sub.plan_id == plan.id:
        return sub  # idempotent — same intent, same plan

    sub.plan_id = plan.id
    sub.plan = plan
    sub.plan = plan
    sub.status = "pending_activation"
    await session.flush()

    org = await session.get(Organization, org_id)
    if org is None:
        raise BillingError(f"organization {org_id} not found")
    email = build_subscription_pending_email(org_name=org.name, plan_display=plan.display_name_cs)
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
        raise BillingError("enterprise activation requires override_price_per_user_minor")

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

    deactivated_ids = await _apply_queued_downsize(session, sub)
    # Note: pending_plan_id is intentionally left untouched here. The admin
    # passes plan_code explicitly to this endpoint; the queued plan is the
    # admin's hint of intent, not a hard contract — the activating party
    # still chooses what they're committing to. A future scheduled rollover
    # job will read pending_plan_id directly.

    await _audit(
        session,
        organization_id=org_id,
        user_id=by_admin_id,
        action="activate",
        payload={
            "plan_code": plan_code,
            "override_price_minor": override_price_minor,
            "period_months": months,
            "deactivated_user_ids": deactivated_ids,
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


# ---------------------------------------------------------------------------
# ComGate-driven mutations
# ---------------------------------------------------------------------------
#
# These are the funnels invoked from the ComGate webhook handler in
# `api/v1/payments`. They land in three flavors mirroring the Charge
# `kind` values:
#
#   - `apply_initial_payment_success` for the customer's first paid
#     activation (status: pending_payment_method | trialing → active)
#   - `apply_seat_charge_success` for a mid-period seat upgrade
#   - `apply_renewal_success` for a scheduled period rollover
#
# `mark_charge_failed` covers all three failure paths.
#
# Each function takes the comgate_trans_id so the audit trail can point
# back at the merchant-portal record. The Charge row is written by the
# webhook handler before calling these (so a DB-fail mid-apply leaves a
# breadcrumb for the recovery job).


# Number of consecutive failed renewal attempts before access is denied.
DUNNING_PAST_DUE_THRESHOLD = 3


def compute_seat_proration(
    sub: Subscription,
    *,
    new_seat_count: int,
    now: datetime | None = None,
) -> int:
    """Minor-unit charge for raising the contracted cap mid-period.

    Formula:
        delta = max(0, new_seat_count - contracted_seat_count)
        period_days = current_period_ends_at - current_period_starts_at
        days_remaining = current_period_ends_at - now
        fraction = clamp(days_remaining / period_days, 0, 1)
        charge = round(delta × effective_price_per_user × fraction)

    Returns 0 when:
      - status isn't 'active' (trial bumps are free; renewal-time bumps
        are full-priced through the renewal path)
      - new_seat_count <= contracted_seat_count (no upgrade)
      - is_comp (comp orgs never get charged)
      - period dates aren't set (defensive — shouldn't happen for active)

    The caller is responsible for calling this BEFORE issuing the
    ComGate charge so the customer sees the amount in the confirmation
    UI; the same number is then passed to `comgate.create_recurring_payment`.
    """
    if sub.is_comp or sub.status != "active":
        return 0
    delta = new_seat_count - sub.contracted_seat_count
    if delta <= 0:
        return 0

    effective = get_effective_price_per_user_minor(sub)
    if effective is None or effective <= 0:
        return 0

    starts = sub.current_period_starts_at
    ends = sub.current_period_ends_at
    if starts is None or ends is None:
        return 0

    moment = now or datetime.now(tz=UTC)
    period_seconds = (ends - starts).total_seconds()
    if period_seconds <= 0:
        return 0
    remaining_seconds = (ends - moment).total_seconds()
    if remaining_seconds <= 0:
        return 0
    fraction = min(1.0, remaining_seconds / period_seconds)

    return round(delta * effective * fraction)


async def apply_initial_payment_success(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    plan_code: str,
    comgate_trans_id: str,
) -> Subscription:
    """Webhook landed for the customer's first paid activation.

    Promotes status to 'active', anchors the period at now, syncs
    contracted_seat_count to whatever the customer was sitting at
    when they paid (their trial-time seat-slider play is now their
    paid baseline). The Charge row is updated by the webhook caller.
    """
    if plan_code not in {"monthly", "annual"}:
        raise BillingError(f"plan_code must be 'monthly' or 'annual', got {plan_code!r}")
    sub = await get_current_subscription(session, org_id)
    # Idempotency (review R2 P1): if a prior initial webhook already activated
    # this subscription, a second in-flight webhook must not re-anchor the
    # period (which would silently grant an extra billing period). The Charge
    # row is still marked paid by the caller; only the state transition is
    # skipped.
    if sub.status == "active":
        return sub
    plan = await _load_plan_by_code(session, plan_code)
    months = _PLAN_PERIOD_MONTHS[plan_code]
    assert months is not None  # noqa: S101 — type-narrowing for mypy after the {monthly,annual} guard

    now = datetime.now(tz=UTC)
    sub.plan_id = plan.id
    sub.plan = plan
    sub.status = "active"
    sub.is_comp = False
    sub.canceled_at = None
    sub.current_period_starts_at = now
    sub.current_period_ends_at = _add_months(now, months)
    sub.next_renewal_charge_at = sub.current_period_ends_at
    sub.contracted_seat_count = sub.seat_count
    sub.dunning_attempts = 0
    sub.last_charge_failed_at = None

    await _audit(
        session,
        organization_id=org_id,
        user_id=None,
        action="initial_payment_success",
        payload={
            "plan_code": plan_code,
            "comgate_trans_id": comgate_trans_id,
            "seat_count": sub.seat_count,
        },
    )
    return sub


async def apply_seat_charge_success(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    new_seat_count: int,
    charge_amount_minor: int,
    comgate_trans_id: str,
) -> Subscription:
    """Webhook landed for a mid-period seat upgrade.

    Lifts both `seat_count` (live cap) and `contracted_seat_count`
    (paid baseline) to `new_seat_count`. Period dates are unchanged —
    next renewal will charge the new headcount for a full period.
    """
    sub = await get_current_subscription(session, org_id)
    if new_seat_count < sub.contracted_seat_count:
        raise BillingError(
            f"seat upgrade target {new_seat_count} below contracted {sub.contracted_seat_count}"
        )
    sub.seat_count = new_seat_count
    sub.contracted_seat_count = new_seat_count
    # Any queued downsize is invalidated by an upgrade — the admin
    # changed their mind. Match update_seat_count's semantics.
    sub.pending_seat_count = None
    sub.pending_user_deactivations = None

    await _audit(
        session,
        organization_id=org_id,
        user_id=None,
        action="seat_charge_success",
        payload={
            "new_seat_count": new_seat_count,
            "charge_amount_minor": charge_amount_minor,
            "comgate_trans_id": comgate_trans_id,
        },
    )
    return sub


async def apply_renewal_success(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    comgate_trans_id: str,
) -> Subscription:
    """Webhook landed for a scheduled recurring renewal charge.

    Rolls the period dates forward by one billing-interval, applies any
    queued downsize, and resets dunning state. The plan length is taken
    from the current `Subscription.plan` (monthly = 30 days, annual =
    360 days via `_PLAN_PERIOD_MONTHS`). If the customer queued a
    monthly ↔ annual swap via `pending_plan_id`, it's applied here.
    """
    sub = await get_current_subscription(session, org_id)

    # Apply pending plan swap (monthly ↔ annual) before computing the
    # new period length, so the rollover honors the customer's chosen
    # interval.
    if sub.pending_plan_id is not None:
        new_plan = await session.get(Plan, sub.pending_plan_id)
        if new_plan is not None:
            sub.plan_id = new_plan.id
            sub.plan = new_plan
            sub.pending_plan_id = None

    months = _PLAN_PERIOD_MONTHS.get(sub.plan.code)
    if months is None:
        raise BillingError(f"plan {sub.plan.code!r} is not eligible for recurring renewal")

    now = datetime.now(tz=UTC)
    sub.status = "active"
    sub.canceled_at = None
    sub.current_period_starts_at = now
    sub.current_period_ends_at = _add_months(now, months)
    sub.next_renewal_charge_at = sub.current_period_ends_at
    sub.dunning_attempts = 0
    sub.last_charge_failed_at = None

    deactivated_ids = await _apply_queued_downsize(session, sub)

    await _audit(
        session,
        organization_id=org_id,
        user_id=None,
        action="renewal_success",
        payload={
            "comgate_trans_id": comgate_trans_id,
            "plan_code": sub.plan.code,
            "deactivated_user_ids": deactivated_ids,
            "seat_count_after": sub.seat_count,
        },
    )
    return sub


async def apply_manual_payment_success(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    invoice_number: str,
    paid_at: datetime,
) -> Subscription | None:
    """Sibling of `apply_renewal_success`/`apply_initial_payment_success`
    for the bank-transfer flow.

    Called from `InvoiceService.mark_paid` when an admin manually flags an
    invoice paid. Extends the subscription's period so the customer's
    pay-gate stays open. Returns the updated Subscription, or None if no
    extension was applied (caller can audit the no-op).

    Decisions:
      - `is_comp=True`: skip — comp orgs don't run on a paid clock.
      - `status='canceled'`: skip — reactivation is a separate admin
        action (`activate_subscription`); a stray invoice payment must
        not silently undo a hard cancel.
      - `status in {'trialing','active','past_due','pending_activation'}`:
        extend.
      - Anchor the new period at `max(now, current_period_ends_at)` —
        if the founder issued + paid a renewal invoice mid-period, the
        unused tail rolls forward instead of being silently discarded.
        (Differs from `apply_renewal_success` which anchors at `now`,
        because the Comgate path only fires *after* the period has
        elapsed; the manual path can fire any time.)
      - Plan length comes from `_PLAN_PERIOD_MONTHS[plan.code]`. If the
        plan is `enterprise`/`comp`/`trial` the function bails (those
        don't have a fixed renewal interval).
    """
    sub = await get_current_subscription(session, org_id)
    if sub.is_comp:
        return None
    if sub.status == "canceled":
        return None

    months = _PLAN_PERIOD_MONTHS.get(sub.plan.code)
    if months is None:
        return None

    now = datetime.now(tz=UTC)
    anchor = now
    if sub.current_period_ends_at is not None and sub.current_period_ends_at > now:
        anchor = sub.current_period_ends_at

    sub.status = "active"
    sub.canceled_at = None
    sub.current_period_starts_at = now
    sub.current_period_ends_at = _add_months(anchor, months)
    sub.next_renewal_charge_at = sub.current_period_ends_at
    sub.dunning_attempts = 0
    sub.last_charge_failed_at = None

    deactivated_ids = await _apply_queued_downsize(session, sub)

    await _audit(
        session,
        organization_id=org_id,
        user_id=None,
        action="manual_payment_success",
        payload={
            "invoice_number": invoice_number,
            "paid_at": paid_at.isoformat(),
            "plan_code": sub.plan.code,
            "period_ends_at": sub.current_period_ends_at.isoformat(),
            "deactivated_user_ids": deactivated_ids,
        },
    )
    return sub


async def mark_charge_failed(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    kind: str,
    failure_reason: str | None = None,
) -> Subscription:
    """Webhook reported a payment failure. Updates dunning counters.

    For `renewal` failures we increment `dunning_attempts` and, once
    over `DUNNING_PAST_DUE_THRESHOLD`, flip the subscription to
    'past_due' so the existing 7-day grace window in
    `is_app_access_allowed` kicks in.

    For `initial` failures we leave the status alone (still
    pending_payment_method or trialing) — the customer can retry from
    the in-app billing page.

    For `seat_upgrade` failures we similarly leave billing state alone;
    the seat increase request from the customer simply doesn't get
    applied. The caller (webhook handler) surfaces the error to the
    customer via the return-URL flow.
    """
    sub = await get_current_subscription(session, org_id)
    now = datetime.now(tz=UTC)
    sub.last_charge_failed_at = now

    if kind == "renewal":
        sub.dunning_attempts += 1
        if sub.dunning_attempts >= DUNNING_PAST_DUE_THRESHOLD:
            sub.status = "past_due"
            # Anchor past_due grace at when the period actually ended,
            # not at the failed-attempt time, so the 7-day grace honors
            # the customer's contracted period.
        # Schedule next retry on a back-off curve: 1d, 2d, 4d ...
        backoff_days = 2 ** max(0, sub.dunning_attempts - 1)
        sub.next_renewal_charge_at = now + timedelta(days=backoff_days)

    await _audit(
        session,
        organization_id=org_id,
        user_id=None,
        action="charge_failed",
        payload={
            "kind": kind,
            "dunning_attempts": sub.dunning_attempts,
            "status_after": sub.status,
            "failure_reason": failure_reason,
        },
    )
    return sub


async def cancel_self_serve(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    by_admin_id: uuid.UUID,
    reason: str | None = None,
) -> Subscription:
    """Org admin cancels their own subscription via Settings.

    Distinct from the super-admin `cancel`: comp + enterprise orgs
    cannot self-cancel (the super-admin route still exists for those).
    The customer keeps app access through `current_period_ends_at` —
    this just stops future scheduled charges.

    Implementation: status stays 'active' (so the existing pay-gate
    keeps letting the customer in through their paid period). We mark
    the cancel intent via `canceled_at` and clear
    `next_renewal_charge_at` so the recurring-charge job skips this
    org. The eventual period-rollover job sees a non-null `canceled_at`
    + `next_renewal_charge_at IS NULL` and flips status to 'canceled'.
    Distinct from the super-admin `cancel` route, which sets status
    'canceled' immediately for hard revokes (fraud / payment chargeback).
    """
    sub = await get_current_subscription(session, org_id)
    if sub.is_comp:
        raise BillingError("comp subscriptions cannot be self-canceled")
    if sub.plan.code == "enterprise":
        raise BillingError(
            "enterprise subscriptions are managed by the founder; contact podpora@simplecrm.cz"
        )
    sub.canceled_at = datetime.now(tz=UTC)
    sub.next_renewal_charge_at = None  # don't ever try to renew

    await _audit(
        session,
        organization_id=org_id,
        user_id=by_admin_id,
        action="cancel_self_serve",
        payload={
            "reason": reason,
            "ends_at": (
                sub.current_period_ends_at.isoformat() if sub.current_period_ends_at else None
            ),
        },
    )
    return sub


async def reactivate_self_serve(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    by_admin_id: uuid.UUID,
) -> Subscription:
    """Un-cancel before service actually stops.

    Only valid while `canceled_at IS NOT NULL` (meaning the customer
    self-serve cancelled but the period hasn't actually ended yet —
    status is still 'active'). Clears `canceled_at` and re-arms the
    renewal charge. Once the period has expired and the period-rollover
    job has flipped status to 'canceled', the customer must re-enter
    card details (a fresh initial-payment flow); reactivation isn't
    available there.
    """
    sub = await get_current_subscription(session, org_id)
    if sub.canceled_at is None:
        raise BillingError(
            "reactivate is only valid for a self-cancelled subscription (canceled_at must be set)"
        )
    now = datetime.now(tz=UTC)
    if sub.current_period_ends_at is None or sub.current_period_ends_at <= now:
        raise BillingError("subscription period has already ended; choose a plan again")

    sub.canceled_at = None
    sub.next_renewal_charge_at = sub.current_period_ends_at

    await _audit(
        session,
        organization_id=org_id,
        user_id=by_admin_id,
        action="reactivate_self_serve",
        payload={
            "ends_at": sub.current_period_ends_at.isoformat(),
        },
    )
    return sub
