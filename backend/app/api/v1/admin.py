"""Super-admin endpoints. Cross-organization scope.

Every route here is gated by `require_super_admin` (checks
`User.is_super_admin`). The /admin/* routes power the founder-facing
UI: list orgs, set comp / enterprise overrides, extend trials, toggle
the seller-side DPH flag, and inspect invoices.

Since the ComGate-backed billing rewrite, monthly/annual activations
are normally driven by the customer flow (`POST /payments/initial-payment-init`
→ ComGate hosted page → webhook). The `activate_subscription` route
here is kept as a manual-override escape hatch — useful when ComGate
is down and a customer wires money directly, or when fixing a stuck
subscription state.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import require_super_admin
from app.core.security import create_access_token
from app.db import get_db
from app.db.models import (
    Activity,
    BillingSettings,
    Charge,
    Organization,
    Subscription,
    SuperAdminAction,
    User,
)
from app.schemas.billing import (
    ActivateSubscriptionIn,
    AdminActivityActor,
    AdminActivityList,
    AdminActivityRow,
    AdminOrgList,
    AdminOrgRow,
    AdminOrgUserList,
    AdminOrgUserRow,
    BillingSettingsOut,
    BillingSettingsUpdate,
    CancelSubscriptionIn,
    ExtendTrialIn,
    ImpersonateOut,
    SetCompIn,
    SetEnterpriseIn,
    SubscriptionOut,
    SubscriptionStatus,
)
from app.schemas.payments import ChargeList, ChargeOut
from app.services import billing, super_admin_audit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Org list + detail
# ---------------------------------------------------------------------------


@router.get("/organizations", response_model=AdminOrgList)
async def list_organizations(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: str | None = Query(default=None, description="Substring match on org name"),
    _admin: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db),
) -> AdminOrgList:
    base = select(Organization)
    if q:
        base = base.where(Organization.name.ilike(f"%{q}%"))

    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()

    orgs = (
        (await session.execute(base.order_by(Organization.name).limit(limit).offset(offset)))
        .scalars()
        .all()
    )

    if not orgs:
        return AdminOrgList(items=[], total=total)

    org_ids = [o.id for o in orgs]
    sub_rows = (
        (
            await session.execute(
                select(Subscription)
                .options(selectinload(Subscription.plan))
                .where(Subscription.organization_id.in_(org_ids))
            )
        )
        .scalars()
        .all()
    )
    subs_by_org = {s.organization_id: s for s in sub_rows}

    user_counts: dict[uuid.UUID, int] = {
        row.organization_id: row.user_count
        for row in (
            await session.execute(
                select(
                    User.organization_id.label("organization_id"),
                    func.count(User.id).label("user_count"),
                )
                .where(User.organization_id.in_(org_ids))
                .where(User.is_active.is_(True))
                .group_by(User.organization_id)
            )
        ).all()
    }

    last_activity: dict[uuid.UUID, datetime] = {
        row.organization_id: row.latest_at
        for row in (
            await session.execute(
                select(
                    Activity.organization_id.label("organization_id"),
                    func.max(Activity.created_at).label("latest_at"),
                )
                .where(Activity.organization_id.in_(org_ids))
                .group_by(Activity.organization_id)
            )
        ).all()
    }

    items = [
        AdminOrgRow(
            id=o.id,
            name=o.name,
            plan_code=subs_by_org[o.id].plan.code if o.id in subs_by_org else "trial",
            plan_display=(
                subs_by_org[o.id].plan.display_name_cs if o.id in subs_by_org else "Zkušební verze"
            ),
            status=cast(
                SubscriptionStatus,
                subs_by_org[o.id].status if o.id in subs_by_org else "trialing",
            ),
            is_comp=subs_by_org[o.id].is_comp if o.id in subs_by_org else False,
            user_count=user_counts.get(o.id, 0),
            trial_ends_at=o.trial_ends_at,
            current_period_ends_at=(
                subs_by_org[o.id].current_period_ends_at if o.id in subs_by_org else None
            ),
            last_activity_at=last_activity.get(o.id),
        )
        for o in orgs
    ]
    return AdminOrgList(items=items, total=total)


def _access_status(sub: Subscription) -> str:
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
            "seat_count": sub.seat_count,
            "contracted_seat_count": sub.contracted_seat_count,
            "pending_plan": sub.pending_plan,
            "pending_seat_count": sub.pending_seat_count,
            "pending_user_deactivations": sub.pending_user_deactivations,
            "effective_price_per_user_minor": billing.get_effective_price_per_user_minor(sub),
            "access_status": _access_status(sub),
        }
    )


@router.get("/organizations/{org_id}", response_model=SubscriptionOut)
async def get_organization_subscription(
    org_id: uuid.UUID,
    admin: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db),
) -> SubscriptionOut:
    """Org detail, returned as a Subscription view (org metadata is on the
    Plan object inside it; the frontend already has the org row from the
    list).
    """
    sub = await billing.get_current_subscription(session, org_id)
    await super_admin_audit.record(
        session,
        super_admin=admin,
        action=SuperAdminAction.view_subscription,
        target_organization_id=org_id,
    )
    await session.commit()
    return _subscription_payload(sub)


# ---------------------------------------------------------------------------
# Subscription mutations
# ---------------------------------------------------------------------------


@router.post(
    "/organizations/{org_id}/subscription/activate",
    response_model=SubscriptionOut,
)
async def activate_subscription(
    org_id: uuid.UUID,
    payload: ActivateSubscriptionIn,
    admin: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db),
) -> SubscriptionOut:
    try:
        await billing.activate_subscription(
            session,
            org_id=org_id,
            plan_code=payload.plan_code,
            override_price_minor=payload.override_price_per_user_minor,
            period_months=payload.period_months,
            by_admin_id=admin.id,
        )
    except billing.BillingError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    await session.commit()
    sub = await billing.get_current_subscription(session, org_id)
    return _subscription_payload(sub)


@router.post(
    "/organizations/{org_id}/subscription/set-comp",
    response_model=SubscriptionOut,
)
async def set_comp(
    org_id: uuid.UUID,
    payload: SetCompIn,
    admin: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db),
) -> SubscriptionOut:
    try:
        await billing.set_comp(
            session,
            org_id=org_id,
            reason=payload.reason,
            ends_at=payload.ends_at,
            by_admin_id=admin.id,
        )
    except billing.BillingError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    await session.commit()
    sub = await billing.get_current_subscription(session, org_id)
    return _subscription_payload(sub)


@router.post(
    "/organizations/{org_id}/subscription/set-enterprise",
    response_model=SubscriptionOut,
)
async def set_enterprise(
    org_id: uuid.UUID,
    payload: SetEnterpriseIn,
    admin: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db),
) -> SubscriptionOut:
    try:
        await billing.set_enterprise(
            session,
            org_id=org_id,
            override_price_per_user_minor=payload.override_price_per_user_minor,
            period_months=payload.period_months,
            notes=payload.notes,
            by_admin_id=admin.id,
        )
    except billing.BillingError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    await session.commit()
    sub = await billing.get_current_subscription(session, org_id)
    return _subscription_payload(sub)


@router.post(
    "/organizations/{org_id}/subscription/extend-trial",
    response_model=SubscriptionOut,
)
async def extend_trial(
    org_id: uuid.UUID,
    payload: ExtendTrialIn,
    admin: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db),
) -> SubscriptionOut:
    try:
        await billing.extend_trial(
            session,
            org_id=org_id,
            days=payload.days,
            by_admin_id=admin.id,
        )
    except billing.BillingError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    await session.commit()
    sub = await billing.get_current_subscription(session, org_id)
    return _subscription_payload(sub)


@router.post(
    "/organizations/{org_id}/subscription/cancel",
    response_model=SubscriptionOut,
)
async def cancel_subscription(
    org_id: uuid.UUID,
    payload: CancelSubscriptionIn,
    admin: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db),
) -> SubscriptionOut:
    try:
        await billing.cancel(
            session,
            org_id=org_id,
            effective_at=payload.effective_at,
            by_admin_id=admin.id,
        )
    except billing.BillingError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    await session.commit()
    sub = await billing.get_current_subscription(session, org_id)
    return _subscription_payload(sub)


# ---------------------------------------------------------------------------
# Subscription activity timeline
# ---------------------------------------------------------------------------


@router.get(
    "/organizations/{org_id}/activity",
    response_model=AdminActivityList,
)
async def get_org_subscription_activity(
    org_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db),
) -> AdminActivityList:
    """Subscription-scoped activity rows for the admin detail drawer.

    Subscription mutations write Activity rows with
    `entity_type=organization` + `activity_type=subscription_change`
    (see `BillingService._audit`). Filter on both so unrelated org-scoped
    activity (e.g. team events that may write to the same org row in the
    future) doesn't leak into the timeline.
    """
    from app.db.models.enums import ActivityEntityType, ActivityType

    base = (
        select(Activity)
        .options(selectinload(Activity.user))
        .where(Activity.organization_id == org_id)
        .where(Activity.entity_type == ActivityEntityType.organization)
        .where(Activity.activity_type == ActivityType.subscription_change)
    )

    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()

    rows = (
        (
            await session.execute(
                base.order_by(Activity.created_at.desc()).limit(limit).offset(offset)
            )
        )
        .scalars()
        .all()
    )

    items = [
        AdminActivityRow(
            id=a.id,
            activity_type=a.activity_type.value
            if hasattr(a.activity_type, "value")
            else str(a.activity_type),
            payload=a.payload or {},
            created_at=a.created_at,
            actor=(
                AdminActivityActor(id=a.user.id, name=a.user.name, email=a.user.email)
                if a.user is not None
                else None
            ),
        )
        for a in rows
    ]
    await super_admin_audit.record(
        session,
        super_admin=admin,
        action=SuperAdminAction.view_activity,
        target_organization_id=org_id,
    )
    await session.commit()
    return AdminActivityList(items=items, total=total)


# ---------------------------------------------------------------------------
# Billing settings (singleton)
# ---------------------------------------------------------------------------


@router.get("/billing-settings", response_model=BillingSettingsOut)
async def get_billing_settings(
    _admin: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db),
) -> BillingSettings:
    settings = (await session.execute(select(BillingSettings))).scalar_one()
    return settings


@router.put("/billing-settings", response_model=BillingSettingsOut)
async def update_billing_settings(
    payload: BillingSettingsUpdate,
    _admin: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db),
) -> BillingSettings:
    settings = (await session.execute(select(BillingSettings))).scalar_one()
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(settings, field, value)
    await session.commit()
    await session.refresh(settings)
    return settings


# ---------------------------------------------------------------------------
# Per-org invoice history (super-admin visibility into ComGate charges)
# ---------------------------------------------------------------------------


@router.get(
    "/organizations/{org_id}/invoices",
    response_model=ChargeList,
)
async def list_org_invoices(
    org_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db),
) -> ChargeList:
    """Founder-facing invoice list for one org.

    Mirrors the customer-facing `GET /payments/invoices` shape but
    skips the `require_role(admin)` org-membership check — super-admin
    operates across orgs.
    """
    base = select(Charge).where(Charge.organization_id == org_id)
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        (await session.execute(base.order_by(Charge.created_at.desc()).limit(limit).offset(offset)))
        .scalars()
        .all()
    )
    await super_admin_audit.record(
        session,
        super_admin=admin,
        action=SuperAdminAction.view_invoices,
        target_organization_id=org_id,
    )
    await session.commit()
    return ChargeList(
        items=[ChargeOut.model_validate(r) for r in rows],
        total=total,
    )


# ---------------------------------------------------------------------------
# Org members + impersonation (super-admin diagnostic / demo access)
# ---------------------------------------------------------------------------


@router.get(
    "/organizations/{org_id}/users",
    response_model=AdminOrgUserList,
)
async def list_org_users(
    org_id: uuid.UUID,
    admin: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db),
) -> AdminOrgUserList:
    """All members of an org, ordered admin → manager → salesperson then
    by name. Drives the impersonation picker on the org detail drawer.
    """
    rows = (
        (
            await session.execute(
                select(User).where(User.organization_id == org_id).order_by(User.role, User.name)
            )
        )
        .scalars()
        .all()
    )
    await super_admin_audit.record(
        session,
        super_admin=admin,
        action=SuperAdminAction.list_users,
        target_organization_id=org_id,
    )
    await session.commit()
    return AdminOrgUserList(items=[AdminOrgUserRow.model_validate(u) for u in rows])


@router.post(
    "/users/{user_id}/impersonate",
    response_model=ImpersonateOut,
)
async def impersonate_user(
    user_id: uuid.UUID,
    admin: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db),
) -> ImpersonateOut:
    """Mint an access token for `user_id` so the calling super-admin can
    operate the app as that user (demo / support diagnostics).

    Returns access token only — no refresh cookie is set, so the
    super-admin's own session survives a page reload. To "stop
    impersonating," the operator simply reloads the SPA: AuthContext's
    cold-load `/auth/refresh` will re-hydrate using the existing
    super-admin refresh cookie.

    Guardrails:
      - `require_super_admin` rejects non-super-admin callers.
      - Refuses to impersonate another super-admin (privilege isolation).
      - Refuses to impersonate inactive users or users without an org
        (the resulting session would be unusable).
    """
    target = await session.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if target.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Refusing to impersonate another super-admin",
        )
    if not target.is_active:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Target user is inactive",
        )
    if target.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Target user has no organization",
        )

    # Belt-and-braces: app log keeps an instant grep-friendly trail; the
    # persisted audit row is what the customer admin can see in Settings.
    logger.warning(
        "super-admin %s (%s) impersonating user %s (%s) in org %s",
        admin.id,
        admin.email,
        target.id,
        target.email,
        target.organization_id,
    )
    await super_admin_audit.record(
        session,
        super_admin=admin,
        action=SuperAdminAction.impersonate,
        target_organization_id=target.organization_id,
        target_user=target,
        payload={"target_role": target.role.value},
    )
    await session.commit()

    access_token = create_access_token(target.id, target.organization_id, target.role)
    return ImpersonateOut(
        access_token=access_token,
        user_id=target.id,
        email=target.email,
    )
