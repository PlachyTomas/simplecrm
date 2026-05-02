"""Endpoints for managing the current user's Organization."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import cast

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db import get_db
from app.db.models import BillingSettings, Organization, Subscription, User, UserRole
from app.schemas.billing import (
    BillingSummary,
    ChoosePlanIn,
    ContactEnterpriseIn,
    SubscriptionOut,
)
from app.schemas.organization import OrganizationOut, OrganizationUpdate
from app.services import billing
from app.services.email import Email, send_email

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("/current", response_model=OrganizationOut)
async def get_current_organization(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Organization:
    org = await session.get(Organization, cast(uuid.UUID, user.organization_id))
    if org is None:  # shouldn't happen — user rows carry a valid FK
        raise RuntimeError("current user points at a missing organization")
    return org


@router.put("/current", response_model=OrganizationOut)
async def update_current_organization(
    payload: OrganizationUpdate,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> Organization:
    org = await session.get(Organization, cast(uuid.UUID, user.organization_id))
    if org is None:
        raise RuntimeError("current user points at a missing organization")

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(org, field, value)

    await session.commit()
    await session.refresh(org)
    return org


# ---------------------------------------------------------------------------
# Subscription read endpoints (any org member can read their own)
# ---------------------------------------------------------------------------


def _access_status(sub: Subscription) -> str:
    """Render `Subscription` → frontend access label.

    Strict mapping: comp → 'comp'; trialing in-period → 'trialing';
    active in-period → 'active'; past_due in grace → 'grace';
    everything else → 'gated'. Mirrors `is_app_access_allowed`.
    """
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
    sub = await billing.get_current_subscription(session, cast(uuid.UUID, user.organization_id))
    return _subscription_payload(sub)


@router.get("/current/billing-summary", response_model=BillingSummary)
async def get_current_billing_summary(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> BillingSummary:
    """Numbers the in-app pricing/settings surface needs in one round-trip."""
    sub = await billing.get_current_subscription(session, cast(uuid.UUID, user.organization_id))
    user_count = (
        await session.execute(
            select(func.count(User.id))
            .where(User.organization_id == cast(uuid.UUID, user.organization_id))
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
        # The dynamic monthly = effective * user_count if the org is
        # already on a monthly cadence; for trial/comp/enterprise we
        # surface the *projected* monthly total so the frontend can
        # show "you would pay X if you switched".
        monthly_total = effective * user_count
        monthly_with_vat = (
            await billing.compute_with_vat(session, monthly_total)
        ).with_vat_minor

        # Annual numbers come from the public ladder savings — we don't
        # know what the override would cost annually for enterprise.
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


# ---------------------------------------------------------------------------
# Subscription mutations (org admin)
# ---------------------------------------------------------------------------


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
    try:
        sub = await billing.choose_plan(
            session,
            org_id=cast(uuid.UUID, user.organization_id),
            plan_code=payload.plan_code,
            requested_by_user_id=user.id,
        )
    except billing.BillingError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    await session.commit()
    sub = await billing.get_current_subscription(session, cast(uuid.UUID, user.organization_id))
    return _subscription_payload(sub)


@router.post("/current/subscription/contact-enterprise", status_code=202)
async def contact_enterprise(
    payload: ContactEnterpriseIn,
    user: User = Depends(require_role(UserRole.admin)),
) -> dict[str, str]:
    """Send an internal email to the founder requesting an enterprise quote.

    Stub-only: logs through `app.services.email.send_email`. Returns
    `{status: 'queued'}`.
    """
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

