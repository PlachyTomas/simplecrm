# Resume: INVOICES_TASK.md commit #14

**Last completed:** *test(invoicing): consolidate cleanup helper + add canonical happy-path integration suite* — commit #13 of INVOICES_TASK.md.

## State at session end

- 11 commits ahead of `origin/main` since the invoicing work began.
- Backend: 455 tests, mypy strict on `app/` clean, ruff check + format clean.
- Frontend: 79 tests pass, lint clean, typecheck clean, `pnpm build` green.
- New `tests/conftest.py::wipe_invoicing_for_org(ids)` shared cleanup helper. Five test files (`test_invoices.py`, `test_admin_invoices.py`, `test_invoicing_service.py`, `test_invoicing_scheduler.py`, `test_invoicing_exporter.py`, `test_invoicing_integrity.py`) refactored to use it — net code reduction ~250 LoC.
- New `tests/integration/test_invoicing_happy_path.py` with three end-to-end tests:
  - paid webhook → auto-issued invoice → list + PDF endpoints + audit-log assertion
  - replayed webhook → still exactly 1 invoice (idempotency at the invoice level)
  - tampering with `total_minor` via raw SQL raises the immutability trigger
- `test_payments.py` keeps its bespoke `_wipe_invoices_for_org(session, org_id)` helper because it's keyed differently (single org id, takes session) — separate cleanup model from the bulk-wipe one.

## Next: commit #14 — `docs(invoicing): operations runbook`

Per INVOICES_TASK.md §11. Single document `docs/invoicing.md` covering:

### Sections to write

1. **Overview** — what the invoicing module is + isn't (vs ComGate charges), where the legal authority comes from (§ 11 účetní zákona, § 29 ZDPH for DPH plátce).
2. **For the founder (super-admin operations)** — daily workflow:
   - "I want to issue an invoice manually" → /admin/faktury → Vystavit ručně
   - "Customer wants a refund" → detail drawer → Vystavit dobropis
   - "I'm doing year-end" → CSV export, PDF ZIP, full export
   - "Something looks corrupted" → Spustit kontrolu integrity
3. **For the customer** — what they see at /app/nastaveni/predplatne (Faktury card)
4. **Architecture** — one diagram + brief module-by-module walkthrough:
   - `Charge` (ComGate attempts) vs `Invoice` (legal docs)
   - Sequencing via `InvoiceCounter` + `pg_advisory_xact_lock`
   - Storage layer (S3 vs local fallback) + hash verification
   - Triggers: immutability + audit-log append-only
   - Schedulers: renewal-draft (daily 04:00), integrity (weekly)
5. **Configuration** — what env vars / `BillingSettings` rows must be populated before issuance works (S3 creds, issuer fields)
6. **Common operational issues** — known things that bite:
   - WeasyPrint version pin (changing breaks stored hashes)
   - "Invoice already paid" 409 + how to investigate
   - Audit-log trigger blocks DELETE — disable-trigger pattern only for test cleanup
   - Voided invoices stay in storage + exports (accountant requirement)
7. **Czech compliance gotchas** — what gets the auditor angry:
   - Gap-free yearly numbering (don't delete rows; void + re-issue if needed)
   - Snapshot fields frozen at issuance (so a `BillingSettings` IBAN change doesn't retroactively rewrite invoices)
   - VAT-payer toggle must match real registration status

### Watch-outs for #14

- This is a docs commit — should NOT touch code, models, schemas, or tests.
- Live URLs (`grafana.internal/...`) should not appear unless they actually exist; we're not on Grafana.
- Markdown lint (if there's a `markdownlint` config) — there isn't currently in this repo, so just write idiomatic CommonMark.

## What's done

| # | Commit | Summary |
|---|---|---|
| 1 | foundation | Charge rename + Invoice models + triggers |
| 2 | issuer fields | BillingSettings extension |
| 3 | renderer | WeasyPrint PDF + ISDOC XML |
| 4 | storage | S3 + local fallback + hash verification |
| 5 | service | InvoiceService orchestrator + InvoiceMailer |
| 6 | webhook hook | Auto-issue on ComGate paid |
| 7 | scheduler | Daily renewal-draft job |
| 8 | customer UI | List/detail/PDF endpoints + Faktury sub-tab |
| 9 | admin UI | Cross-org invoices browser + actions |
| 10 | manual builders | Manual + credit-note modals |
| 11 | year exports | CSV / PDF ZIP / full ZIP |
| 12 | integrity | Walker + dashboard + weekly scheduler |
| 13 | tests | Cleanup helper consolidation + happy-path integration suite |
| 14 | **TODO** | docs/invoicing.md operations runbook |

## Carryover

- `BillingSettings.seller_ico/seller_iban` legacy column names; snapshot uses `issuer_*`. Worth a follow-up rename.
- `useInvoices` in `usePayments.ts` is misnamed — returns `ChargeList`. Rename to `useCharges`.
- WeasyPrint emits `Ignored fill:#000000` warning per render (QR SVG). Cosmetic.
- S3 storage path implemented but not exercised by tests.
- `var/invoices/` host pollution from PDF-stream/exporter/integrity/integration tests.
- `api.generated.ts` regen lagging six commits (#8–#13). Worth running before #14 lands.
- Hand-typed admin types in `frontend/src/admin/useAdminInvoices.ts` and `IntegrityPanel.tsx` should switch to generated types after regen.
- `apiFetch` body argument is typed as `Record<string, unknown>`; the manual + credit-note hooks cast through `unknown`.
- Test-fixture `AsyncIterator` vs `AsyncGenerator` typing mypy noise across all test files (pre-existing; not blocking).
