"""Subscription read + choose-plan endpoints.

Mounted under `require_org_membership` only — intentionally **not**
under the trial-gate, because:
  - Read endpoints power the in-app billing settings page and the
    pay-gate's own copy ("trial expired, ends_at = …").
  - choose-plan is the route the user takes to escape the gate; it
    must work *while* gated.
  - contact-enterprise serves the same purpose for enterprise leads.

The corresponding mutating org endpoints (e.g. `PUT /organizations/current`)
stay inside the trial gate via the `organizations` router.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db import get_db
from app.db.models import (
    BillingSettings,
    PaymentMethod,
    Subscription,
    User,
    UserRole,
)
from app.schemas.billing import (
    BillingSummary,
    CancelSelfServeIn,
    ChangeIntervalIn,
    ChoosePlanIn,
    ContactEnterpriseIn,
    SubscriptionOut,
    UpdateSeatCountIn,
)
from app.services import billing
from app.services.comgate import ComGateClient, get_comgate_client
from app.services.email import Email, send_email

router = APIRouter(prefix="/organizations", tags=["subscription"])


def _access_status(sub: Subscription) -> str:
    """Render `Subscription` → frontend access label."""
    if sub.is_comp:
        return "comp"
    if not billing.is_app_access_allowed(sub):
        return "gated"
    if sub.status == "past_due":
        return "grace"
    # A customer who picked a plan but hasn't paid is still in their trial —
    # keep the trialing UX (countdown, nudges) rather than showing "active"
    # (review R2 P2).
    if sub.status in {"trialing", "pending_activation"}:
        return "trialing"
    return "active"


def _subscription_payload(sub: Subscription) -> SubscriptionOut:
    return SubscriptionOut.model_validate(
        {
            "id": sub.id,
            "organization_id": sub.organization_id,
            "plan": sub.plan,
            "status": sub.status,
            "started_at": sub.started_at,
            "current_period_starts_at": sub.current_period_starts_at,
            "current_period_ends_at": sub.current_period_ends_at,
            "canceled_at": sub.canceled_at,
            "override_price_per_user_minor": sub.override_price_per_user_minor,
            "is_comp": sub.is_comp,
            "comp_reason": sub.comp_reason,
            "notes": sub.notes,
            "seat_count": sub.seat_count,
            "contracted_seat_count": sub.contracted_seat_count,
            "pending_plan": sub.pending_plan,
            "pending_seat_count": sub.pending_seat_count,
            "pending_user_deactivations": sub.pending_user_deactivations,
            "effective_price_per_user_minor": billing.get_effective_price_per_user_minor(sub),
            "access_status": _access_status(sub),
        }
    )


@router.get("/current/subscription", response_model=SubscriptionOut)
async def get_current_subscription(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SubscriptionOut:
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    sub = await billing.get_current_subscription(session, user.organization_id)
    return _subscription_payload(sub)


@router.get("/current/billing-summary", response_model=BillingSummary)
async def get_current_billing_summary(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> BillingSummary:
    """Numbers the in-app pricing/settings surface needs in one round-trip."""
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    org_id = user.organization_id
    sub = await billing.get_current_subscription(session, org_id)
    user_count = (
        await session.execute(
            select(func.count(User.id))
            .where(User.organization_id == org_id)
            .where(User.is_active.is_(True))
        )
    ).scalar_one()

    effective = billing.get_effective_price_per_user_minor(sub)

    monthly_total: int | None = None
    annual_total: int | None = None
    savings_minor: int | None = None
    savings_percent: float | None = None
    monthly_with_vat: int | None = None
    annual_with_vat: int | None = None

    if effective is not None:
        monthly_total = effective * user_count
        monthly_with_vat = (await billing.compute_with_vat(session, monthly_total)).with_vat_minor

        public_savings = billing.compute_savings(user_count)
        annual_total = public_savings.annual_total_minor
        annual_with_vat = (await billing.compute_with_vat(session, annual_total)).with_vat_minor
        savings_minor = public_savings.savings_minor
        savings_percent = public_savings.savings_percent

    settings = (await session.execute(select(BillingSettings))).scalar_one()

    return BillingSummary(
        organization_id=sub.organization_id,
        user_count=user_count,
        effective_price_per_user_minor=effective,
        monthly_total_minor=monthly_total,
        monthly_total_with_vat_minor=monthly_with_vat,
        annual_total_minor=annual_total,
        annual_total_with_vat_minor=annual_with_vat,
        savings_minor=savings_minor,
        savings_percent=savings_percent,
        is_vat_payer=settings.is_vat_payer,
        vat_rate_percent=settings.vat_rate_percent,
    )


@router.post(
    "/current/subscription/choose-plan",
    response_model=SubscriptionOut,
)
async def choose_plan(
    payload: ChoosePlanIn,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> SubscriptionOut:
    """Customer (org admin) chooses a plan from the pay-gate.

    .. deprecated::
        Prefer ``POST /api/v1/payments/initial-payment-init`` — that
        endpoint creates a Charge + ComGate hosted-payment URL and
        returns ``{redirect_url}``. This endpoint is kept for backwards
        compatibility while the frontend migrates; new code should not
        call it. Sets ``status='pending_activation'`` and emails the
        founder, which is no longer how billing actually advances.
    """
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    try:
        await billing.choose_plan(
            session,
            org_id=user.organization_id,
            plan_code=payload.plan_code,
            requested_by_user_id=user.id,
        )
    except billing.BillingError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    await session.commit()
    sub = await billing.get_current_subscription(session, user.organization_id)
    return _subscription_payload(sub)


@router.post("/current/subscription/contact-enterprise", status_code=202)
async def contact_enterprise(
    payload: ContactEnterpriseIn,
    user: User = Depends(require_role(UserRole.admin)),
) -> dict[str, str]:
    """Send an internal email to the founder requesting an enterprise quote."""
    body = (
        f"Enterprise inquiry from {user.email}\n"
        f"Expected users: {payload.expected_users}\n\n"
        f"Message:\n{payload.message}\n"
    )
    await send_email(
        Email(
            to="podpora@simplecrm.cz",
            subject=f"SimpleCRM enterprise inquiry · {payload.expected_users} uživatelů",
            body=body,
        )
    )
    return {"status": "queued", "received_at": datetime.now(tz=UTC).isoformat()}


@router.put(
    "/current/subscription/seat-count",
    response_model=SubscriptionOut,
)
async def update_seat_count(
    payload: UpdateSeatCountIn,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> SubscriptionOut:
    """Org admin tunes the contracted seat count.

    Four shapes:

    - **Cancel queued change** (target == current `seat_count`): clear
      both pending fields without changing anything else. Used by the
      "Zrušit naplánovanou změnu" button in Organizace + the per-row
      pill cancel in Uživatelé.
    - **Trial bump** (status='trialing', target > contracted): apply
      immediately. The trial-time slider play is locked in at first
      payment and billed for the picked count from then on.
    - **Increase ≤ contracted** (target > current `seat_count` but
      target ≤ contracted_seat_count): apply immediately. Customer is
      either un-queueing a downsize or staying within their paid
      baseline; no charge needed.
    - **Increase > contracted, status='active'**: rejected with HTTP 402
      and a `redirect_url` pointing at `POST /payments/seat-change-init`.
      The frontend kicks the customer through ComGate; the webhook
      eventually applies the bump via `billing.apply_seat_charge_success`.
      Closes the bump-then-drop-before-billing abuse documented in
      qa-artifacts/2026-05-03-adversary-testing-report.md (Finding 1).
    - **Decrease** (target < active): queue the change. `seat_count`
      stays at the current contracted value through this period;
      `pending_seat_count` and `pending_user_deactivations` carry the
      target + the picked victims. The rollover service
      (`billing.apply_renewal_success` for ComGate-driven renewals,
      `billing.activate_subscription` for super-admin manual flows)
      applies the queue at the next period boundary.

    The user-creation cap (`Subscription.seat_count`) is unchanged for
    queued downsizes — customers keep the seats they paid for through
    the current period.
    """
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    org_id = user.organization_id

    sub = (
        await session.execute(select(Subscription).where(Subscription.organization_id == org_id))
    ).scalar_one_or_none()
    if sub is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    active_users = (
        (
            await session.execute(
                select(User).where(User.organization_id == org_id).where(User.is_active.is_(True))
            )
        )
        .scalars()
        .all()
    )
    active_count = len(active_users)
    new_count = payload.seat_count

    # Cancel signal: target equals current seat_count → clear any queued
    # downsize and return.
    if new_count == sub.seat_count:
        sub.pending_seat_count = None
        sub.pending_user_deactivations = None
        await session.commit()
        await session.refresh(sub, attribute_names=["plan", "pending_plan"])
        return _subscription_payload(sub)

    # Increase paths.
    if new_count >= active_count:
        # Trial bumps are free (locked in at first activation), as are
        # increases that stay within the already-contracted baseline.
        # Comp orgs also bypass the gate — they don't have a billing
        # rail to pay along.
        is_within_contract = new_count <= sub.contracted_seat_count
        is_free_zone = sub.status == "trialing" or sub.is_comp
        if is_within_contract or is_free_zone:
            sub.seat_count = new_count
            # Trial bumps lift contracted_seat_count too — the customer's
            # trial-time slider play becomes their paid baseline at the
            # first activation. Within-contract bumps don't change it
            # (the cap is unchanged; we're just relaxing seat_count back
            # toward it).
            if sub.status == "trialing" or sub.is_comp:
                sub.contracted_seat_count = max(sub.contracted_seat_count, new_count)
            sub.pending_seat_count = None
            sub.pending_user_deactivations = None
            await session.commit()
            await session.refresh(sub, attribute_names=["plan", "pending_plan"])
            return _subscription_payload(sub)

        # Active org wants more seats than the contract covers → must
        # pay before we lift the cap. 402 is the right shape — the
        # frontend reads `redirect_url` and forwards the customer to
        # ComGate. Same code/shape the trial-gate uses, so the existing
        # gated-flow plumbing applies.
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "seat_upgrade_payment_required",
                "detail": (
                    f"Navýšení na {new_count} míst překračuje smluvní "
                    f"limit {sub.contracted_seat_count} — je třeba úhrady "
                    f"poměrné částky před aktivací."
                ),
                "contracted_seat_count": sub.contracted_seat_count,
                "redirect_endpoint": "/api/v1/payments/seat-change-init",
            },
        )

    # Decrease: validate the deactivation list, then QUEUE — do not
    # touch User.is_active or sub.seat_count.
    needed = active_count - new_count
    if len(payload.deactivate_user_ids) != needed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "deactivation_count_mismatch",
                "detail": (
                    f"Snížením na {new_count} ztratí přístup {needed} uživatelů — "
                    f"vyberte přesně {needed}."
                ),
                "needed": needed,
            },
        )
    ids_in_org = {u.id for u in active_users}
    for victim_id in payload.deactivate_user_ids:
        if victim_id not in ids_in_org:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="User is not in your organization or already inactive.",
            )
        if victim_id == user.id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="You cannot deactivate yourself.",
            )

    sub.pending_seat_count = new_count
    # JSONB column expects a JSON-serializable list; UUIDs need str-cast
    # so postgres stores them as plain strings rather than relying on
    # asyncpg's binary UUID encoding (which would round-trip but reads
    # back as `UUID` objects awkwardly in mixed code paths).
    sub.pending_user_deactivations = [str(v) for v in payload.deactivate_user_ids]  # type: ignore[misc]
    await session.commit()
    await session.refresh(sub, attribute_names=["plan", "pending_plan"])
    return _subscription_payload(sub)


@router.post(
    "/current/subscription/change-interval",
    response_model=SubscriptionOut,
)
async def change_billing_interval(
    payload: ChangeIntervalIn,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> SubscriptionOut:
    """Queue a monthly ↔ annual switch for the next period.

    Mid-period plan changes that require pro-rating are out of scope
    (PAYGATE §9). We store the chosen plan in `pending_plan_id`; the
    super-admin Aktivovat path applies it on the next activation, and a
    future scheduled-rollover job will apply it at period end.
    """
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    org_id = user.organization_id

    sub = (
        await session.execute(select(Subscription).where(Subscription.organization_id == org_id))
    ).scalar_one_or_none()
    if sub is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    from sqlalchemy import select as _select

    from app.db.models import Plan

    plan = (
        await session.execute(_select(Plan).where(Plan.code == payload.plan_code))
    ).scalar_one_or_none()
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown plan code: {payload.plan_code}",
        )

    sub.pending_plan_id = plan.id
    await session.commit()
    await session.refresh(sub, attribute_names=["plan", "pending_plan"])
    return _subscription_payload(sub)


@router.post(
    "/current/subscription/cancel",
    response_model=SubscriptionOut,
)
async def cancel_subscription(
    payload: CancelSelfServeIn,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
    comgate: ComGateClient = Depends(get_comgate_client),
) -> SubscriptionOut:
    """Org admin cancels their own subscription.

    Distinct from the super-admin `/admin/.../cancel` route. The customer
    keeps app access through `current_period_ends_at` (standard SaaS
    courtesy); this endpoint just stops future scheduled charges. Comp
    + enterprise can't self-cancel — those go through the founder.

    Best-effort: also calls ComGate `disable_recurring` to revoke the
    saved-card authorization on their side. ComGate failure does NOT
    block the local cancel — the scheduler's `is_comp=False` /
    `status='active'` filter is what actually stops further charges.
    """
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    org_id = user.organization_id

    try:
        sub = await billing.cancel_self_serve(
            session,
            org_id=org_id,
            by_admin_id=user.id,
            reason=payload.reason,
        )
    except billing.BillingError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    # Best-effort merchant-side disable. We commit regardless of the
    # outcome so a ComGate hiccup doesn't strand the cancel.
    payment_method = (
        await session.execute(select(PaymentMethod).where(PaymentMethod.organization_id == org_id))
    ).scalar_one_or_none()
    if payment_method is not None:
        await comgate.disable_recurring(payment_method.comgate_initial_trans_id)

    await session.commit()
    await session.refresh(sub, attribute_names=["plan", "pending_plan"])
    return _subscription_payload(sub)


@router.post(
    "/current/subscription/reactivate",
    response_model=SubscriptionOut,
)
async def reactivate_subscription(
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> SubscriptionOut:
    """Org admin un-cancels before the period actually ends.

    Only valid while `status='canceled'` AND
    `current_period_ends_at > now()`. Once the period has expired the
    customer must re-enter card details (initial-payment-init from
    scratch), so reactivation isn't available there.
    """
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    try:
        sub = await billing.reactivate_self_serve(
            session, org_id=user.organization_id, by_admin_id=user.id
        )
    except billing.BillingError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    await session.commit()
    await session.refresh(sub, attribute_names=["plan", "pending_plan"])
    return _subscription_payload(sub)
