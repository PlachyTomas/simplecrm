"""Tax-invoice renderer.

Renders a Czech-law-compliant *faktura* (or *daňový doklad* when the
issuer is a DPH plátce) as a PDF/A-2b byte string, plus an ISDOC 6.0.1
XML representation for accountants whose software consumes it
(Pohoda, Money S3, ABRA Flexi, iÚčto).

**Determinism contract.** `render_pdf(invoice, lines)` produces
byte-identical output for the same `(invoice, lines)` input, because
`storage.py` records `pdf_sha256` at issuance and verifies the hash on
every read. The contract is preserved by:

  - Pinning WeasyPrint to a narrow version range in `pyproject.toml`
    (`>=63.0,<64`). PDF byte layout can shift across feature releases
    even when the rendered page is visually identical.
  - Passing `attachments=[]` and a fixed `pdf_creation_date` derived
    from `invoice.issued_at` (so two renders moments apart still match).
  - Embedding all fonts via `@font-face` in the template — no system
    fonts, no fallback.
  - Pinning ``SOURCE_DATE_EPOCH`` (see below) so the embedded font
    subsets carry a fixed ``head.modified`` timestamp instead of the
    wall clock.
  - Disabling presentational-hints heuristics (`presentational_hints=False`
    is the WeasyPrint default; we don't override).

**ISDOC.** Minimal compliant subset per the ISDOC 6.0.1 schema. Captures
invoice number, dates (issued, supply, due), supplier (issuer), customer,
line items (with VAT when plátce), and totals. Optional fields the
accountant doesn't need are omitted to keep the document small.
"""

from __future__ import annotations

import os
from collections.abc import Callable, Iterable
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from typing import TYPE_CHECKING, Any

import pydyf
from babel.dates import format_date
from babel.numbers import format_currency, format_decimal
from jinja2 import Environment, FileSystemLoader, select_autoescape
from lxml import etree
from qrplatba import QRPlatbaGenerator
from weasyprint import HTML

from app.core.i18n import t

if TYPE_CHECKING:
    from app.db.models import Invoice, InvoiceLine

_TEMPLATES_DIR = Path(__file__).parent / "templates"
_FONTS_DIR = _TEMPLATES_DIR / "fonts"

# WeasyPrint's fontTools subset fallback (taken when the system harfbuzz
# predates 4.1.0, as on CI) stamps each subset's head.modified with the wall
# clock, so renders seconds apart byte-differ and break the pdf_sha256
# integrity check. fontTools honours SOURCE_DATE_EPOCH for that timestamp;
# setdefault respects a value a reproducible-build pipeline already set.
os.environ.setdefault("SOURCE_DATE_EPOCH", "1577836800")  # 2020-01-01T00:00:00Z

# ISDOC 6.0.1 namespace.
_ISDOC_NS = "http://isdoc.cz/namespace/2013"
_NSMAP: dict[str | None, str] = {None: _ISDOC_NS}


# --------------------------------------------------------------------------- #
# Locale formatters
# --------------------------------------------------------------------------- #

# UI language -> Babel locale for money / quantity / date formatting.
BABEL_LOCALE = {"cs": "cs_CZ", "en": "en_GB"}


def formatters(
    lang: str,
) -> tuple[Callable[..., str], Callable[..., str], Callable[..., str]]:
    """Return ``(fmt_money, fmt_qty, fmt_date)`` closures bound to ``lang``'s
    Babel locale.

    Shared by the invoice PDF renderer and the invoice mailer, so a document
    and its accompanying e-mail format money / quantities / dates identically.
    ``lang`` is one of ``BABEL_LOCALE``'s keys ("cs"/"en"); callers resolve it
    via ``app.core.i18n.language_for_locale``.
    """
    babel_locale = BABEL_LOCALE[lang]

    def fmt_money(amount_minor: int, currency: str = "CZK") -> str:
        """`12 345,00 Kč` (cs) for 1 234 500 minor units, per ``lang``'s locale."""
        amount = Decimal(amount_minor) / Decimal(100)
        return format_currency(amount, currency, locale=babel_locale)

    def fmt_qty(value: Decimal | int | float) -> str:
        """Quantity with the locale's decimal separator, trailing zeros stripped
        (e.g. cs "1,000" → "1", "1,500" → "1,5")."""
        if not isinstance(value, Decimal):
            value = Decimal(str(value))
        return format_decimal(value.normalize(), locale=babel_locale)

    def fmt_date(value: date | datetime) -> str:
        """Long-form localized date (`9. května 2026` cs / `9 May 2026` en)."""
        if isinstance(value, datetime):
            value = value.date()
        return format_date(value, format="long", locale=babel_locale)

    return fmt_money, fmt_qty, fmt_date


# --------------------------------------------------------------------------- #
# Invoice-template labels
# --------------------------------------------------------------------------- #

# Static invoice-template labels — value comes verbatim from the
# ``(lang, "invoice")`` catalog. Interpolated labels (title, vatRow) are added
# per-render because they close over invoice-specific values.
_STATIC_LABEL_KEYS: tuple[str, ...] = (
    "kindVatInvoice",
    "kindVatProforma",
    "kindVatCreditNote",
    "kindInvoice",
    "kindProforma",
    "kindCreditNote",
    "relatedNote",
    "supplier",
    "customer",
    "ico",
    "dic",
    "issueDate",
    "taxSupplyDate",
    "dueDate",
    "description",
    "quantity",
    "unitPrice",
    "vatRate",
    "total",
    "taxBase",
    "totalDue",
    "bankDetails",
    "iban",
    "account",
    "variableSymbol",
    "paymentMethod",
    "paymentCard",
    "qrPlatba",
    "paymentBankTransfer",
    "nonVatNotice",
    "footerThanks",
)


def _invoice_labels(lang: str, invoice: Invoice, fmt_qty: Callable[..., str]) -> dict[str, str]:
    """Build the invoice template's label dict for ``lang`` from the catalog."""
    labels = {key: t(lang, f"invoice.{key}") for key in _STATIC_LABEL_KEYS}
    labels["title"] = t(lang, "invoice.title", number=invoice.number)
    labels["vatRow"] = t(lang, "invoice.vatRow", rate=fmt_qty(invoice.vat_rate_percent))
    return labels


# --------------------------------------------------------------------------- #
# QR Platba SVG
# --------------------------------------------------------------------------- #


def _qr_svg(invoice: Invoice) -> str | None:
    """Generate a SPAYD-format QR Platba code as an inline `<svg>` string for
    embedding in the PDF template — or ``None`` for non-CZK invoices.

    QR Platba is a Czech domestic-payment standard (SPAYD); it is only valid
    for CZK invoices, so no SPAYD payload is generated for a foreign-currency
    invoice and the template omits the QR block.

    `qrplatba.QRPlatbaGenerator` requires the amount as a `Decimal` (the
    library's SPAYD formatter uses `f"{x:.2f}"` and bombs on `str` input).
    `make_image()` returns a `QRPlatbaSVGImage` whose `.to_string()`
    yields a `bytes` SVG payload — decode to UTF-8 for template insertion.
    """
    if invoice.currency != "CZK":
        return None
    generator = QRPlatbaGenerator(
        account=invoice.issuer_iban,
        amount=Decimal(invoice.total_minor) / Decimal(100),
        currency=invoice.currency,
        x_vs=invoice.variable_symbol,
        message=f"SimpleCRM faktura {invoice.number}",
        due_date=invoice.due_at,
    )
    raw = generator.make_image().to_string()
    return raw.decode("utf-8") if isinstance(raw, bytes) else raw


# --------------------------------------------------------------------------- #
# Jinja2 environment
# --------------------------------------------------------------------------- #


_jinja_env = Environment(
    loader=FileSystemLoader(_TEMPLATES_DIR),
    autoescape=select_autoescape(["html", "j2"]),
    trim_blocks=True,
    lstrip_blocks=True,
)


def _render_html(invoice: Invoice, lines: Iterable[InvoiceLine], lang: str = "cs") -> str:
    """Render the invoice HTML for ``lang`` — the source WeasyPrint turns into
    the PDF. Kept separate from ``render_pdf`` so the localized markup can be
    asserted without the (compressed) PDF byte stream.

    Labels come from the ``(lang, "invoice")`` catalog; money / quantity / date
    use ``lang``'s Babel locale. For ``lang="cs"`` the output is byte-identical
    to the pre-i18n template (labels resolve to the original Czech literals).
    """
    fmt_money, fmt_qty, fmt_date = formatters(lang)
    sorted_lines = sorted(lines, key=lambda line_: line_.position)
    return _jinja_env.get_template("invoice.html.j2").render(
        invoice=invoice,
        lines=sorted_lines,
        qr_svg=_qr_svg(invoice),
        lang=lang,
        labels=_invoice_labels(lang, invoice, fmt_qty),
        fmt_money=lambda minor: fmt_money(minor, invoice.currency),
        fmt_qty=fmt_qty,
        fmt_date=fmt_date,
    )


# --------------------------------------------------------------------------- #
# PDF date pinning
# --------------------------------------------------------------------------- #


def _pin_pdf_dates(when: datetime) -> Any:
    """Return a WeasyPrint `finisher` callable that overwrites the
    PDF's CreationDate / ModDate with `when`.

    PDF Date format per § 7.9.4 of the spec: `D:YYYYMMDDHHmmSS+00'00'`.
    Without this finisher, WeasyPrint stamps `datetime.now()` and two
    renders moments apart byte-differ — breaking the integrity check
    that the storage layer relies on.
    """
    pdf_date_str = when.astimezone(UTC).strftime("D:%Y%m%d%H%M%S+00'00'")

    def _finisher(_document: object, pdf: object) -> None:
        pdf.info["CreationDate"] = pydyf.String(pdf_date_str)  # type: ignore[attr-defined]
        pdf.info["ModDate"] = pydyf.String(pdf_date_str)  # type: ignore[attr-defined]

    return _finisher


# --------------------------------------------------------------------------- #
# Warmup
# --------------------------------------------------------------------------- #


_WARMUP_HTML = """\
<!doctype html>
<html lang="cs"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 20mm; }
body { font-family: sans-serif; font-size: 10pt; }
</style></head><body>
<p>Žďár nad Sázavou — 1 234,56 Kč</p>
</body></html>
"""


def _render_warmup_pdf() -> None:
    """Render a tiny inline-CSS PDF and discard it.

    The point isn't the bytes — it's the side-effects: fontconfig builds
    its in-memory cache, Pango populates its shape-plan cache, and
    fonttools loads the system sans-serif font into RAM. The Czech-glyph
    string in the body ensures the diacritics path warms too, since the
    real invoice template uses Czech text. Without this, the first real
    render in a fresh process byte-differs from every subsequent one.
    """
    HTML(string=_WARMUP_HTML, base_url=str(_TEMPLATES_DIR)).write_pdf()


# --------------------------------------------------------------------------- #
# Renderer
# --------------------------------------------------------------------------- #


class InvoiceRenderer:
    """Stateless renderer; safe to instantiate per request or cache."""

    # Process-wide flag tracking whether WeasyPrint's font / fontconfig
    # state has been warmed. The very first PDF render in a fresh process
    # produces byte-different output from every subsequent render — by 1
    # or 2 bytes in a font subset stream, with the direction of the
    # difference itself non-deterministic across process restarts. The
    # culprit is fontconfig + Pango's lazy initialization on first call:
    # things like the system-wide font cache lookup, glyph fallback
    # discovery, and Harfbuzz shape-plan cache all populate during the
    # first render and stay populated for the rest of the process. We
    # warm them up once at module load (see `_warm_renderer` below); after
    # that every `render_pdf` call is byte-identical for the same input,
    # which `storage.py`'s `pdf_sha256` integrity check requires.
    _warmed = False

    def render_pdf(self, invoice: Invoice, lines: Iterable[InvoiceLine], lang: str = "cs") -> bytes:
        """Render `invoice` to a PDF/A-2b byte string in ``lang`` (cs/en).

        Determinism is enforced by a finisher that pins ``CreationDate``
        and ``ModDate`` to ``invoice.issued_at``. Without the finisher,
        WeasyPrint stamps ``datetime.now()`` into the PDF trailer and
        two renders moments apart would byte-differ — invalidating the
        stored ``pdf_sha256`` on every read. For ``lang="cs"`` the bytes
        are identical to the pre-i18n renderer.
        """
        self._ensure_warm()
        html = _render_html(invoice, lines, lang)
        weasy_html = HTML(string=html, base_url=str(_TEMPLATES_DIR))
        pdf: bytes = weasy_html.write_pdf(finisher=_pin_pdf_dates(invoice.issued_at))
        return pdf

    @classmethod
    def _ensure_warm(cls) -> None:
        """Render a throwaway PDF once per process so font / fontconfig
        caches are populated. See the `_warmed` docstring for why."""
        if cls._warmed:
            return
        cls._warmed = True  # set first so a failed warmup doesn't loop
        _render_warmup_pdf()

    def render_isdoc(self, invoice: Invoice, lines: Iterable[InvoiceLine]) -> bytes:
        """Render `invoice` to an ISDOC 6.0.1 XML byte string.

        ISDOC is a Czech accounting-interchange format; it is only produced for
        CZK invoices. A non-CZK invoice returns ``b""`` and callers must not
        attach an ISDOC document.
        """
        if invoice.currency != "CZK":
            return b""
        return _build_isdoc(invoice, lines).encode("utf-8")


# --------------------------------------------------------------------------- #
# ISDOC builder
# --------------------------------------------------------------------------- #


def _isdoc_id(local: str) -> str:
    """Helper for ISDOC element names (no namespace prefix because the
    default namespace is set at the root)."""
    return f"{{{_ISDOC_NS}}}{local}"


def _build_isdoc(invoice: Invoice, lines: Iterable[InvoiceLine]) -> str:
    root = etree.Element(
        _isdoc_id("Invoice"),
        attrib={"version": "6.0.1"},
        nsmap=_NSMAP,
    )

    def child(parent: etree._Element, name: str, text: str | None = None) -> etree._Element:
        el = etree.SubElement(parent, _isdoc_id(name))
        if text is not None:
            el.text = text
        return el

    # Document identification + dates. ISDOC encodes credit notes as
    # DocumentType=2 (opravný daňový doklad) and ordinary invoices as 1.
    document_type = "2" if invoice.kind == "credit_note" else "1"
    child(root, "DocumentType", document_type)
    child(root, "ID", invoice.number)
    child(root, "VariableSymbol", invoice.variable_symbol)
    child(root, "IssueDate", invoice.issued_at.date().isoformat())
    child(root, "TaxPointDate", invoice.taxable_supply_date.isoformat())
    child(root, "VATApplicable", "true" if invoice.issuer_is_vat_payer else "false")

    # Supplier (dodavatel)
    supplier = child(root, "AccountingSupplierParty")
    sp = child(supplier, "Party")
    sp_name = child(sp, "PartyName")
    child(sp_name, "Name", invoice.issuer_name)
    sp_addr = child(sp, "PostalAddress")
    child(sp_addr, "StreetName", invoice.issuer_address)
    sp_id = child(sp, "PartyIdentification")
    child(sp_id, "ID", invoice.issuer_ico)
    if invoice.issuer_dic:
        sp_tax = child(sp, "PartyTaxScheme")
        child(sp_tax, "CompanyID", invoice.issuer_dic)

    # Customer (odběratel)
    customer = child(root, "AccountingCustomerParty")
    cp = child(customer, "Party")
    cp_name = child(cp, "PartyName")
    child(cp_name, "Name", invoice.customer_name)
    cp_addr = child(cp, "PostalAddress")
    child(cp_addr, "StreetName", invoice.customer_address)
    if invoice.customer_ico:
        cp_id = child(cp, "PartyIdentification")
        child(cp_id, "ID", invoice.customer_ico)
    if invoice.customer_dic:
        cp_tax = child(cp, "PartyTaxScheme")
        child(cp_tax, "CompanyID", invoice.customer_dic)

    # Lines
    sorted_lines = sorted(lines, key=lambda line_: line_.position)
    for ln in sorted_lines:
        line_el = child(root, "InvoiceLine")
        child(line_el, "ID", str(ln.position))
        child(line_el, "Note", ln.description)
        child(line_el, "InvoicedQuantity", str(ln.quantity))
        child(line_el, "UnitPrice", _money_decimal(ln.unit_price_minor))
        child(line_el, "LineExtensionAmount", _money_decimal(ln.line_subtotal_minor))
        child(line_el, "TaxAmount", _money_decimal(ln.line_vat_minor))
        child(line_el, "TaxableAmount", _money_decimal(ln.line_subtotal_minor))
        child(line_el, "Percent", str(ln.vat_rate_percent))

    # Totals
    totals = child(root, "LegalMonetaryTotal")
    child(totals, "TaxExclusiveAmount", _money_decimal(invoice.subtotal_minor))
    child(totals, "TaxAmount", _money_decimal(invoice.vat_amount_minor))
    child(totals, "TaxInclusiveAmount", _money_decimal(invoice.total_minor))
    child(totals, "PayableAmount", _money_decimal(invoice.total_minor))
    child(totals, "DocumentCurrencyCode", invoice.currency)

    rendered: bytes = etree.tostring(
        root,
        xml_declaration=True,
        encoding="UTF-8",
        pretty_print=True,
    )
    return rendered.decode("utf-8")


def _money_decimal(amount_minor: int) -> str:
    """ISDOC expects decimal money (e.g. `99.00`), not minor units."""
    return f"{Decimal(amount_minor) / Decimal(100):.2f}"


__all__ = ["InvoiceRenderer", "formatters"]
