"""Customer-facing tax-invoice endpoints.

Three routes under `/api/v1/organizations/current/invoices`:

  * `GET ` — paginated summary list (drafts excluded; those belong to
    the founder's review queue, not the customer's history)
  * `GET /{id}` — full row + lines, hash-verified PDF available via
    the streaming sibling
  * `GET /{id}/pdf` — streams `application/pdf` from `InvoiceStorage`
    (which recomputes SHA-256 before returning bytes)

All routes are scoped to the caller's organization. Cross-org access
returns 403 — the path doesn't accept an org_id; we read the user's
organization from `require_org_membership`.
"""

from __future__ import annotations

import uuid
from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import require_org_membership
from app.db import get_db
from app.db.models import Invoice, User
from app.schemas.invoicing import (
    TaxInvoiceDetailOut,
    TaxInvoiceLineOut,
    TaxInvoiceList,
    TaxInvoiceOut,
)
from app.services.invoicing.storage import IntegrityError, InvoiceStorage

router = APIRouter(
    prefix="/organizations/current/invoices",
    tags=["invoices"],
)


@router.get("", response_model=TaxInvoiceList)
async def list_my_invoices(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(require_org_membership),
    session: AsyncSession = Depends(get_db),
) -> TaxInvoiceList:
    """Paginated list of the caller's organization's tax invoices.
    Drafts are excluded from the customer surface — those are the
    founder's review queue."""
    base = (
        select(Invoice)
        .where(Invoice.organization_id == user.organization_id)
        .where(Invoice.status != "draft")
    )
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    items = (
        (await session.execute(base.order_by(Invoice.issued_at.desc()).limit(limit).offset(offset)))
        .scalars()
        .all()
    )
    return TaxInvoiceList(
        items=[TaxInvoiceOut.model_validate(inv) for inv in items],
        total=total,
    )


async def _load_my_invoice(session: AsyncSession, *, invoice_id: uuid.UUID, user: User) -> Invoice:
    """Fetch an invoice belonging to the caller's org, with lines
    eagerly loaded. Raises 404 (rather than 403) for cross-org access
    so the response doesn't reveal whether the ID exists."""
    invoice = (
        await session.execute(
            select(Invoice)
            .options(selectinload(Invoice.lines))
            .where(Invoice.id == invoice_id)
            .where(Invoice.organization_id == user.organization_id)
            .where(Invoice.status != "draft")
        )
    ).scalar_one_or_none()
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    return invoice


@router.get("/{invoice_id}", response_model=TaxInvoiceDetailOut)
async def get_my_invoice(
    invoice_id: uuid.UUID,
    user: User = Depends(require_org_membership),
    session: AsyncSession = Depends(get_db),
) -> TaxInvoiceDetailOut:
    invoice = await _load_my_invoice(session, invoice_id=invoice_id, user=user)
    lines = sorted(invoice.lines, key=lambda line_: line_.position)
    return TaxInvoiceDetailOut(
        **TaxInvoiceOut.model_validate(invoice).model_dump(),
        customer_name=invoice.customer_name,
        customer_address=invoice.customer_address,
        customer_ico=invoice.customer_ico,
        customer_dic=invoice.customer_dic,
        taxable_supply_date=invoice.taxable_supply_date,
        variable_symbol=invoice.variable_symbol,
        payment_method=invoice.payment_method,
        note=invoice.note,
        issuer_iban=invoice.issuer_iban,
        issuer_account_domestic=invoice.issuer_account_domestic,
        lines=[TaxInvoiceLineOut.model_validate(line_) for line_ in lines],
    )


@router.get("/{invoice_id}/pdf")
async def get_my_invoice_pdf(
    invoice_id: uuid.UUID,
    user: User = Depends(require_org_membership),
    session: AsyncSession = Depends(get_db),
) -> Response:
    """Stream the archived PDF, hash-verified.

    503 (rather than 200 with corrupted bytes) when the stored bytes
    fail integrity verification — the customer should know something
    is wrong rather than silently file a tampered document."""
    invoice = await _load_my_invoice(session, invoice_id=invoice_id, user=user)
    if invoice.pdf_object_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice has no archived PDF"
        )
    storage = InvoiceStorage()
    try:
        pdf_bytes = storage.fetch_pdf(invoice)
    except IntegrityError as exc:
        # Explicit 503 with a clear code so the frontend can show
        # "kontaktujte podporu" rather than displaying a garbled file.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "invoice_integrity_failure",
                "message": "Stored PDF failed integrity verification.",
            },
        ) from exc
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="Faktura-{invoice.number}.pdf"',
            "Cache-Control": "private, no-store",
        },
    )


__all__ = cast("list[str]", ["router"])
