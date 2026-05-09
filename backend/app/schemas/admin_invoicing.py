"""Pydantic schemas for the super-admin tax-invoice surfaces.

The customer surface schemas in `schemas/invoicing.py` deliberately
omit issuer snapshot + storage fields; the admin surface needs them
visible (the founder is the issuer). Hence these distinct types
rather than reusing `TaxInvoiceOut`.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class AdminInvoiceListItem(BaseModel):
    """Compact row for the admin list table — adds organization name +
    customer name to what the customer-facing list shows so the founder
    can pivot across orgs without an extra fetch."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    organization_name: str
    number: str
    kind: Literal["invoice", "credit_note", "proforma"]
    status: Literal["draft", "issued", "paid", "overdue", "voided"]
    issued_at: datetime
    due_at: date
    paid_at: datetime | None
    sent_at: datetime | None
    customer_name: str
    currency: str
    total_minor: int
    related_invoice_id: uuid.UUID | None


class AdminInvoiceList(BaseModel):
    items: list[AdminInvoiceListItem]
    total: int


class AdminInvoiceLine(BaseModel):
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


class AdminInvoiceAuditEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event: str
    actor_user_id: uuid.UUID | None
    payload: dict[str, Any]
    created_at: datetime


class AdminInvoiceDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    organization_name: str
    subscription_id: uuid.UUID | None
    charge_id: uuid.UUID | None
    number: str
    variable_symbol: str
    kind: Literal["invoice", "credit_note", "proforma"]
    status: Literal["draft", "issued", "paid", "overdue", "voided"]
    related_invoice_id: uuid.UUID | None

    issued_at: datetime
    taxable_supply_date: date
    due_at: date
    paid_at: datetime | None

    issuer_name: str
    issuer_address: str
    issuer_ico: str
    issuer_dic: str | None
    issuer_iban: str
    issuer_account_domestic: str | None
    issuer_register_text: str
    issuer_is_vat_payer: bool

    customer_name: str
    customer_address: str
    customer_ico: str | None
    customer_dic: str | None
    customer_email: str | None

    currency: str
    subtotal_minor: int
    vat_amount_minor: int
    total_minor: int
    vat_rate_percent: Decimal

    payment_method: str
    note: str | None
    sent_at: datetime | None
    sent_to_email: str | None

    pdf_object_key: str | None
    pdf_sha256: str | None
    pdf_size_bytes: int | None
    isdoc_object_key: str | None
    isdoc_sha256: str | None

    lines: list[AdminInvoiceLine]
    audit_log: list[AdminInvoiceAuditEntry]


class AdminMarkPaidIn(BaseModel):
    paid_at: datetime | None = Field(
        default=None,
        description="When the payment was received. NULL → server-side now().",
    )


class AdminVoidIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class AdminCreditNoteLineIn(BaseModel):
    description: str = Field(min_length=1, max_length=500)
    quantity: Decimal
    unit_price_minor: int = Field(le=0, description="Must be ≤ 0 for a credit")
    unit_label: str | None = Field(default=None, max_length=32)
    vat_rate_percent: Decimal | None = None


class AdminCreditNoteIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)
    lines: list[AdminCreditNoteLineIn]


class AdminSendIn(BaseModel):
    override_to: str | None = Field(
        default=None,
        max_length=120,
        description="Override the invoice's recorded customer email.",
    )


class AdminManualLineIn(BaseModel):
    description: str = Field(min_length=1, max_length=500)
    quantity: Decimal = Field(gt=0)
    unit_price_minor: int = Field(ge=0)
    unit_label: str | None = Field(default=None, max_length=32)
    vat_rate_percent: Decimal | None = None


class AdminManualInvoiceIn(BaseModel):
    org_id: uuid.UUID
    lines: list[AdminManualLineIn] = Field(min_length=1, max_length=50)
    note: str | None = Field(default=None, max_length=2000)
    taxable_supply_date: date | None = None
    due_at: date | None = None


class AdminIntegrityFailure(BaseModel):
    invoice_id: uuid.UUID
    invoice_number: str
    kind: Literal["pdf", "isdoc"]
    error: str


class AdminIntegrityRunOut(BaseModel):
    run_id: uuid.UUID
    checked: int
    ok: int
    failed: int
    failures: list[AdminIntegrityFailure]
    created_at: datetime | None = None
