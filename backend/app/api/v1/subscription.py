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
from app.db.models import BillingSettings, Subscription, User, UserRole
from app.schemas.billing import (
    BillingSummary,
    ChoosePlanIn,
    ContactEnterpriseIn,
    SubscriptionOut,
)
from app.services import billing
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
    if sub.status == "trialing":
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
    sub = await billing.get_current_subscription(
        session, user.organization_id
    )
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
        monthly_with_vat = (
            await billing.compute_with_vat(session, monthly_total)
        ).with_vat_minor

        public_savings = billing.compute_savings(user_count)
        annual_total = public_savings.annual_total_minor
        annual_with_vat = (
            await billing.compute_with_vat(session, annual_total)
        ).with_vat_minor
        savings_minor = public_savings.savings_minor
        savings_percent = public_savings.savings_percent

    settings = (
        await session.execute(select(BillingSettings))
    ).scalar_one()

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

    Records intent — the founder activates manually after payment.
    Idempotent: re-picking the same plan returns the existing pending
    subscription without a second email.
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
    sub = await billing.get_current_subscription(
        session, user.organization_id
    )
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
