# Resume: INVOICES_TASK.md commit #11

**Last completed:** *feat(admin): manual invoice + credit-note builders* — commit #10 of INVOICES_TASK.md.

## State at session end

- 8 commits ahead of `origin/main` since the invoicing work began.
- Backend: 444 tests, mypy strict, ruff format + check clean.
- Frontend: 79 tests pass, lint clean, typecheck clean, `pnpm build` green.
- Manual issuance endpoint `POST /admin/invoices/manual` wired to `InvoiceService.issue_manual` with 201/400/409 surface.
- New frontend modals `ManualInvoiceModal.tsx` (org typeahead + line builder) and `CreditNoteModal.tsx` (negated lines pre-filled from parent).
- "Vystavit ručně" button in `InvoicesList` header; "Vystavit dobropis" button in `InvoiceDetailDrawer` (replaces the placeholder text from #9).
- Credit-note action selects the new credit invoice in the drawer after issuance via the new `onSelectInvoice` prop.
- 2 new backend tests: `test_manual_invoice_creates_issued_invoice`, `test_manual_invoice_400_for_unknown_org`.

## Next: commit #11 — `feat(admin): year export jobs (CSV / ZIP / full)`

Per INVOICES_TASK.md §7 + §9.

### What

Three buttons on the admin Faktury page header (next to "Vystavit ručně"):

1. **"Export roku — CSV"** → `GET /admin/invoices/export/csv?year=2026`
   - One row per invoice with: number, kind, status, issued_at, taxable_supply_date, due_at, paid_at, currency, subtotal_minor, vat_amount_minor, total_minor, customer_name, customer_ico, customer_dic
   - Czech-friendly CSV: semicolon delimiter, BOM-prefixed UTF-8 (Excel cs-CZ)
   - Streams via `StreamingResponse` so the year doesn't have to be materialised in memory at once
2. **"Export roku — PDF ZIP"** → `GET /admin/invoices/export/pdfs?year=2026`
   - Streams a ZIP of every issued/paid PDF for the year, hash-verified
   - File naming: `{year}/{number}.pdf`
   - Skip drafts and voided (skipping voided is a policy choice — accountant prefers to see them; revisit in #14 docs)
3. **"Export roku — Vše"** → `GET /admin/invoices/export/full?year=2026`
   - ZIP containing both: the CSV + the per-invoice PDFs + the per-invoice ISDOC XMLs
   - This is the one the accountant actually needs at year-end

### Implementation outline

- New service module `backend/app/services/invoicing/exporter.py` with three functions: `iter_csv_rows(session, year) -> Iterable[bytes]`, `stream_pdf_zip(session, year) -> Iterable[bytes]`, `stream_full_zip(session, year) -> Iterable[bytes]`. All async iterators / generators yielding bytes for `StreamingResponse`.
- Each export run logs an `export_run` audit-log row with `payload={"year": Y, "kind": "csv"|"pdf_zip"|"full", "row_count": N}` and `actor_user_id=admin.id`.
- Use Python's stdlib `zipfile` in **streaming** mode (`ZipFile(stream, mode='w', compression=ZIP_DEFLATED)` against an in-memory buffer flushed periodically). For very large years, swap to `aiozipstream` later.
- Frontend: three new `useExportInvoiceYear*` hooks following the `useExportCsv` pattern in `frontend/src/app/reports/dashboard/useExportCsv.ts` (raw `fetch` + blob + `triggerDownload`).

### Backend additions for #11

- `backend/app/api/v1/admin_invoices.py` — three new routes (`/export/csv`, `/export/pdfs`, `/export/full`)
- `backend/app/services/invoicing/exporter.py` (new)
- `backend/tests/services/test_invoicing_exporter.py` — small tests for each generator: row count, CSV column order, ZIP archive integrity (open with `zipfile.ZipFile`)
- `backend/tests/api/v1/test_admin_invoices.py` — add tests for the export routes (200, content-type, content-disposition, audit-log entries)

### Frontend additions for #11

- `frontend/src/admin/useExportInvoiceYear.ts` (new) — three exported hooks: `useExportInvoicesCsv`, `useExportInvoicesPdfZip`, `useExportInvoicesFull`
- `frontend/src/admin/InvoicesList.tsx` — add three buttons in the header next to "Vystavit ručně"; keep the existing year filter in sync (pass the current year filter into the hooks)

### Watch-outs for #11

- Streaming a ZIP with `zipfile` requires a seekable buffer for the central directory; if the year is huge the in-memory buffer balloons. Acceptable for v1 (we have <100 invoices/year), revisit before going to enterprise volume.
- Excel cs-CZ wants `;` delimiter + UTF-8 BOM (`﻿`). Don't use `,` unless we add a separate "international" CSV later.
- Audit-log writes for export runs use `invoice_id=None` (the model already allows this — see the docstring in `invoice_audit_log.py`).
- `pdf_object_key` is NULL for drafts. Skip drafts in the PDF zip, not just by status filter (defence in depth).

## Commits #12 onward (still TODO)

- #12 — archive integrity dashboard
- #13 — broader test suites
- #14 — `docs/invoicing.md`

## Carryover (still applies after #10)

- `BillingSettings.seller_ico/seller_iban` legacy column names; snapshot uses `issuer_*`. Worth a follow-up rename.
- The `_wipe_invoices_for_org` cleanup pattern is duplicated in 5 test files. **Promote to shared helper in `tests/conftest.py` before adding a 6th.**
- `useInvoices` in `usePayments.ts` is misnamed — it returns `ChargeList`. Rename to `useCharges` cleanup.
- Renewal-draft scheduler `renewal_draft_scheduler` is registered but **not auto-started** in `app/main.py` lifespan.
- WeasyPrint emits `Ignored fill:#000000` warning per render (QR SVG). Cosmetic.
- S3 storage path implemented but not exercised by tests.
- `var/invoices/` host pollution from the customer PDF-stream test.
- `api.generated.ts` regen lagging three commits (#8, #9, #10). Worth running before #11 lands.
- Hand-typed admin types in `frontend/src/admin/useAdminInvoices.ts` mirror `AdminInvoiceListItem` / `AdminInvoiceDetail` / `AdminInvoiceLine` / `AdminInvoiceAuditEntry`. Switch to generated types after regen.
- `apiFetch` body argument is typed as `Record<string, unknown>`; the manual + credit-note hooks cast through `unknown` because their `interface` types lack an index signature. Could either (a) declare `[k: string]: unknown` on those interfaces or (b) loosen `apiFetch` to accept any `object`. Defer.
