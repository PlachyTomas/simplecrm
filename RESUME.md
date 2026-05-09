# Resume: INVOICES_TASK.md commit #8

**Last completed:** *feat(invoicing): daily renewal-draft scheduler job* (commit #7).

## State at session end

- Migration head: `1a5b9f76b1ee` (no schema changes since #2).
- New `InvoiceService.prepare_renewal_draft(session, *, subscription)` builds a `status='draft'` Invoice projecting the next-period charge. Allocates a real sequence number (matches Fakturoid; voiding a draft consumes the number per §3). Doesn't render or store. Idempotent on `(subscription_id, status='draft')`.
- `_issue_internal` gained a `stop_at_draft: bool = False` flag. When True, skips render/store/status-flip/audit-log-issued and just writes an `allocated` audit row.
- `_advance_period(end, plan_code)` helper projects monthly (+30d) / annual (+365d).
- `app/services/scheduler.py` — new daily runner `renewal_draft_scheduler` at 04:00 Europe/Prague. Job `run_renewal_draft_sweep` walks active non-comp subs with `current_period_ends_at <= now + 7d`, skips trial/comp/enterprise plans, calls `prepare_renewal_draft` per sub. Returns the count.
- 4 new tests in `tests/services/test_invoicing_scheduler.py`:
  - drafts created for subs ending within 7 days
  - subs ending 12+ days out are skipped
  - comp subs are skipped
  - rerun is idempotent (no duplicate drafts)
- Backend suite: **428 passed** (424 → 428). mypy strict, ruff clean. **Two commits ahead of `origin/main` after this commit lands.**

## Next: commit #8 — `feat(invoicing): customer-facing invoice list/detail endpoints + UI`

Wire the legal tax-invoice document into the customer-facing app. Two surfaces:

### Backend: 3 new routes under `/api/v1/organizations/current/invoices`

- `GET /organizations/current/invoices` — paginated list. Returns a `TaxInvoiceList` schema with summary fields (id, number, kind, status, issued_at, due_at, total_minor, vat_amount_minor, paid_at, sent_at). Filtered to `Invoice.organization_id == user.organization_id`. Order by `issued_at desc`.
- `GET /organizations/current/invoices/{id}` — full row + lines. 403 if cross-org.
- `GET /organizations/current/invoices/{id}/pdf` — streams `application/pdf` from `InvoiceStorage.fetch_pdf` (hash-verified). 403 cross-org. 404 if `pdf_object_key` is NULL (drafts).

Add to `app/schemas/billing.py` (or a new `app/schemas/invoicing.py`):
- `TaxInvoiceOut` — single row
- `TaxInvoiceList` — paginated wrapper
- `TaxInvoiceLineOut` — child rows
- `TaxInvoiceDetailOut` — single row + lines

These are NEW types, distinct from `ChargeOut` / `ChargeList` (which serialize ComGate charges). Do not conflate.

### Frontend: F1 from INVOICES_TASK.md §9

Sub-tab under `/app/nastaveni/predplatne` called "Faktury" (the existing Faktury card in SettingsPage shows ComGate charges; the new sub-tab shows the legal tax invoices).

Wait — actually the existing card label is also "Faktury" and it lists Charges. To avoid two same-labeled UIs, options:
- (a) Rename the existing card to "Platby" (Payments) and use "Faktury" for the new one.
- (b) Merge them: one list with a `Druh` column (`Platba` / `Faktura`).
- (c) Keep them separate; rename the existing list section header.

**Recommendation for #8**: use option (a). Rename existing card heading to "Platby" (the rows ARE payments — ComGate charge attempts). Add a new section above titled "Faktury" listing tax invoices. The tab structure stays as-is.

UI per §9 F1:
- Table columns: Číslo / Datum vystavení / Splatnost / Stav / Celkem / [download icon]
- Status pills: `Vystavena` / `Zaplacena` / `Po splatnosti` / `Stornována` / `Dobropis` (corner badge)
- Empty state with line-art illustration
- Click row → detail drawer with lines + `Stáhnout PDF` button

### Files to touch / create

Backend:
- `backend/app/api/v1/invoices.py` — NEW. The 3 routes above + their schemas.
- `backend/app/api/v1/__init__.py` — register the new router.
- `backend/app/schemas/invoicing.py` — NEW. `TaxInvoiceOut`, `TaxInvoiceLineOut`, `TaxInvoiceList`, `TaxInvoiceDetailOut`.
- `backend/tests/api/v1/test_invoices.py` — NEW. happy-path list, cross-org 403, draft has no PDF endpoint, hash-verified PDF download.

Frontend:
- `frontend/src/components/billing/useTaxInvoices.ts` — NEW. `useTaxInvoices()` query hook + types.
- `frontend/src/app/settings/SettingsPage.tsx` — add "Faktury" section above the existing (renamed to "Platby") Charges card.
- Frontend test for the new section in `__tests__/`.

### Watch out for
- `Invoice.status` includes `'draft'`. Drafts shouldn't appear in the customer-facing list yet (they belong to the founder's review queue). Filter `status != 'draft'`.
- Cross-org access: use the existing `require_org_membership` dep + `Invoice.organization_id == user.organization_id` filter. Don't trust the path's `org_id` argument.
- The PDF stream endpoint must verify the hash via `InvoiceStorage.fetch_pdf` before serving. If the bucket got tampered with, return 503 with a clear "integrity check failed" message — don't ship corrupted bytes.
- The customer-facing label "Faktury" maps to the legal tax invoices, not the ComGate charges. The renaming in SettingsPage is a small but meaningful UX shift; the existing test mocks for the Charges list still apply, just under the new heading.
- Frontend types regen needed once the new schemas land — `BACKEND_OPENAPI_URL=http://localhost:8000/api/v1/openapi.json pnpm run types:generate`.

### How to start commit #8

1. `cd backend && uv run alembic current` — head is `1a5b9f76b1ee`.
2. `cd backend && uv run pytest -q` — confirms 428 green.
3. Write `app/schemas/invoicing.py` first (small, easy to test).
4. Write `app/api/v1/invoices.py` with the 3 routes.
5. Register in `app/api/v1/__init__.py`.
6. Tests for the routes (happy / cross-org / draft / hash-verify).
7. Frontend: regenerate types, write the hook, add the new section in SettingsPage, rename existing card.
8. Gates, commit, update RESUME.

## Carryover from commits #1–7

- Endpoint URL `/api/v1/payments/invoices` (the legacy charge-list URL) intentionally not renamed — leave alone or fold into the new section in commit #8.
- `BillingSettings.seller_ico` / `seller_iban` are the legacy column names; snapshot fields use `issuer_*`. Worth a follow-up rename.
- WeasyPrint pinned `>=63.0,<64`; bumping breaks already-stored `pdf_sha256`.
- WeasyPrint emits `Ignored fill:#000000` warnings per render (QR SVG). Cosmetic.
- S3 storage path implemented but not exercised by tests.
- Commit #6 added `_wipe_invoices_for_org` helper to `test_payments.py`. Same pattern duplicated in `test_invoicing_scheduler.py:_teardown` and `test_invoicing_service.py:_teardown_invoices`. Worth promoting to a shared `tests/conftest.py` helper if a fourth use-site appears.
- The renewal-draft scheduler is registered as `renewal_draft_scheduler` at module level but **not** auto-started anywhere yet. Need to add `await renewal_draft_scheduler.start()` somewhere in app startup (probably `app/main.py`'s lifespan handler, alongside the existing freeing-sweep + recurring-charge schedulers). Check the existing pattern there. Add this in commit #8 or break it out separately — your call.
