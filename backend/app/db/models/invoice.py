"""Tax-invoice document model — distinct from `Charge` (ComGate attempt log).

This row represents a Czech-law-compliant *faktura* (or *daňový doklad*
when the seller is a DPH plátce). Once `status` leaves ``'draft'`` the
row's content is locked at the database level by the
``trg_invoice_immutable`` trigger; corrections are issued as separate
rows with ``kind='credit_note'`` referencing the original.

See `docs/prompts/INVOICES_TASK.md` for the full requirement set
(§ 11 zákona o účetnictví, § 435 občanského zákoníku, § 29 zákona o DPH).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.invoice_line import InvoiceLine


class Invoice(Base):
    """Czech-law tax-invoice document.

    Field groupings:
      * **Sequencing** — gap-free per kalendářní rok via ``InvoiceCounter``;
        ``number = f"{year}-{seq:04d}"``, ``variable_symbol`` is the same
        with the dash stripped.
      * **Status / kind** — ``draft → issued → paid|overdue|voided``.
        ``kind`` discriminates ``invoice`` / ``credit_note`` / ``proforma``.
      * **Dates** — ``issued_at`` (datum vystavení), ``taxable_supply_date``
        (DUZP), ``due_at`` (splatnost; default issued + 14d).
      * **Issuer snapshot** — copied from ``BillingSettings`` at issuance
        so future settings changes don't retroactively rewrite invoices.
      * **Customer snapshot** — copied from ``Organization`` at issuance,
        same reasoning.
      * **Money** — minor units (haléře) as ``int``; never floats.
      * **Storage** — ``pdf_object_key`` + ``pdf_sha256`` written once at
        issuance; the storage layer verifies the hash on every fetch.
    """

    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint("year", "sequence_in_year", name="uq_invoices_year_seq"),
        Index("ix_invoices_org_issued", "organization_id", "issued_at"),
        Index("ix_invoices_year_status", "year", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Customer (the org being billed) + the subscription/charge that
    # triggered this invoice. `charge_id` is NULL for manually-issued
    # invoices (e.g. comp-org refunds, custom corrections).
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("subscriptions.id"),
        index=True,
    )
    charge_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("charges.id"),
        index=True,
    )

    # Sequencing
    number: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    sequence_in_year: Mapped[int] = mapped_column(Integer, nullable=False)
    variable_symbol: Mapped[str] = mapped_column(String(16), nullable=False)

    # Status / kind / linkage
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, server_default="invoice")
    related_invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("invoices.id"),
    )

    # Dates
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    taxable_supply_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_at: Mapped[date] = mapped_column(Date, nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Issuer snapshot (frozen at issuance)
    issuer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    issuer_address: Mapped[str] = mapped_column(Text, nullable=False)
    issuer_ico: Mapped[str] = mapped_column(String(8), nullable=False)
    issuer_dic: Mapped[str | None] = mapped_column(String(16))
    issuer_iban: Mapped[str] = mapped_column(String(34), nullable=False)
    issuer_account_domestic: Mapped[str | None] = mapped_column(String(32))
    issuer_register_text: Mapped[str] = mapped_column(Text, nullable=False)
    issuer_is_vat_payer: Mapped[bool] = mapped_column(Boolean, nullable=False)

    # Customer snapshot (frozen)
    customer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    customer_address: Mapped[str] = mapped_column(Text, nullable=False)
    customer_ico: Mapped[str | None] = mapped_column(String(8))
    customer_dic: Mapped[str | None] = mapped_column(String(16))
    customer_email: Mapped[str | None] = mapped_column(String(120))

    # Money — minor units (haléře), int only
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default="CZK")
    subtotal_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    vat_amount_minor: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    total_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    vat_rate_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, server_default="0.00"
    )

    # Storage — written by InvoiceStorage at issuance
    pdf_object_key: Mapped[str | None] = mapped_column(String(300))
    pdf_sha256: Mapped[str | None] = mapped_column(String(64))
    pdf_size_bytes: Mapped[int | None] = mapped_column(Integer)
    isdoc_object_key: Mapped[str | None] = mapped_column(String(300))
    isdoc_sha256: Mapped[str | None] = mapped_column(String(64))

    # Notes / dispatch
    note: Mapped[str | None] = mapped_column(Text)
    payment_method: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default="bank_transfer"
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sent_to_email: Mapped[str | None] = mapped_column(String(120))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    lines: Mapped[list[InvoiceLine]] = relationship(
        back_populates="invoice",
        cascade="all, delete-orphan",
        order_by="InvoiceLine.position",
    )
