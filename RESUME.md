# Resume: INVOICES_TASK.md commit #5

**Last completed:** *feat(invoicing): InvoiceStorage with S3 + local fallback and hash verification* (commit #4).

## State at session end

- Migration head: `1a5b9f76b1ee` (unchanged from commits #2–4).
- New module `app/services/invoicing/storage.py` with `InvoiceStorage`, `StorageResult`, `IntegrityError`. Two backends:
  - **S3** when `settings.s3_endpoint_url` + `s3_bucket_invoices` are configured. boto3 lazy-imported; Hetzner-friendly `Config(s3={"addressing_style": "path"}, signature_version="s3v4")`. SHA-256 stored as object metadata for belt-and-suspenders integrity.
  - **Local** otherwise. Writes under `invoice_storage_local_root` (default `var/invoices/`). One-time WARNING log on first use.
- 6 new settings in `app/core/config.py`: `s3_endpoint_url`, `s3_bucket_invoices`, `s3_access_key_id`, `s3_secret_access_key`, `s3_region` (default `fsn1`), `invoice_storage_local_root`.
- Object key scheme: `invoices/{year}/{organization_id}/{number}.{pdf|isdoc.xml}`.
- 7 new tests in `tests/services/test_invoicing_storage.py` covering: PDF round-trip, ISDOC round-trip, key scoping by year+org, on-disk tampering → `IntegrityError`, recorded-hash mismatch → same error, missing key → `FileNotFoundError`, idempotent re-store of same bytes.
- Backend suite: **414 passed** (407 → 414). mypy strict, ruff lint+format clean. **Six commits ahead of `origin/main`.**

## Next: commit #5 — `feat(invoicing): InvoiceService orchestrator and InvoiceMailer`

This is the brain. Wires the renderer (#3) + storage (#4) into a transactional issuance flow that also writes audit-log entries.

### `app/services/invoicing/service.py`

```python
class InvoiceService:
    async def issue_for_charge(self, session, charge: Charge,
                               by_admin_id: uuid.UUID | None = None) -> Invoice:
        """Auto-issue path. Called from the ComGate webhook (commit #6)
        when a charge transitions to `paid`. Idempotent: if an invoice
        already exists for this charge, returns it without re-rendering."""

    async def issue_manual(self, session, *, org_id: uuid.UUID,
                           lines: list[ManualLineIn], note: str | None,
                           by_admin_id: uuid.UUID,
                           taxable_supply_date: date | None = None,
                           due_at: date | None = None) -> Invoice:
        """Founder-driven. Used for refunds, comp orgs, custom corrections."""

    async def mark_paid(self, session, invoice_id: uuid.UUID,
                        paid_at: datetime | None,
                        by_admin_id: uuid.UUID) -> Invoice: ...

    async def void(self, session, invoice_id: uuid.UUID, reason: str,
                   by_admin_id: uuid.UUID) -> Invoice: ...

    async def issue_credit_note(self, session, *,
                                 original_invoice_id: uuid.UUID,
                                 lines: list[ManualLineIn], reason: str,
                                 by_admin_id: uuid.UUID) -> Invoice: ...
```

Algorithm for `issue_for_charge`:
1. Idempotency: `SELECT FROM invoices WHERE charge_id = :charge_id LIMIT 1`. If exists, return it.
2. Validate `BillingSettings` issuer fields are non-empty (the founder must have configured them via the super-admin UI). Otherwise raise `InvoiceIssuerNotConfiguredError`. Tests should cover this.
3. Allocate a number under `pg_advisory_xact_lock` for the year (use the helper from commit #1's tests as a pattern; promote to `app/services/invoicing/numbering.py`).
4. Build the `Invoice` row with `status='draft'` initially, snapshot issuer + customer, derive lines from the charge (one line per `Charge.kind`: monthly/annual subscription, seat upgrade, etc.). Compute totals.
5. Render PDF + ISDOC via `InvoiceRenderer`.
6. Store both via `InvoiceStorage`.
7. Set `pdf_*`, `isdoc_*` columns on the invoice; flip `status='issued'`.
8. Write `InvoiceAuditLog` rows: `allocated`, `issued`, `pdf_stored`.
9. Return.

### `app/services/invoicing/numbering.py`

Promote the advisory-lock allocator from the test file into a real helper. Used by `issue_for_charge` and `issue_manual` and `issue_credit_note`.

```python
async def allocate_invoice_number(session, year: int) -> tuple[int, str, str]:
    """Returns (sequence_in_year, number, variable_symbol)."""
```

### `app/services/invoicing/mailer.py`

```python
class InvoiceMailer:
    async def send(self, session, invoice: Invoice,
                   override_to: str | None = None) -> None:
        """Render BillingSettings.invoice_email_{subject,body}_template
        as Jinja2, attach the PDF (fetched via InvoiceStorage), send via
        services/email.send_email, write `sent` audit log + sent_at row."""
```

Reuses the existing `services/email.py` stub (still log-only). The tax invoice's PDF gets attached as `Faktura-{number}.pdf`.

### Tests

- `test_invoicing_service.py` (or split per file):
  - issue_for_charge happy path (creates an Invoice in `issued` state with PDF stored, audit log entries present)
  - issue_for_charge idempotency (re-fired webhook returns existing invoice, no second rendering)
  - issue_for_charge raises `InvoiceIssuerNotConfiguredError` when BillingSettings is bare
  - mark_paid sets paid_at + writes `paid` audit log
  - void sets status, writes `voided` audit log, leaves PDF in storage
  - issue_credit_note creates a separate row, original is untouched, |credit_total| ≤ original_total
  - mailer sends via the stub, writes `sent` audit log + sent_at on row

### Watch out for

- The `Invoice` model's immutability trigger blocks UPDATE on guarded columns once `status != 'draft'`. The orchestrator must set `pdf_*`/`isdoc_*` BEFORE flipping to `issued`, or the trigger will reject the update. Build the row in `draft`, write storage, set the storage columns, THEN flip to `issued` in one final UPDATE.
- Charge.kind → invoice line description mapping is in Czech. Helper:
  - `initial` → `SimpleCRM, plán {Měsíční|Roční}, {N} uživatelů, období {start} – {end}`
  - `renewal` → same shape
  - `seat_upgrade` → `SimpleCRM, navýšení o {N} uživatelů, období {start} – {end}`
- `BillingSettings.is_vat_payer=True` path: line items get DPH 21 %, totals split into `subtotal_minor` + `vat_amount_minor`. When False, `vat_amount_minor=0`, `vat_rate_percent=0.00`.
- The audit log INSERTs need to be inside the orchestrator's transaction (so a renderer crash mid-issuance doesn't leave orphan log entries).

### How to start commit #5

1. `cd backend && uv run alembic current` — head is `1a5b9f76b1ee`.
2. `cd backend && uv run pytest -q` — confirms 414 green.
3. Read `BillingSettings` model + `services/email.py` stub for context.
4. Write `numbering.py` first (small, has a clean unit test).
5. Write `service.py` orchestrator. The idempotency check + draft→issued→storage→flip pattern is the load-bearing logic.
6. Write `mailer.py`.
7. Tests, gates, commit, update RESUME for commit #6 (webhook integration).

## Carryover from commits #1–4

- Endpoint URL `/api/v1/payments/invoices` intentionally not renamed.
- `invoice_audit_log` REVOKE deferred (triggers cover protection).
- BillingSettings issuer columns are empty by default — orchestrator must validate before issuance.
- WeasyPrint pinned `>=63.0,<64`; bumping breaks already-stored `pdf_sha256`.
- Renderer ships ~1 MB of TTFs in the repo (Inter + JetBrains Mono).
- S3 path is implemented but not exercised by tests; configure Hetzner bucket + run an integration test before flipping `s3_endpoint_url` in production.
