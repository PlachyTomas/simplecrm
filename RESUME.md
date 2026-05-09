# Resume: INVOICES_TASK.md commit #3

**Last completed:** *feat(invoicing): extend BillingSettings with issuer snapshot fields* (commit #2 of `docs/prompts/INVOICES_TASK.md`).

## State at session end

- Migration head: `1a5b9f76b1ee` (extends `billing_settings` with 9 new columns; round-trips clean).
- `BillingSettings` model gains: `issuer_name`, `issuer_address_street`, `issuer_address_city`, `issuer_address_zip`, `issuer_register_text` (all `String/Text` non-null with `server_default=""`), `issuer_account_domestic` (nullable), `default_payment_term_days` (default 14), `invoice_email_subject_template` + `invoice_email_body_template` (Jinja2 strings with sensible Czech defaults including the placeholders `number`, `due_date`, `customer_name`, `period_start`, `period_end`, `total_display`, `issuer_iban`, `variable_symbol`).
- `BillingSettingsOut` and `BillingSettingsUpdate` schemas extended in `app/schemas/billing.py`. Existing `GET /admin/billing-settings` and `PUT /admin/billing-settings` round-trip the new fields automatically (the endpoint just `setattr`s `payload.model_dump(exclude_unset=True)`).
- Two new tests in `backend/tests/api/v1/test_admin_billing.py`:
  - `test_billing_settings_exposes_issuer_snapshot_fields` — resets the singleton to known empty state, GETs, asserts all new fields surface and the seeded Jinja templates contain "Faktura č." + "Variabilní symbol".
  - `test_put_billing_settings_persists_issuer_fields` — partial PUT with realistic OSVČ values, verifies round-trip including untouched-field preservation.
- Frontend types regenerated; `api.generated.ts` shows `BillingSettingsOut` with all 15 properties. Frontend lint/typecheck/test/build all pass.
- Full backend suite: **398 passed** (390 prior + 2 new + the 8 from commit #1 which were never excluded). Two commits ahead of `origin/main`.

## Next: commit #3 — `feat(invoicing): add InvoiceRenderer with WeasyPrint PDF/A and ISDOC XML output`

This is the big one. Writes the actual document-rendering layer.

### Dependencies to add
`backend/pyproject.toml`:
- `weasyprint>=63` — HTML+CSS → PDF/A-2b. **Adds system deps**: `libpango-1.0-0`, `libcairo2`, `libgdk-pixbuf-2.0-0`, `libffi8`. The dev container already has these via `node:20-bookworm`'s base packages — verify with `dpkg -l | grep pango` inside the container before assuming. Production Dockerfile (when it exists) needs them explicitly.
- `qrplatba>=2.0` — SPAYD QR-code SVG generator. MIT-licensed, pure Python.
- `babel>=2.16` — Czech number/date formatting. `format_decimal(..., locale='cs_CZ')`, `format_date(..., locale='cs_CZ')`.

### Files to create

**`backend/app/services/invoicing/__init__.py`** — empty package marker.

**`backend/app/services/invoicing/renderer.py`**:
```python
class InvoiceRenderer:
    def render_pdf(self, invoice: Invoice, lines: list[InvoiceLine]) -> bytes: ...
    def render_isdoc(self, invoice: Invoice, lines: list[InvoiceLine]) -> bytes: ...
```
- Determinism: pin WeasyPrint version, pass fixed `pdf_creation_date` (use `invoice.issued_at`), embed all fonts, set `presentational_hints=False`.
- Tests must assert byte-stable SHA-256 over two consecutive renders of the same invoice.

**`backend/app/services/invoicing/templates/invoice.html.j2`** — Jinja2 template per `docs/prompts/INVOICES_TASK.md` §5.2. A4 single-page layout with header / issuer block / customer block / dates table / line items / totals / payment block (incl. embedded QR Platba SVG) / footer. Czech, vykání. The QR is generated inline:
```python
from qrplatba import QRPlatbaGenerator
qr_svg = QRPlatbaGenerator(
    iban=invoice.issuer_iban,
    amount=Decimal(invoice.total_minor) / 100,
    variable_symbol=invoice.variable_symbol,
    message=f"SimpleCRM faktura {invoice.number}",
    due_date=invoice.due_at,
).get_text().encode()
```

**`backend/app/services/invoicing/templates/fonts/`** — Inter (Regular, Bold) + JetBrains Mono (Regular). Self-hosted TTFs so the PDF/A is self-contained. Source from Google Fonts repos; commit the `.ttf` files. ~600 KB total.

**`backend/app/services/invoicing/isdoc.py`** — ISDOC 6.0.1 XML generator. Schema at https://isdoc.org/. Use `lxml` (already a transitive dep of WeasyPrint). Skip the optional fields the customer's accountant doesn't need; the legal minimum is invoice number, dates, supplier, customer, lines, totals.

**`backend/tests/services/test_invoicing/test_renderer_determinism.py`** — render the same invoice twice, assert SHA-256 match.

**`backend/tests/services/test_invoicing/test_template_renders.py`** — smoke test that the template loads and produces valid PDF bytes (signature `%PDF-1.x` at byte 0, `%%EOF` at the end).

**`backend/tests/services/test_invoicing/test_isdoc.py`** — render an invoice to ISDOC, parse the XML, assert the invoice number + total appear at the expected XPath.

### Watch out for

- **Czech diacritics**: the renderer test must include a customer name like `Žďár nad Sázavou s.r.o.` and assert that the rendered PDF doesn't contain `�` or missing-glyph fallbacks. WeasyPrint silently substitutes if a font lacks a glyph — use Inter which covers Latin Extended A/B fully.
- **Determinism trap**: WeasyPrint embeds the current timestamp by default unless you pass `pdf_creation_date=invoice.issued_at`. Don't forget.
- **QR Platba edge case**: `qrplatba` accepts `Decimal`, but the API contract is `Decimal` to two-decimal-place precision. Convert via `Decimal(invoice.total_minor) / 100` not `float(...) / 100`.
- **WeasyPrint warnings**: it emits `font-family` warnings to stderr if the @font-face references a name that doesn't match the embedded TTF's internal name. Verify with `python -c "from fontTools.ttLib import TTFont; print(TTFont('inter-regular.ttf')['name'].names[0])"`.

### How to start commit #3

1. `cd backend && uv run alembic current` — confirms head is `1a5b9f76b1ee`.
2. `cd backend && uv run pytest -q` — confirms 398 green.
3. Add WeasyPrint + qrplatba + babel to `pyproject.toml`, run `uv sync` inside the dev container (host venv has perms issues, see RESUME from commit #1 for the chown fix).
4. Verify system deps: `docker compose ... exec dev dpkg -l | grep -E "pango|cairo|gdk-pixbuf"`.
5. Download Inter + JetBrains Mono TTFs, drop into `backend/app/services/invoicing/templates/fonts/`. Commit the binary files.
6. Write the template, the renderer, the tests, run gates, commit, update this RESUME for commit #4 (storage layer).

## Carryover from commits #1–2

- Endpoint URL `/api/v1/payments/invoices` intentionally not renamed.
- `invoice_audit_log` REVOKE deferred (triggers cover protection).
- Webhook auto-issuance idempotency check is for commit #6.
- The new BillingSettings columns have empty-string defaults — the founder MUST fill in `issuer_name`, `issuer_address_*`, `issuer_register_text` via the super-admin UI before commit #5 wires the orchestrator. Until those are populated, issuance will fail with a clear "issuer not configured" error (to be implemented in commit #5's validation guard).
