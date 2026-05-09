# Resume: INVOICES_TASK.md commit #12

**Last completed:** *feat(invoicing): year-end CSV/PDF/full export bundles* — commit #11 of INVOICES_TASK.md.

## State at session end

- 9 commits ahead of `origin/main` since the invoicing work began.
- Backend: 448 tests, mypy strict, ruff format + check clean.
- Frontend: 79 tests pass, lint clean, typecheck clean, `pnpm build` green.
- New service module `app/services/invoicing/exporter.py` with `build_csv`, `build_pdf_zip`, `build_full_zip`. CSV is Czech-friendly (`;` delimiter, UTF-8 BOM). ZIP entry timestamps pinned to 1980-01-01 for byte-stable archives.
- Three new admin endpoints under `/api/v1/admin/invoices/export/{csv,pdfs,full}` returning content-disposition'd downloads. Each export run writes an `export_run` audit row with `payload={year, kind, row_count, ...}`.
- Three new frontend buttons in InvoicesList header (CSV / PDF ZIP / Úplný), each driven by a hook in `useExportInvoiceYear.ts`. The export year follows the `year` filter, falling back to the current year when none is set.
- 4 new backend tests in `tests/services/test_invoicing_exporter.py`: BOM + delimiter, audit-log write, ZIP archive integrity, full-zip composition.

## Next: commit #12 — `feat(admin): archive integrity dashboard`

Per INVOICES_TASK.md §8 + §9.

### What

A new admin sub-page (or section of the existing Faktury tab) that periodically:
1. Iterates every issued/paid invoice
2. Re-fetches its PDF from storage, recomputes SHA-256, compares to `pdf_sha256`
3. Same for ISDOC
4. Writes either an `pdf_verified`/`isdoc_verified` event or `integrity_failure` (with details) to `invoice_audit_log`

The dashboard surface shows: total checked, % passing, last-run timestamp, list of failures (number + which file failed). It also offers a "Run integrity check now" button.

A weekly scheduler job runs the same logic automatically (sibling of `renewal_draft_scheduler` in `app/services/scheduler.py`). The dashboard reflects whichever ran last.

### Implementation outline

- New service module `app/services/invoicing/integrity.py` with `run_archive_integrity_check(session, *, actor_user_id) -> IntegrityRunResult`.
- The check delegates to `InvoiceStorage.fetch_pdf` / `fetch_isdoc` which already hash-verify on read — wrap each in `try/except IntegrityError` and accumulate failures.
- Result schema: `{ run_id, checked, ok, failed: [{invoice_id, number, kind ('pdf'|'isdoc'), error}] }`.
- New route `POST /admin/invoices/integrity/check` (super-admin) returns the run result.
- New route `GET /admin/invoices/integrity/last-run` returns the most recent `export_run`/`integrity_check_run` summary by reading the audit log.
- New scheduler `weekly_integrity_runner = _PeriodicRunner(interval_seconds=7*24*3600, ...)` — wire into `app/main.py` lifespan along with the renewal-draft scheduler that's still un-wired (carryover).
- Frontend: a card in the AdminPage Faktury tab (or a new sub-tab) showing the last run + failures + "Spustit kontrolu integrity" button.

### Watch-outs for #12

- `_fetch` raises `FileNotFoundError` for a missing local file, `IntegrityError` for a hash mismatch, and may raise the underlying boto3 `ClientError` on S3. Catch all three classes in the integrity walker.
- Running the check on N invoices does N storage round-trips. Acceptable at our scale; if it ever takes more than a few seconds, switch to async fan-out with `asyncio.gather` over a bounded semaphore.
- The check **rewrites** the audit log with one row per invoice — at scale that's noisy. Limit to one summary row per run + only-failed-rows for granular tracking.

## Commits #13 + #14 still TODO

- #13 — broader test suites (cross-cutting: end-to-end happy path, ComGate webhook → audit-log → mailer, scheduler integration)
- #14 — `docs/invoicing.md` accountant-facing operations doc

## Carryover

- `BillingSettings.seller_ico/seller_iban` legacy column names; snapshot uses `issuer_*`. Worth a follow-up rename.
- The `_wipe_invoices_for_org` cleanup pattern is duplicated in 6 test files now (added `test_invoicing_exporter.py` this commit). **Promote to shared helper in `tests/conftest.py` before adding a 7th.** Past the threshold — should be a follow-up cleanup commit.
- `useInvoices` in `usePayments.ts` is misnamed — it returns `ChargeList`. Rename to `useCharges` cleanup.
- Renewal-draft scheduler `renewal_draft_scheduler` is registered but **not auto-started** in `app/main.py` lifespan. Pair with the new weekly_integrity_runner wiring in #12.
- WeasyPrint emits `Ignored fill:#000000` warning per render (QR SVG). Cosmetic.
- S3 storage path implemented but not exercised by tests.
- `var/invoices/` host pollution from PDF-stream/exporter tests.
- `api.generated.ts` regen lagging four commits (#8–#11). Worth running before #12 lands.
- Hand-typed admin types in `frontend/src/admin/useAdminInvoices.ts` should switch to generated types after regen.
- `apiFetch` body argument is typed as `Record<string, unknown>`; the manual + credit-note hooks cast through `unknown` because their `interface` types lack an index signature. Defer.
