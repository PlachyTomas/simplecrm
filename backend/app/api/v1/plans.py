"""Public plans catalog. No auth — used by the marketing pricing page."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.db.models import BillingSettings, Plan
from app.schemas.billing import BillingSettingsPublic, PublicPlanOut

router = APIRouter(prefix="/plans", tags=["plans"])

# Hard-coded reference price-per-user for monthly. Used to derive the
# annual-vs-monthly savings on the public pricing page; mirrors the seed.
_MONTHLY_PRICE_MINOR = 9900


@router.get("/public", response_model=list[PublicPlanOut])
async def list_public_plans(
    session: AsyncSession = Depends(get_db),
) -> list[PublicPlanOut]:
    """Plans where `is_public=True`, ordered by `sort_order`.

    Annual plans get derived `monthly_equivalent_minor` (12 * monthly
    price) and `savings_minor` so the frontend can render the savings
    line without a second round-trip.
    """
    rows = (
        (
            await session.execute(
                select(Plan)
                .where(Plan.is_public.is_(True), Plan.is_active.is_(True))
                .order_by(Plan.sort_order)
            )
        )
        .scalars()
        .all()
    )

    out: list[PublicPlanOut] = []
    for plan in rows:
        item = PublicPlanOut.model_validate(plan)
        if plan.billing_interval == "annual" and plan.price_per_user_minor is not None:
            monthly_equiv = _MONTHLY_PRICE_MINOR * 12
            savings = monthly_equiv - plan.price_per_user_minor
            item.monthly_equivalent_minor = monthly_equiv
            item.savings_minor = savings
            item.savings_percent = (
                round((savings / monthly_equiv) * 100.0, 1) if monthly_equiv else 0.0
            )
        out.append(item)
    return out


# Note: this lives under /plans because the router has no auth deps. It
# could equally live under /billing-settings/public — keeping it here
# avoids a second public router for one endpoint.
@router.get("/billing-settings/public", response_model=BillingSettingsPublic)
async def get_public_billing_settings(
    session: AsyncSession = Depends(get_db),
) -> BillingSettings:
    """Read-only public subset of billing_settings — `is_vat_payer`,
    `vat_rate_percent`, support email. Powers `<PriceDisplay>` on the
    marketing pricing page so unauthenticated visitors see correct DPH
    copy.
    """
    return (await session.execute(select(BillingSettings))).scalar_one()
