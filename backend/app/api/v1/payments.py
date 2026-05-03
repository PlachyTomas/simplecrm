"""Customer-facing payment endpoints (ComGate-backed).

Five routes:
  - POST /payments/initial-payment-init — start a customer's first
    paid plan; returns a ComGate hosted-page redirect URL.
  - POST /payments/seat-change-init — start a mid-period seat upgrade;
    charges the saved card via ComGate's recurring API, returns
    `accepted` while we wait for the webhook.
  - GET  /payments/return — ComGate redirects the customer's browser
    here after they complete or abandon the hosted page; we 302 onward
    to the frontend's billing-return route.
  - POST /payments/webhook — ComGate POSTs payment outcomes here;
    signature-verified, deduped via `webhook_events`, dispatched into
    the matching `services/billing.apply_*_success` /
    `mark_charge_failed` funnel.
  - GET  /payments/invoices — invoice history for the org admin.

This router is intentionally NOT mounted under PROTECTED_DEPS: the
trial-gate would block `seat-change-init` for orgs already on a paid
plan that just want to upgrade — and `webhook` is server-to-server
from ComGate (no user auth at all). The customer-facing endpoints
require `require_role(UserRole.admin)`; the webhook is signature-
gated.

ComGate's exact field names + signature scheme are gated behind their
merchant portal. The integration assumes the v2 REST shape (HMAC-SHA256
on the raw body) and field names like `transId` / `status` / `refId`;
adjust against your portal's "API protokol" + "Notifikace" pages if
they differ. See `docs/comgate-setup.md`.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import get_current_user, require_org_membership, require_role
from app.db import get_db
from app.db.models import (
    Invoice,
    Organization,
    PaymentMethod,
    Subscription,
    User,
    UserRole,
    WebhookEvent,
)
from app.schemas.payments import (
    InitialPaymentInitIn,
    InvoiceList,
    InvoiceOut,
    PaymentInitOut,
    SeatChangeInitIn,
    SeatChangeInitOut,
)
from app.services import billing
from app.services.comgate import (
    ComGateClient,
    ComGateError,
    get_comgate_client,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["payments"])


# ---------------------------------------------------------------------------
# Customer-facing init endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/initial-payment-init",
    response_model=PaymentInitOut,
    dependencies=[Depends(require_org_membership)],
)
async def initial_payment_init(
    payload: InitialPaymentInitIn,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
    comgate: ComGateClient = Depends(get_comgate_client),
) -> PaymentInitOut:
    """Customer is moving from trial → paid plan.

    Creates an `Invoice(kind=initial, status=pending)`, asks ComGate
    for a hosted-payment-page URL, returns it for the frontend to
    redirect to. The webhook lands later and promotes to active.
    """
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    org_id = user.organization_id

    sub = await billing.get_current_subscription(session, org_id)
    if sub.is_comp:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Comp subscriptions are managed by support.",
        )

    plan = await billing._load_plan_by_code(session, payload.plan_code)
    if plan.price_per_user_minor is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"plan {payload.plan_code!r} has no public price.",
        )
    amount_minor = sub.seat_count * plan.price_per_user_minor

    invoice = Invoice(
        organization_id=org_id,
        kind="initial",
        amount_minor=amount_minor,
        currency=plan.currency,
        status="pending",
        seats=sub.seat_count,
    )
    session.add(invoice)
    await session.flush()

    org = await session.get(Organization, org_id)
    label = (
        f"SimpleCRM {plan.display_name_cs} – {org.name if org else ''}"
    ).strip()
    try:
        created = await comgate.create_initial_payment(
            amount_minor=amount_minor,
            currency=plan.currency,
            ref_id=str(invoice.id),
            label=label,
            email=user.email,
        )
    except ComGateError as exc:
        await session.rollback()
        logger.warning("ComGate create_initial_payment failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Platební brána není dostupná, zkuste to prosím za chvíli.",
        ) from exc

    invoice.comgate_trans_id = created.trans_id
    await session.commit()

    return PaymentInitOut(
        redirect_url=created.redirect_url,
        invoice_id=invoice.id,
        amount_minor=amount_minor,
        currency=plan.currency,
    )


@router.post(
    "/seat-change-init",
    response_model=SeatChangeInitOut,
    dependencies=[Depends(require_org_membership)],
)
async def seat_change_init(
    payload: SeatChangeInitIn,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
    comgate: ComGateClient = Depends(get_comgate_client),
) -> SeatChangeInitOut:
    """Mid-period seat upgrade — paid orgs only.

    Trial bumps and decreases never reach this endpoint; they're
    handled directly by `PUT /subscription/seat-count`. This is only
    called when the active org wants to lift `contracted_seat_count`,
    which requires an immediate prorated ComGate charge.
    """
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    org_id = user.organization_id

    sub = await billing.get_current_subscription(session, org_id)
    if sub.is_comp:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Comp subscriptions are managed by support.",
        )
    if sub.status != "active":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "not_active",
                "detail": (
                    "Subscription must be active to upgrade seats. "
                    "Choose a plan first."
                ),
            },
        )
    if payload.seat_count <= sub.contracted_seat_count:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "not_an_upgrade",
                "detail": (
                    "Use PUT /subscription/seat-count for decreases and "
                    "no-op changes."
                ),
            },
        )

    payment_method = (
        await session.execute(
            select(PaymentMethod).where(PaymentMethod.organization_id == org_id)
        )
    ).scalar_one_or_none()
    if payment_method is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "no_payment_method",
                "detail": (
                    "No saved card on file. Choose a plan first to "
                    "register a payment method."
                ),
            },
        )

    amount_minor = billing.compute_seat_proration(
        sub, new_seat_count=payload.seat_count
    )
    if amount_minor <= 0:
        # Defensive — the upgrade check above should have caught this.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Computed proration was zero; nothing to charge.",
        )

    invoice = Invoice(
        organization_id=org_id,
        kind="seat_upgrade",
        amount_minor=amount_minor,
        currency=sub.plan.currency,
        status="pending",
        seats=payload.seat_count,
        period_starts_at=sub.current_period_starts_at,
        period_ends_at=sub.current_period_ends_at,
    )
    session.add(invoice)
    await session.flush()

    label = (
        f"SimpleCRM navýšení na {payload.seat_count} uživatelů"
    )
    try:
        result = await comgate.create_recurring_payment(
            initial_trans_id=payment_method.comgate_initial_trans_id,
            amount_minor=amount_minor,
            currency=sub.plan.currency,
            ref_id=str(invoice.id),
            label=label,
        )
    except ComGateError as exc:
        await session.rollback()
        logger.warning("ComGate create_recurring_payment failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Platební brána odmítla transakci. Zkontrolujte uloženou kartu.",
        ) from exc

    invoice.comgate_trans_id = result.trans_id
    await session.commit()

    return SeatChangeInitOut(
        status="accepted",
        invoice_id=invoice.id,
        amount_minor=amount_minor,
        currency=sub.plan.currency,
    )


# ---------------------------------------------------------------------------
# Browser return + invoice list
# ---------------------------------------------------------------------------


@router.get("/return")
async def payment_return(
    transId: str | None = Query(default=None),  # noqa: N803 — ComGate's name
    refId: str | None = Query(default=None),  # noqa: N803
    session: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """ComGate redirects the customer's browser here after they
    complete (or cancel) the hosted-payment page.

    We don't trust this for billing state — that's the webhook's job.
    Read the invoice if we know its ID, then 302 the customer to the
    frontend's billing-return route with whatever status we can see.
    """
    settings = get_settings()
    target_status: str = "pending"
    if refId:
        try:
            invoice_id = uuid.UUID(refId)
        except ValueError:
            invoice_id = None
        if invoice_id is not None:
            invoice = await session.get(Invoice, invoice_id)
            if invoice is not None:
                target_status = invoice.status

    # frontend_success_redirect is e.g. "http://localhost:5173/app";
    # peel off any path so we land on /app/billing/return.
    base = settings.frontend_success_redirect
    if base.startswith(("http://", "https://")):
        parts = base.split("/", 3)
        origin = "/".join(parts[:3])
    else:
        origin = base
    redirect_url = f"{origin}/app/billing/return?status={target_status}"
    if transId:
        redirect_url += f"&transId={transId}"
    return RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)


@router.get(
    "/invoices",
    response_model=InvoiceList,
    dependencies=[Depends(require_org_membership)],
)
async def list_invoices(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> InvoiceList:
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)

    base = select(Invoice).where(Invoice.organization_id == user.organization_id)
    total = (
        await session.execute(select(func.count()).select_from(base.subquery()))
    ).scalar_one()
    rows = (
        await session.execute(
            base.order_by(Invoice.created_at.desc()).limit(limit).offset(offset)
        )
    ).scalars().all()
    return InvoiceList(
        items=[InvoiceOut.model_validate(r) for r in rows],
        total=total,
    )


# ---------------------------------------------------------------------------
# Webhook
# ---------------------------------------------------------------------------


@router.post("/webhook", status_code=status.HTTP_204_NO_CONTENT)
async def comgate_webhook(
    request: Request,
    x_comgate_signature: str | None = Header(default=None),
    session: AsyncSession = Depends(get_db),
    comgate: ComGateClient = Depends(get_comgate_client),
) -> None:
    """ComGate server-to-server payment-outcome notification.

    1. Verify the HMAC-SHA256 signature on the raw request body.
    2. Dedupe via `webhook_events.comgate_event_id` — re-deliveries
       silently 204.
    3. Parse the payload, look up the matching Invoice via `refId`
       (which we set to the Invoice ID at create-time).
    4. Dispatch to the appropriate `services/billing.apply_*_success`
       or `mark_charge_failed` based on Invoice.kind + payload status.

    Returns 204 on every successful processing path (including dedupes
    and known-bad inputs that we've decided to swallow). Returns 4xx
    only when ComGate should be told to retry.
    """
    raw_body = await request.body()
    if not comgate.verify_webhook_signature(
        raw_body=raw_body, signature_header=x_comgate_signature
    ):
        # 400 (not 401) — ComGate uses 4xx as "don't retry".
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook signature",
        )

    payload = await request.json()
    trans_id = str(payload.get("transId") or "")
    if not trans_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing transId",
        )

    # Idempotency: insert WebhookEvent first; FK violation on
    # comgate_event_id means we've already processed this delivery.
    event = WebhookEvent(comgate_event_id=trans_id, payload=payload)
    session.add(event)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        # Already processed — silently 204.
        return

    ref_id = payload.get("refId")
    if not ref_id:
        event.processed_at = datetime.now(tz=UTC)
        await session.commit()
        logger.warning("ComGate webhook missing refId: %s", trans_id)
        return

    try:
        invoice_id = uuid.UUID(str(ref_id))
    except ValueError:
        event.processed_at = datetime.now(tz=UTC)
        await session.commit()
        logger.warning("ComGate webhook refId not a UUID: %s", ref_id)
        return

    invoice = await session.get(Invoice, invoice_id)
    if invoice is None:
        event.processed_at = datetime.now(tz=UTC)
        await session.commit()
        logger.warning(
            "ComGate webhook for unknown invoice %s (transId=%s)",
            invoice_id,
            trans_id,
        )
        return

    # Avoid double-processing if the same invoice somehow gets two
    # webhooks (e.g. ComGate event_id changed between retries).
    if invoice.status in {"paid", "failed", "refunded"}:
        event.processed_at = datetime.now(tz=UTC)
        await session.commit()
        return

    cg_status = str(payload.get("status") or "").upper()
    succeeded = cg_status == "PAID"

    if succeeded:
        await _dispatch_success(
            session,
            invoice=invoice,
            comgate_trans_id=trans_id,
            comgate=comgate,
        )
    else:
        await _dispatch_failure(
            session,
            invoice=invoice,
            comgate_trans_id=trans_id,
            failure_reason=str(payload.get("message") or cg_status or "FAILED"),
        )

    event.processed_at = datetime.now(tz=UTC)
    await session.commit()


async def _dispatch_success(
    session: AsyncSession,
    *,
    invoice: Invoice,
    comgate_trans_id: str,
    comgate: ComGateClient,
) -> None:
    """Route a successful payment into the right billing funnel."""
    org_id = invoice.organization_id
    invoice.status = "paid"
    invoice.paid_at = datetime.now(tz=UTC)

    if invoice.kind == "initial":
        # The plan_code lives on the invoice's eventual subscription
        # — we look it up via the seat-count delta + plan price baseline.
        # Simpler: the customer's chosen plan was already written to
        # `Subscription.plan_id` by `choose_plan` before this webhook
        # could land. Use that.
        sub = await billing.get_current_subscription(session, org_id)
        await billing.apply_initial_payment_success(
            session,
            org_id=org_id,
            plan_code=sub.plan.code,
            comgate_trans_id=comgate_trans_id,
        )
        # Persist the saved-card record so future recurring charges
        # can replay this transId. Card details (brand/last4/expiry)
        # come from ComGate's `payment` GET — fetched lazily later if
        # the portal doesn't include them in the webhook payload.
        existing = (
            await session.execute(
                select(PaymentMethod).where(PaymentMethod.organization_id == org_id)
            )
        ).scalar_one_or_none()
        if existing is None:
            session.add(
                PaymentMethod(
                    organization_id=org_id,
                    comgate_initial_trans_id=comgate_trans_id,
                )
            )
        else:
            existing.comgate_initial_trans_id = comgate_trans_id
    elif invoice.kind == "seat_upgrade":
        await billing.apply_seat_charge_success(
            session,
            org_id=org_id,
            new_seat_count=invoice.seats or 0,
            charge_amount_minor=invoice.amount_minor,
            comgate_trans_id=comgate_trans_id,
        )
    elif invoice.kind == "renewal":
        await billing.apply_renewal_success(
            session,
            org_id=org_id,
            comgate_trans_id=comgate_trans_id,
        )
    else:
        logger.warning("Unknown invoice.kind=%r for %s", invoice.kind, invoice.id)


async def _dispatch_failure(
    session: AsyncSession,
    *,
    invoice: Invoice,
    comgate_trans_id: str,
    failure_reason: str,
) -> None:
    """Mark the invoice failed + delegate dunning to billing service."""
    invoice.status = "failed"
    invoice.failure_reason = failure_reason[:500]
    await billing.mark_charge_failed(
        session,
        org_id=invoice.organization_id,
        kind=invoice.kind,
        failure_reason=failure_reason,
    )
