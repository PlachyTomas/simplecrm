"""Invoice line item — child rows of `Invoice`.

Lines inherit the parent's immutability: once the parent's ``status``
leaves ``'draft'``, the ``trg_invoice_line_immutable`` trigger blocks
every UPDATE to a line row. INSERT is allowed only while the parent is
still draft (line rows are written alongside the parent in a single
transaction during issuance).
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.invoice import Invoice


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"
    __table_args__ = (Index("ix_invoice_lines_invoice_id", "invoice_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("invoices.id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    # Numeric(10, 3) supports fractional users / partial periods without
    # surprising rounding (e.g. 0.5 měsíc, 7.333 uživatelů for proration).
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    unit_label: Mapped[str | None] = mapped_column(String(32))
    unit_price_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    vat_rate_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, server_default="0.00"
    )
    line_subtotal_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    line_vat_minor: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    line_total_minor: Mapped[int] = mapped_column(Integer, nullable=False)

    invoice: Mapped[Invoice] = relationship(back_populates="lines")
