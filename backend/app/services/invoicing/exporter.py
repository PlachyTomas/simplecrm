"""Year-end export bundles — accountant takes one ZIP, walks away.

Three flavours of export, all keyed by calendar year:

  - **CSV** — one row per invoice. Czech-friendly: semicolon delimiter,
    UTF-8 BOM-prefixed so Excel cs-CZ opens it correctly without an
    import wizard.
  - **PDF ZIP** — every issued/paid PDF for the year, hash-verified at
    fetch.
  - **Full** — both of the above plus per-invoice ISDOC XMLs, all in
    one archive. This is the bundle the accountant actually wants.

Voided invoices stay in the export — the accountant needs to see them
to reconcile. Drafts are skipped (they aren't legal documents yet).

Each export run logs an `export_run` row in `invoice_audit_log` with
the year + kind + row_count payload.
"""

from __future__ import annotations

import csv
import io
import logging
import uuid
import zipfile
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Invoice, InvoiceAuditLog
from app.services.invoicing.storage import InvoiceStorage

logger = logging.getLogger(__name__)

ExportKind = Literal["csv", "pdf_zip", "full"]


CSV_HEADERS = [
    "Číslo",
    "Druh",
    "Stav",
    "Datum vystavení",
    "DUZP",
    "Splatnost",
    "Datum úhrady",
    "Měna",
    "Základ",
    "DPH",
    "Celkem",
    "Zákazník",
    "IČO",
    "DIČ",
]


KIND_LABEL = {"invoice": "Faktura", "credit_note": "Dobropis", "proforma": "Proforma"}
STATUS_LABEL = {
    "draft": "Koncept",
    "issued": "Vystavena",
    "paid": "Zaplacena",
    "overdue": "Po splatnosti",
    "voided": "Stornována",
}


async def _select_year(session: AsyncSession, year: int) -> list[Invoice]:
    """All non-draft invoices issued during `year`, ordered by issue date."""
    stmt = (
        select(Invoice)
        .where(Invoice.year == year)
        .where(Invoice.status != "draft")
        .order_by(Invoice.issued_at.asc())
    )
    return list((await session.execute(stmt)).scalars().all())


def _fmt_minor(amount_minor: int) -> str:
    """Czech-locale numeric: `123,45` (no thousand separator — it
    confuses CSV parsers; Excel cs-CZ infers grouping itself)."""
    sign = "-" if amount_minor < 0 else ""
    abs_minor = abs(amount_minor)
    return f"{sign}{abs_minor // 100},{abs_minor % 100:02d}"


def _csv_row(invoice: Invoice) -> list[str]:
    return [
        invoice.number,
        KIND_LABEL.get(invoice.kind, invoice.kind),
        STATUS_LABEL.get(invoice.status, invoice.status),
        invoice.issued_at.date().isoformat(),
        invoice.taxable_supply_date.isoformat(),
        invoice.due_at.isoformat(),
        invoice.paid_at.date().isoformat() if invoice.paid_at else "",
        invoice.currency,
        _fmt_minor(invoice.subtotal_minor),
        _fmt_minor(invoice.vat_amount_minor),
        _fmt_minor(invoice.total_minor),
        invoice.customer_name,
        invoice.customer_ico or "",
        invoice.customer_dic or "",
    ]


async def build_csv(session: AsyncSession, year: int, *, actor_user_id: uuid.UUID) -> bytes:
    """Build the year's CSV export as a single bytes payload.

    Inlined buffer rather than streaming — the row count for one year
    is bounded (a few hundred at our scale). If we ever cross 50k rows
    in a year we can switch to a streaming generator.
    """
    invoices = await _select_year(session, year)

    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";", quoting=csv.QUOTE_MINIMAL)
    writer.writerow(CSV_HEADERS)
    for invoice in invoices:
        writer.writerow(_csv_row(invoice))

    # UTF-8 BOM so Excel cs-CZ opens it directly.
    payload = "﻿" + buf.getvalue()

    session.add(
        InvoiceAuditLog(
            invoice_id=None,
            event="export_run",
            actor_user_id=actor_user_id,
            payload={"year": year, "kind": "csv", "row_count": len(invoices)},
        )
    )
    await session.flush()
    return payload.encode("utf-8")


def _add_zip_entry(zf: zipfile.ZipFile, name: str, data: bytes) -> None:
    info = zipfile.ZipInfo(filename=name)
    info.compress_type = zipfile.ZIP_DEFLATED
    # Pin the timestamp so the same input produces a byte-identical zip
    # — useful for the integrity dashboard (#12) which hashes archives.
    info.date_time = (1980, 1, 1, 0, 0, 0)
    zf.writestr(info, data)


async def build_pdf_zip(
    session: AsyncSession,
    year: int,
    *,
    actor_user_id: uuid.UUID,
    storage: InvoiceStorage | None = None,
) -> bytes:
    """ZIP of every PDF for the year, hash-verified on fetch."""
    invoices = await _select_year(session, year)
    storage = storage or InvoiceStorage()

    buf = io.BytesIO()
    fetched = 0
    skipped = 0
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for invoice in invoices:
            if invoice.pdf_object_key is None:
                # Defence-in-depth: status filter excludes drafts but a
                # paid-but-pdf-missing row (data corruption) shouldn't
                # crash the export. Skip + count.
                skipped += 1
                continue
            try:
                pdf_bytes = storage.fetch_pdf(invoice)
            except Exception:
                logger.exception("export PDF fetch failed for %s", invoice.number)
                skipped += 1
                continue
            _add_zip_entry(zf, f"{year}/{invoice.number}.pdf", pdf_bytes)
            fetched += 1

    session.add(
        InvoiceAuditLog(
            invoice_id=None,
            event="export_run",
            actor_user_id=actor_user_id,
            payload={
                "year": year,
                "kind": "pdf_zip",
                "row_count": fetched,
                "skipped": skipped,
            },
        )
    )
    await session.flush()
    return buf.getvalue()


async def build_full_zip(
    session: AsyncSession,
    year: int,
    *,
    actor_user_id: uuid.UUID,
    storage: InvoiceStorage | None = None,
) -> bytes:
    """Combined ZIP — the bundle the accountant actually wants:
    `prehled.csv` + `{number}.pdf` + `{number}.isdoc.xml` per invoice."""
    invoices = await _select_year(session, year)
    storage = storage or InvoiceStorage()

    # Inline the CSV (don't reuse `build_csv` — its audit-log write
    # would double-record under a different `kind`).
    csv_buf = io.StringIO()
    writer = csv.writer(csv_buf, delimiter=";", quoting=csv.QUOTE_MINIMAL)
    writer.writerow(CSV_HEADERS)
    for invoice in invoices:
        writer.writerow(_csv_row(invoice))
    csv_bytes = ("﻿" + csv_buf.getvalue()).encode("utf-8")

    buf = io.BytesIO()
    pdf_count = 0
    isdoc_count = 0
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        _add_zip_entry(zf, f"{year}/prehled.csv", csv_bytes)
        for invoice in invoices:
            if invoice.pdf_object_key is not None:
                try:
                    _add_zip_entry(
                        zf,
                        f"{year}/{invoice.number}.pdf",
                        storage.fetch_pdf(invoice),
                    )
                    pdf_count += 1
                except Exception:
                    logger.exception("export PDF fetch failed for %s", invoice.number)
            if invoice.isdoc_object_key is not None:
                try:
                    _add_zip_entry(
                        zf,
                        f"{year}/{invoice.number}.isdoc.xml",
                        storage.fetch_isdoc(invoice),
                    )
                    isdoc_count += 1
                except Exception:
                    logger.exception("export ISDOC fetch failed for %s", invoice.number)

    session.add(
        InvoiceAuditLog(
            invoice_id=None,
            event="export_run",
            actor_user_id=actor_user_id,
            payload={
                "year": year,
                "kind": "full",
                "row_count": len(invoices),
                "pdfs": pdf_count,
                "isdocs": isdoc_count,
            },
        )
    )
    await session.flush()
    return buf.getvalue()


__all__ = [
    "ExportKind",
    "build_csv",
    "build_full_zip",
    "build_pdf_zip",
]
