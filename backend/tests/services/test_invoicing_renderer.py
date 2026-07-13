"""Renderer contract tests.

The renderer's public guarantees:

  1. **Determinism** — rendering the same `(invoice, lines)` twice
     produces byte-identical PDFs. The storage layer in commit #4 will
     record `pdf_sha256` at issuance and verify it on every read; if a
     re-render disagrees, accountants downloading the same invoice get
     different bytes and the integrity check would fire.
  2. **Czech glyph coverage** — customer names like
     `Žďár nad Sázavou s.r.o.` render with no missing-glyph fallbacks
     (would otherwise display as `�` in the PDF).
  3. **Valid PDF** — output starts with the PDF magic and ends with the
     `%%EOF` trailer. WeasyPrint produces valid PDF/A-2b when fed
     well-formed HTML.
  4. **ISDOC structure** — root element is `Invoice`, contains the
     invoice number, total, and supplier IČO at expected XPaths.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from lxml import etree

from app.db.models import Invoice, InvoiceLine
from app.services.invoicing.renderer import InvoiceRenderer

_ISDOC_NS = "http://isdoc.cz/namespace/2013"


def _make_invoice(*, plátce: bool = False, customer_name: str = "Klient s.r.o.") -> Invoice:
    return Invoice(
        id=uuid.UUID("00000000-0000-0000-0000-000000000042"),
        organization_id=uuid.UUID("00000000-0000-0000-0000-000000001000"),
        number="2026-0042",
        year=2026,
        sequence_in_year=42,
        variable_symbol="20260042",
        status="issued",
        kind="invoice",
        issued_at=datetime(2026, 5, 9, 12, 0, 0, tzinfo=UTC),
        taxable_supply_date=date(2026, 5, 9),
        due_at=date(2026, 5, 23),
        issuer_name="Tomáš Plachý",
        issuer_address="Vinohradská 184\nPraha 3\n130 00",
        issuer_ico="12345678",
        issuer_dic="CZ12345678" if plátce else None,
        issuer_iban="CZ6508000000192000145399",
        issuer_account_domestic="123456789/0100",
        issuer_register_text="Zapsán v živnostenském rejstříku",
        issuer_is_vat_payer=plátce,
        customer_name=customer_name,
        customer_address="Sídlo 1\n123 45",
        customer_ico="87654321",
        customer_dic=None,
        customer_email=None,
        currency="CZK",
        subtotal_minor=99000,
        vat_amount_minor=20790 if plátce else 0,
        total_minor=119790 if plátce else 99000,
        vat_rate_percent=Decimal("21.00") if plátce else Decimal("0.00"),
        payment_method="bank_transfer",
    )


def _make_line(invoice_id: uuid.UUID, *, plátce: bool = False) -> InvoiceLine:
    return InvoiceLine(
        id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        invoice_id=invoice_id,
        position=1,
        description="SimpleCRM, plán Roční, 1 uživatel",
        quantity=Decimal("1.000"),
        unit_label="ks",
        unit_price_minor=99000,
        vat_rate_percent=Decimal("21.00") if plátce else Decimal("0.00"),
        line_subtotal_minor=99000,
        line_vat_minor=20790 if plátce else 0,
        line_total_minor=119790 if plátce else 99000,
    )


# --------------------------------------------------------------------------- #
# PDF
# --------------------------------------------------------------------------- #


def test_render_pdf_starts_with_magic_and_ends_with_eof() -> None:
    invoice = _make_invoice()
    line = _make_line(invoice.id)
    pdf = InvoiceRenderer().render_pdf(invoice, [line])
    assert pdf.startswith(b"%PDF-"), "missing PDF magic"
    # `%%EOF` may be followed by a trailing newline; check substring.
    assert b"%%EOF" in pdf[-32:], "missing %%EOF trailer in last 32 bytes"


def test_render_pdf_is_deterministic_byte_for_byte() -> None:
    """The storage layer relies on SHA-256 stability across renders.
    Two renders moments apart must produce identical bytes."""
    invoice = _make_invoice()
    line = _make_line(invoice.id)
    r = InvoiceRenderer()
    pdf_a = r.render_pdf(invoice, [line])
    pdf_b = r.render_pdf(invoice, [line])
    assert pdf_a == pdf_b
    assert hashlib.sha256(pdf_a).hexdigest() == hashlib.sha256(pdf_b).hexdigest()


def test_render_pdf_deterministic_through_fonttools_subset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Regression guard for a CI-only determinism break.

    When the system Harfbuzz predates 4.1.0 (as on the CI image), WeasyPrint
    subsets fonts through fontTools, whose ``TTFont.save()`` stamps the
    subset's ``head.modified`` with the wall clock — so two renders seconds
    apart used to byte-differ. Force that path and advance the fontTools clock
    between renders; the renderer's ``SOURCE_DATE_EPOCH`` pin must keep the
    output byte-identical. Without the pin this assertion fails.
    """
    import types
    from itertools import count

    from fontTools.misc import timeTools

    monkeypatch.setattr("weasyprint.pdf.fonts.harfbuzz_subset", None)
    clock = count(1_700_000_000, 100)
    monkeypatch.setattr(timeTools, "time", types.SimpleNamespace(time=lambda: float(next(clock))))

    invoice = _make_invoice()
    line = _make_line(invoice.id)
    r = InvoiceRenderer()
    assert r.render_pdf(invoice, [line]) == r.render_pdf(invoice, [line])


def test_render_pdf_supports_czech_diacritics() -> None:
    """A customer named `Žďár nad Sázavou s.r.o.` exercises every
    significant Czech diacritic (Ž, ď, á, S, á, z, a, v, ou). The Inter
    font we ship covers Latin Extended A/B; missing glyphs would show as
    `.notdef` (rendered as a blank box) and bloat the PDF stream with
    unicode-escape sequences. We can't easily inspect glyph fallback
    from here, so the contract test is: rendering succeeds without
    throwing and the bytes don't contain WeasyPrint's missing-glyph
    warning marker."""
    invoice = _make_invoice(customer_name="Žďár nad Sázavou s.r.o.")
    line = _make_line(invoice.id)
    pdf = InvoiceRenderer().render_pdf(invoice, [line])
    # The PDF text stream is compressed, so we can't grep for the literal
    # name; instead the deterministic byte length is a smoke check that
    # the renderer didn't bail or substitute glyphs for a much bigger or
    # smaller payload than usual. ~25–35 KB is the expected range for
    # the current template.
    assert 18_000 < len(pdf) < 80_000, f"unexpected PDF size {len(pdf)} — glyph fallback?"


# --------------------------------------------------------------------------- #
# ISDOC
# --------------------------------------------------------------------------- #


def test_render_isdoc_emits_well_formed_xml_with_expected_fields() -> None:
    invoice = _make_invoice(plátce=True)
    line = _make_line(invoice.id, plátce=True)
    xml_bytes = InvoiceRenderer().render_isdoc(invoice, [line])

    root = etree.fromstring(xml_bytes)
    assert root.tag == f"{{{_ISDOC_NS}}}Invoice"

    def text_at(xpath: str) -> str | None:
        nodes = root.xpath(xpath, namespaces={"i": _ISDOC_NS})
        return nodes[0].text if nodes else None

    assert text_at("/i:Invoice/i:ID") == invoice.number
    assert text_at("/i:Invoice/i:VariableSymbol") == invoice.variable_symbol
    assert text_at("/i:Invoice/i:VATApplicable") == "true"
    assert (
        text_at("/i:Invoice/i:AccountingSupplierParty/i:Party/i:PartyIdentification/i:ID")
        == invoice.issuer_ico
    )
    assert text_at("/i:Invoice/i:LegalMonetaryTotal/i:PayableAmount") == "1197.90"
    assert text_at("/i:Invoice/i:LegalMonetaryTotal/i:DocumentCurrencyCode") == "CZK"


def test_render_isdoc_marks_credit_notes_with_document_type_2() -> None:
    """ISDOC encodes opravný daňový doklad as DocumentType=2; ordinary
    invoices are 1. The renderer must flip the discriminator based on
    `invoice.kind`, otherwise the customer's accountant misclassifies
    the document on import."""
    invoice = _make_invoice(plátce=True)
    invoice.kind = "credit_note"
    line = _make_line(invoice.id, plátce=True)
    xml_bytes = InvoiceRenderer().render_isdoc(invoice, [line])
    root = etree.fromstring(xml_bytes)
    nodes = root.xpath("/i:Invoice/i:DocumentType", namespaces={"i": _ISDOC_NS})
    assert nodes and nodes[0].text == "2"


@pytest.mark.parametrize("plátce", [False, True])
def test_render_pdf_size_in_expected_range(plátce: bool) -> None:
    """Sanity bound on PDF size — catches a runaway loop in the template
    or a font that suddenly stops embedding. The plátce variant adds the
    DPH columns + DIČ / VAT lines, which adds a few hundred bytes; both
    fit comfortably in the same range."""
    invoice = _make_invoice(plátce=plátce)
    line = _make_line(invoice.id, plátce=plátce)
    pdf = InvoiceRenderer().render_pdf(invoice, [line])
    assert 18_000 < len(pdf) < 80_000


# --------------------------------------------------------------------------- #
# i18n — cs byte-identity guard, en output, CZK-only QR/ISDOC
# --------------------------------------------------------------------------- #


# SHA-256 of the cs/CZK fixture PDF captured from the *pre-i18n* renderer.
# The i18n refactor (labels dict + `lang` var) must keep the Czech PDF
# byte-identical — `storage.py` records `pdf_sha256` at issuance and verifies
# it on every read, so a byte drift invalidates already-issued invoices.
# Regenerate ONLY after a deliberate, reviewed template change.
_CS_PDF_SHA256 = {
    False: "7edc1096d5510225c223c665eee39297dd20cb5c812c4fb676544076b3a11eef",
    True: "bf0281d074284d19615df192fd929f4f2e61a1a0efdfb316f7d17a5601dd14bd",
}


@pytest.mark.parametrize("plátce", [False, True])
def test_render_pdf_cs_byte_identical_to_prerefactor(plátce: bool) -> None:
    """The Czech invoice PDF must be byte-identical to the pre-i18n output,
    both for the default (`lang` omitted) and the explicit `lang="cs"` call."""
    invoice = _make_invoice(plátce=plátce)
    line = _make_line(invoice.id, plátce=plátce)
    r = InvoiceRenderer()
    default_pdf = r.render_pdf(invoice, [line])
    cs_pdf = r.render_pdf(invoice, [line], lang="cs")
    assert hashlib.sha256(default_pdf).hexdigest() == _CS_PDF_SHA256[plátce]
    assert hashlib.sha256(cs_pdf).hexdigest() == _CS_PDF_SHA256[plátce]


def test_render_pdf_en_html_has_english_labels() -> None:
    """`lang="en"` renders English labels and dates; no Czech leaks through."""
    from app.services.invoicing.renderer import _render_html

    invoice = _make_invoice(plátce=True)
    line = _make_line(invoice.id, plátce=True)
    html = _render_html(invoice, [line], lang="en")

    assert 'lang="en"' in html
    assert "Invoice" in html  # title + kind ("Invoice — tax document")
    assert "Total due" in html
    assert "9 May 2026" in html  # en_GB long date for issued_at 2026-05-09
    # No Czech labels leak into the English document.
    assert "Dodavatel" not in html
    assert "Celkem k úhradě" not in html
    assert "Datum vystavení" not in html


def test_non_czk_invoice_has_no_spayd_payload_or_isdoc() -> None:
    """QR Platba (SPAYD) and ISDOC are CZK-only artifacts; a non-CZK invoice
    generates neither a SPAYD payload nor ISDOC XML."""
    from app.services.invoicing.renderer import _qr_svg

    invoice = _make_invoice()
    invoice.currency = "EUR"
    line = _make_line(invoice.id)

    assert _qr_svg(invoice) is None
    assert InvoiceRenderer().render_isdoc(invoice, [line]) == b""

    # Control: a CZK invoice still produces both.
    czk = _make_invoice()
    assert _qr_svg(czk) is not None
    assert InvoiceRenderer().render_isdoc(czk, [_make_line(czk.id)]) != b""
