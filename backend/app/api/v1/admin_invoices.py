"""Super-admin tax-invoice endpoints.

Cross-organization scope; all routes guarded by `require_super_admin`.
Powers the founder-facing /admin/faktury UI: list across all orgs
with rich filters, detail with audit-log timeline, action endpoints
(send / mark-paid / void / credit-note).

`admin.py` was already large — splitting these into a separate module
keeps both readable. Both modules share the `/admin` prefix on the
api_router; FastAPI is happy with two routers under the same prefix.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import require_super_admin
from app.db import get_db
from app.db.models import (
    Invoice,
    InvoiceAuditLog,
    Organization,
    User,
)
from app.schemas.admin_invoicing import (
    AdminCreditNoteIn,
    AdminInvoiceAuditEntry,
    AdminInvoiceDetail,
    AdminInvoiceLine,
    AdminInvoiceList,
    AdminInvoiceListItem,
    AdminMarkPaidIn,
    AdminSendIn,
    AdminVoidIn,
)
from app.services.invoicing.mailer import InvoiceMailer, InvoiceMailerError
from app.services.invoicing.service import (
    CreditNoteExceedsOriginalError,
    InvoiceService,
    ManualLineIn,
)

router = APIRouter(prefix="/admin/invoices", tags=["admin-invoices"])


# --------------------------------------------------------------------------- #
# Listing
# --------------------------------------------------------------------------- #


@router.get("", response_model=AdminInvoiceList)
async def list_invoices(
    year: int | None = Query(default=None, ge=2020, le=2100),
    status_in: list[str] | None = Query(default=None, alias="status"),
    kind: str | None = Query(default=None),
    org_id: uuid.UUID | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    q: str | None = Query(default=None, max_length=200),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _admin: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db),
) -> AdminInvoiceList:
    """Cross-org invoice list with filter chain.

    Filters compose with AND semantics. `q` matches against invoice
    number OR customer_name (ILIKE substring); useful for the search box
    in the admin UI.
    """
    base = select(Invoice, Organization.name).join(
        Organization, Organization.id == Invoice.organization_id
    )
    if year is not None:
        base = base.where(Invoice.year == year)
    if status_in:
        base = base.where(Invoice.status.in_(status_in))
    if kind is not None:
        base = base.where(Invoice.kind == kind)
    if org_id is not None:
        base = base.where(Invoice.organization_id == org_id)
    if date_from is not None:
        base = base.where(Invoice.issued_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to is not None:
        base = base.where(Invoice.issued_at <= datetime.combine(date_to, datetime.max.time()))
    if q:
        like = f"%{q}%"
        base = base.where(or_(Invoice.number.ilike(like), Invoice.customer_name.ilike(like)))

    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        await session.execute(base.order_by(desc(Invoice.issued_at)).limit(limit).offset(offset))
    ).all()

    items = [
        AdminInvoiceListItem.model_validate(
            {
                "id": inv.id,
                "organization_id": inv.organization_id,
                "organization_name": org_name,
                "number": inv.number,
                "kind": inv.kind,
                "status": inv.status,
                "issued_at": inv.issued_at,
                "due_at": inv.due_at,
                "paid_at": inv.paid_at,
                "sent_at": inv.sent_at,
                "customer_name": inv.customer_name,
                "currency": inv.currency,
                "total_minor": inv.total_minor,
                "related_invoice_id": inv.related_invoice_id,
            }
        )
        for (inv, org_name) in rows
    ]
    return AdminInvoiceList(items=items, total=total)


# --------------------------------------------------------------------------- #
# Detail (with audit-log timeline)
# --------------------------------------------------------------------------- #


async def _load_invoice_or_404(session: AsyncSession, invoice_id: uuid.UUID) -> Invoice:
    invoice = (
        await session.execute(
            select(Invoice).options(selectinload(Invoice.lines)).where(Invoice.id == invoice_id)
        )
    ).scalar_one_or_none()
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    return invoice


@router.get("/{invoice_id}", response_model=AdminInvoiceDetail)
async def get_invoice_detail(
    invoice_id: uuid.UUID,
    _admin: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db),
) -> AdminInvoiceDetail:
    invoice = await _load_invoice_or_404(session, invoice_id)
    org = await session.get(Organization, invoice.organization_id)
    audit_rows = (
        (
            await session.execute(
                select(InvoiceAuditLog)
                .where(InvoiceAuditLog.invoice_id == invoice_id)
                .order_by(desc(InvoiceAuditLog.created_at))
            )
        )
        .scalars()
        .all()
    )
    lines = sorted(invoice.lines, key=lambda li: li.position)

    return AdminInvoiceDetail(
        id=invoice.id,
        organization_id=invoice.organization_id,
        organization_name=org.name if org else "",
        subscription_id=invoice.subscription_id,
        charge_id=invoice.charge_id,
        number=invoice.number,
        variable_symbol=invoice.variable_symbol,
        kind=invoice.kind,  # type: ignore[arg-type]
        status=invoice.status,  # type: ignore[arg-type]
        related_invoice_id=invoice.related_invoice_id,
        issued_at=invoice.issued_at,
        taxable_supply_date=invoice.taxable_supply_date,
        due_at=invoice.due_at,
        paid_at=invoice.paid_at,
        issuer_name=invoice.issuer_name,
        issuer_address=invoice.issuer_address,
        issuer_ico=invoice.issuer_ico,
        issuer_dic=invoice.issuer_dic,
        issuer_iban=invoice.issuer_iban,
        issuer_account_domestic=invoice.issuer_account_domestic,
        issuer_register_text=invoice.issuer_register_text,
        issuer_is_vat_payer=invoice.issuer_is_vat_payer,
        customer_name=invoice.customer_name,
        customer_address=invoice.customer_address,
        customer_ico=invoice.customer_ico,
        customer_dic=invoice.customer_dic,
        customer_email=invoice.customer_email,
        currency=invoice.currency,
        subtotal_minor=invoice.subtotal_minor,
        vat_amount_minor=invoice.vat_amount_minor,
        total_minor=invoice.total_minor,
        vat_rate_percent=invoice.vat_rate_percent,
        payment_method=invoice.payment_method,
        note=invoice.note,
        sent_at=invoice.sent_at,
        sent_to_email=invoice.sent_to_email,
        pdf_object_key=invoice.pdf_object_key,
        pdf_sha256=invoice.pdf_sha256,
        pdf_size_bytes=invoice.pdf_size_bytes,
        isdoc_object_key=invoice.isdoc_object_key,
        isdoc_sha256=invoice.isdoc_sha256,
        lines=[AdminInvoiceLine.model_validate(li) for li in lines],
        audit_log=[AdminInvoiceAuditEntry.model_validate(row) for row in audit_rows],
    )


# --------------------------------------------------------------------------- #
# Actions (send / mark-paid / void / credit-note)
# --------------------------------------------------------------------------- #


@router.post("/{invoice_id}/mark-paid", response_model=AdminInvoiceDetail)
async def mark_paid(
    invoice_id: uuid.UUID,
    body: AdminMarkPaidIn,
    admin: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db),
) -> AdminInvoiceDetail:
    invoice = await _load_invoice_or_404(session, invoice_id)
    if invoice.status == "paid":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "invoice_already_paid", "message": "Invoice is already paid."},
        )
    if invoice.status == "voided":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "invoice_voided", "message": "Cannot mark voided invoice as paid."},
        )
    svc = InvoiceService()
    await svc.mark_paid(session, invoice_id, paid_at=body.paid_at, by_admin_id=admin.id)
    await session.commit()
    return await get_invoice_detail(invoice_id, _admin=admin, session=session)


@router.post("/{invoice_id}/void", response_model=AdminInvoiceDetail)
async def void_invoice(
    invoice_id: uuid.UUID,
    body: AdminVoidIn,
    admin: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db),
) -> AdminInvoiceDetail:
    invoice = await _load_invoice_or_404(session, invoice_id)
    if invoice.status == "voided":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "invoice_already_voided", "message": "Invoice is already voided."},
        )
    svc = InvoiceService()
    await svc.void(session, invoice_id, reason=body.reason, by_admin_id=admin.id)
    await session.commit()
    return await get_invoice_detail(invoice_id, _admin=admin, session=session)


@router.post("/{invoice_id}/credit-note", response_model=AdminInvoiceDetail)
async def issue_credit_note(
    invoice_id: uuid.UUID,
    body: AdminCreditNoteIn,
    admin: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db),
) -> AdminInvoiceDetail:
    """Issue a credit-note row referencing this invoice. Returns the
    detail of the **new credit-note** invoice (not the original)."""
    await _load_invoice_or_404(session, invoice_id)
    svc = InvoiceService()
    lines_in = [
        ManualLineIn(
            description=li.description,
            quantity=li.quantity,
            unit_price_minor=li.unit_price_minor,
            unit_label=li.unit_label,
            vat_rate_percent=li.vat_rate_percent,
        )
        for li in body.lines
    ]
    try:
        credit = await svc.issue_credit_note(
            session,
            original_invoice_id=invoice_id,
            lines_in=lines_in,
            reason=body.reason,
            by_admin_id=admin.id,
        )
    except CreditNoteExceedsOriginalError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "credit_exceeds_original",
                "message": str(exc),
            },
        ) from exc
    await session.commit()
    return await get_invoice_detail(credit.id, _admin=admin, session=session)


@router.post("/{invoice_id}/send", response_model=AdminInvoiceDetail)
async def send_invoice(
    invoice_id: uuid.UUID,
    body: AdminSendIn,
    admin: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_db),
) -> AdminInvoiceDetail:
    invoice = await _load_invoice_or_404(session, invoice_id)
    if invoice.status == "draft":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "invoice_is_draft", "message": "Cannot send a draft invoice."},
        )
    mailer = InvoiceMailer()
    try:
        await mailer.send(session, invoice, override_to=body.override_to, actor_user_id=admin.id)
    except InvoiceMailerError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "invoice_send_failed", "message": str(exc)},
        ) from exc
    await session.commit()
    return await get_invoice_detail(invoice_id, _admin=admin, session=session)


__all__ = cast("list[str]", ["router"])


# Suppress unused-import warning when running via mypy strict — Decimal
# is referenced indirectly through the schema validators above.
_ = Decimal
