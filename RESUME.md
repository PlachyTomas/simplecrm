# Resume: INVOICES_TASK.md commit #4

**Last completed:** *feat(invoicing): add InvoiceRenderer with WeasyPrint PDF/A and ISDOC XML output* (commit #3 of `docs/prompts/INVOICES_TASK.md`).

## State at session end

- Migration head: `1a5b9f76b1ee` (unchanged from commit #2; renderer adds no schema).
- New module `backend/app/services/invoicing/`:
  - `__init__.py` (package marker)
  - `renderer.py` — `InvoiceRenderer.render_pdf(invoice, lines) -> bytes` and `render_isdoc(invoice, lines) -> bytes`. PDF is deterministic via `pdf_creation_date=invoice.issued_at` + WeasyPrint pinned `>=63.0,<64`. ISDOC follows the 6.0.1 schema (root `Invoice`, `DocumentType`=1 invoice / 2 credit_note, `VATApplicable`, supplier/customer parties, line items, `LegalMonetaryTotal`).
  - `templates/invoice.html.j2` — Jinja2 template; A4 single page; two-column issuer/customer header; dates table; line-item table with optional DPH column; totals block; payment block with embedded QR Platba SVG; footer with `Nejsem plátce DPH` notice when applicable. All Czech, vykání.
  - `templates/fonts/Inter-Regular.ttf` (407 KB), `Inter-Bold.ttf` (415 KB), `JetBrainsMono-Regular.ttf` (274 KB) — self-hosted via `@font-face` so PDF/A is self-contained. All cover Latin Extended A/B (verified Czech glyph coverage in fontTools).
- New deps in `pyproject.toml`: `weasyprint>=63.0,<64`, `qrplatba>=1.0`, `babel>=2.16`, `lxml>=5.3`, `jinja2>=3.1`. Mypy `ignore_missing_imports` extended for the third-party libs.
- `backend/Dockerfile` updated with native deps (`libpango-1.0-0`, `libpangoft2-1.0-0`, `libharfbuzz0b`, `libcairo2`, `libgdk-pixbuf-2.0-0`) so the container can render PDFs in production. Dev container does NOT yet have these — host venv works because Ubuntu 24.04 has them via desktop packages.
- 7 new tests in `backend/tests/services/test_invoicing_renderer.py`:
  - PDF magic + EOF trailer
  - byte-stable SHA-256 across two renders (the determinism contract)
  - Czech diacritics (`Žďár nad Sázavou s.r.o.`) renders without missing-glyph fallback (size sanity-check)
  - ISDOC root + invoice number + variable symbol + supplier IČO + payable amount at expected XPaths
  - DocumentType=2 for credit notes
  - PDF size sanity (parametrized over plátce / non-plátce)
- Full backend suite: **407 passed** (400 → 407 with the 7 new renderer tests). Three commits ahead of `origin/main`.

## Next: commit #4 — `feat(invoicing): add InvoiceStorage with Object Storage + local fallback and hash verification`

The renderer outputs bytes; commit #4 stores them durably and verifies on read.

### Files to create

**`backend/app/services/invoicing/storage.py`**:
```python
@dataclass(frozen=True)
class StorageResult:
    object_key: str
    sha256: str
    size_bytes: int

class IntegrityError(Exception): ...

class InvoiceStorage:
    def __init__(self, settings: Settings | None = None): ...

    def store_pdf(self, invoice: Invoice, pdf_bytes: bytes) -> StorageResult: ...
    def store_isdoc(self, invoice: Invoice, xml_bytes: bytes) -> StorageResult: ...

    def fetch_pdf(self, invoice: Invoice) -> bytes:
        """Read + verify hash. Raises IntegrityError if mismatch."""

    def fetch_isdoc(self, invoice: Invoice) -> bytes: ...
```

Object key scheme: `invoices/{year}/{customer_org_id}/{number}.pdf` (and `.isdoc.xml`).

### Backend choice + config
- Hetzner Object Storage (S3-compatible) — use `boto3` with `endpoint_url` from settings.
- Settings to add: `s3_endpoint_url`, `s3_bucket_invoices`, `s3_access_key_id`, `s3_secret_access_key`, `invoice_storage_local_root` (default `var/invoices/`).
- If `s3_*` settings are unset, transparently fall back to local filesystem under `invoice_storage_local_root`. Log a `WARNING` once at first access. Document the migration path in `docs/invoicing.md` (commit #14).

### Hash verification
- On store: compute SHA-256 of bytes, write to storage, return `StorageResult(key, sha256, size)`. Caller writes these into `Invoice.pdf_object_key`, `.pdf_sha256`, `.pdf_size_bytes`.
- On fetch: read bytes, compute SHA-256, compare to `Invoice.pdf_sha256`. Mismatch → `IntegrityError` + `InvoiceAuditLog(event='integrity_failure', payload={'expected': ..., 'actual': ...})`.

### Tests (`backend/tests/services/test_invoicing_storage.py`)
- store + fetch round-trip via local fallback (uses `tmp_path` to keep test artifacts off `var/`)
- corrupt the stored file → `fetch_pdf` raises `IntegrityError`, audit-log entry written
- distinct customer orgs → distinct object keys (don't cross-contaminate)
- `store_pdf` is idempotent for the same byte input (safe to retry on transient errors during issuance)

### Watch out for
- Hetzner Object Storage requires `addressing_style="path"` in the boto3 config (virtual-hosted-style URLs don't work for non-AWS endpoints). Pass via `Config(s3={"addressing_style": "path"})`.
- The storage layer should NOT touch the `Invoice` ORM row — that's the orchestrator's job in commit #5. Storage just returns the `StorageResult`.
- For the local fallback, `Path.mkdir(parents=True, exist_ok=True)` to handle first-run.
- `boto3` is heavy; lazy-import inside the method that needs it so tests + local-only operations stay fast.

### How to start commit #4

1. `cd backend && uv run alembic current` — confirms head is `1a5b9f76b1ee`.
2. `cd backend && uv run pytest -q` — confirms 407 green.
3. Add `boto3>=1.35` to `pyproject.toml` (lazy-imported inside storage methods).
4. Write `storage.py` with the local fallback path first; add S3 path behind a feature flag check on `settings.s3_endpoint_url`.
5. Tests, gates, commit, update this RESUME for commit #5 (orchestrator).

## Carryover from commits #1–3

- Endpoint URL `/api/v1/payments/invoices` intentionally not renamed.
- `invoice_audit_log` REVOKE deferred (triggers cover protection).
- Webhook auto-issuance idempotency check is for commit #6.
- The new BillingSettings issuer columns must be filled in via the super-admin UI before commit #5's orchestrator validation guard fires.
- **Renderer ships fonts as binary blobs** — the three TTFs add ~1 MB to the repo. Cleaner long-term might be to vendor them in a separate package, but the current layout keeps `fonts/` next to the template file that uses them. Worth flagging in code review.
- **Determinism caveat**: WeasyPrint's PDF byte layout is reproducible across runs but not guaranteed across minor version bumps. The narrow pin (`>=63.0,<64`) is what protects the stored `pdf_sha256` values; a future maintainer reading "let me bump weasyprint" should check that all already-issued invoices still hash the same after the bump.
