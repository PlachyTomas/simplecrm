"""Pydantic schemas for the customer-facing tax-invoice endpoints.

Distinct from `schemas/payments.py:ChargeOut` (ComGate charge attempts)
— these serialize the legal Czech-law tax-invoice document. Two surfaces:

  * `TaxInvoiceOut` — summary, used by the list endpoint
  * `TaxInvoiceDetailOut` — full row + lines, used by the detail
    endpoint
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict


class TaxInvoiceOut(BaseModel):
    """Compact summary for the customer-facing list. Omits the issuer
    snapshot fields (the customer doesn't need to see SimpleCRM's IČO
    in every row) and the storage keys (those are an implementation
    detail of the PDF stream endpoint)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    number: str
    kind: Literal["invoice", "credit_note", "proforma"]
    status: Literal["draft", "issued", "paid", "overdue", "voided"]
    issued_at: datetime
    due_at: date
    paid_at: datetime | None
    sent_at: datetime | None
    currency: str
    subtotal_minor: int
    vat_amount_minor: int
    total_minor: int
    related_invoice_id: uuid.UUID | None


class TaxInvoiceList(BaseModel):
    items: list[TaxInvoiceOut]
    total: int


class TaxInvoiceLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    position: int
    description: str
    quantity: Decimal
    unit_label: str | None
    unit_price_minor: int
    vat_rate_percent: Decimal
    line_subtotal_minor: int
    line_vat_minor: int
    line_total_minor: int


class TaxInvoiceDetailOut(TaxInvoiceOut):
    """Full invoice payload for the detail drawer. Includes line items
    + customer snapshot + payment instructions. Issuer fields are
    omitted from the customer surface for the same reason as in the
    list — the customer cares about *their* details + the total."""

    customer_name: str
    customer_address: str
    customer_ico: str | None
    customer_dic: str | None
    taxable_supply_date: date
    variable_symbol: str
    payment_method: str
    note: str | None
    issuer_iban: str
    issuer_account_domestic: str | None
    lines: list[TaxInvoiceLineOut]
