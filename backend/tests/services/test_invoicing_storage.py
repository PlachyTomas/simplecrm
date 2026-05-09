"""Storage-layer contract tests.

Exercises the local-filesystem backend (S3 path is a thin wrapper over
the same contract; we don't spin up a fake S3 here — that's an
integration test for a later commit). The contract:

  1. store_pdf/store_isdoc returns a StorageResult with the SHA-256 +
     byte size of the input.
  2. fetch_pdf/fetch_isdoc returns the same bytes back as long as the
     stored content matches the recorded hash.
  3. Tampering with the stored bytes (or the recorded hash) makes
     fetch raise IntegrityError carrying both the expected and actual
     digests.
  4. Object keys are scoped by year + customer org so two customers'
     invoices never collide on the same number.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path

import pytest

from app.core.config import Settings
from app.db.models import Invoice
from app.services.invoicing.storage import IntegrityError, InvoiceStorage


def _local_settings(tmp_path: Path) -> Settings:
    return Settings(
        s3_endpoint_url="",
        s3_bucket_invoices="",
        invoice_storage_local_root=str(tmp_path / "invoices"),
    )


def _make_invoice(*, number: str = "2026-0001", year: int = 2026) -> Invoice:
    return Invoice(
        id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        number=number,
        year=year,
        sequence_in_year=int(number.split("-")[1]),
        variable_symbol=number.replace("-", ""),
        status="issued",
        kind="invoice",
        issued_at=datetime(year, 5, 9, 12, 0, tzinfo=UTC),
        taxable_supply_date=date(year, 5, 9),
        due_at=date(year, 5, 23),
        issuer_name="T",
        issuer_address="A",
        issuer_ico="12345678",
        issuer_iban="CZ6508000000192000145399",
        issuer_register_text="r",
        issuer_is_vat_payer=False,
        customer_name="C",
        customer_address="B",
        currency="CZK",
        subtotal_minor=99000,
        vat_amount_minor=0,
        total_minor=99000,
        vat_rate_percent=Decimal("0.00"),
        payment_method="bank_transfer",
    )


# --------------------------------------------------------------------------- #
# Round-trip
# --------------------------------------------------------------------------- #


def test_local_store_and_fetch_pdf_round_trip(tmp_path: Path) -> None:
    invoice = _make_invoice()
    storage = InvoiceStorage(_local_settings(tmp_path))
    pdf_bytes = b"%PDF-1.7\n... fake bytes ...\n%%EOF\n"

    result = storage.store_pdf(invoice, pdf_bytes)
    assert result.object_key.endswith(".pdf")
    assert result.size_bytes == len(pdf_bytes)
    assert result.sha256 == hashlib.sha256(pdf_bytes).hexdigest()

    # Wire the result onto the Invoice the way the orchestrator will do it
    # in commit #5, then fetch.
    invoice.pdf_object_key = result.object_key
    invoice.pdf_sha256 = result.sha256
    invoice.pdf_size_bytes = result.size_bytes

    assert storage.fetch_pdf(invoice) == pdf_bytes


def test_local_store_and_fetch_isdoc_round_trip(tmp_path: Path) -> None:
    invoice = _make_invoice()
    storage = InvoiceStorage(_local_settings(tmp_path))
    xml = b'<?xml version="1.0" encoding="UTF-8"?>\n<Invoice/>'

    result = storage.store_isdoc(invoice, xml)
    assert result.object_key.endswith(".isdoc.xml")

    invoice.isdoc_object_key = result.object_key
    invoice.isdoc_sha256 = result.sha256
    assert storage.fetch_isdoc(invoice) == xml


# --------------------------------------------------------------------------- #
# Object-key scoping
# --------------------------------------------------------------------------- #


def test_object_keys_are_scoped_by_year_and_org(tmp_path: Path) -> None:
    """Two customers can issue invoice number 2026-0001 in their own
    yearly sequence (the seller's sequence is global, but the storage
    key still encodes the customer org so multi-tenant migrations don't
    clash). Verify that the keys differ."""
    inv_a = _make_invoice(number="2026-0001")
    inv_b = _make_invoice(number="2026-0001")
    storage = InvoiceStorage(_local_settings(tmp_path))
    a = storage.store_pdf(inv_a, b"a")
    b = storage.store_pdf(inv_b, b"b")
    assert a.object_key != b.object_key
    assert str(inv_a.organization_id) in a.object_key
    assert str(inv_b.organization_id) in b.object_key


# --------------------------------------------------------------------------- #
# Integrity verification
# --------------------------------------------------------------------------- #


def test_fetch_raises_integrity_error_when_bytes_corrupted_on_disk(
    tmp_path: Path,
) -> None:
    """Stored PDF tampered with in the filesystem → fetch raises
    IntegrityError with both digests in scope. The audit log entry is
    the orchestrator's responsibility (commit #5); here we just verify
    the exception contract."""
    invoice = _make_invoice()
    storage = InvoiceStorage(_local_settings(tmp_path))
    pdf_bytes = b"%PDF-1.7 original"
    result = storage.store_pdf(invoice, pdf_bytes)
    invoice.pdf_object_key = result.object_key
    invoice.pdf_sha256 = result.sha256

    # Tamper.
    on_disk = tmp_path / "invoices" / result.object_key
    on_disk.write_bytes(b"%PDF-1.7 tampered")

    with pytest.raises(IntegrityError) as exc_info:
        storage.fetch_pdf(invoice)

    err = exc_info.value
    assert err.expected == result.sha256
    assert err.actual == hashlib.sha256(b"%PDF-1.7 tampered").hexdigest()
    assert err.object_key == result.object_key


def test_fetch_raises_when_recorded_hash_doesnt_match_actual(tmp_path: Path) -> None:
    """If the DB row's pdf_sha256 was set wrong somehow (bug, manual
    SQL), fetch surfaces the mismatch — same code path, different cause.
    Belt-and-suspenders check."""
    invoice = _make_invoice()
    storage = InvoiceStorage(_local_settings(tmp_path))
    pdf_bytes = b"%PDF correct"
    result = storage.store_pdf(invoice, pdf_bytes)
    invoice.pdf_object_key = result.object_key
    invoice.pdf_sha256 = "0" * 64  # deliberately wrong

    with pytest.raises(IntegrityError):
        storage.fetch_pdf(invoice)


def test_fetch_raises_filenotfound_when_no_stored_key(tmp_path: Path) -> None:
    """Calling fetch on an invoice whose pdf_object_key is NULL is a
    programming error in the orchestrator. Surface a FileNotFoundError
    rather than silently returning nothing."""
    invoice = _make_invoice()
    invoice.pdf_object_key = None
    invoice.pdf_sha256 = None
    storage = InvoiceStorage(_local_settings(tmp_path))
    with pytest.raises(FileNotFoundError):
        storage.fetch_pdf(invoice)


def test_store_pdf_is_idempotent_for_same_input(tmp_path: Path) -> None:
    """Re-storing the same bytes under the same key is a no-op from the
    consumer's perspective (same hash, same size, same key). Important
    because the orchestrator might retry on a transient error during
    issuance and we don't want a partial-write to leave inconsistent
    state on disk."""
    invoice = _make_invoice()
    storage = InvoiceStorage(_local_settings(tmp_path))
    pdf = b"%PDF stable"
    a = storage.store_pdf(invoice, pdf)
    b = storage.store_pdf(invoice, pdf)
    assert a == b
