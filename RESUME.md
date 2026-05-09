# Resume: INVOICES_TASK.md commit #9

**Last completed:** *feat(invoicing): customer "Faktury" sub-tab with PDF download* — frontend half of commit #8 from INVOICES_TASK.md. Backend half landed in the previous commit.

Commit #8 was split into two:
- 8a (`0b32111`) — backend list/detail/PDF endpoints + 5 tests
- 8b (this commit) — frontend `TaxInvoicesCard` + `useTaxInvoices` hook + `useDownloadTaxInvoicePdf` mutation + renamed legacy `InvoicesCard` → `PaymentsCard`

## State at session end

- 6 commits ahead of `origin/main` since the invoicing work began.
- Backend: 433 tests, mypy strict, ruff format + check clean.
- Frontend: 79 tests pass, lint clean, typecheck clean, `pnpm build` green.
- `frontend/src/components/billing/useTaxInvoices.ts` defines `TaxInvoiceOut` / `TaxInvoiceList` / `TaxInvoiceDetailOut` etc. by hand. The OpenAPI types in `api.generated.ts` were **not** regenerated this commit (backend wasn't running). Re-run before commit #9 to keep the generated file aligned: `BACKEND_OPENAPI_URL=http://localhost:8000/api/v1/openapi.json pnpm run types:generate` (start backend first).
- SettingsPage now shows two cards under "Předplatné": **Faktury** (tax invoices, with download icon) above **Platby** (ComGate charge attempts). Renaming the existing `useInvoices` hook in `usePayments.ts` was **not** done — the hook still exists under that name (it returns `ChargeList`). Renaming to `useCharges` is mechanical follow-up; not blocking #9.

## Next: commit #9 — `feat(admin): super-admin invoices browser`

Per `docs/prompts/INVOICES_TASK.md` §9 F2. Top-level admin tab `/admin/faktury` with filters, action menu, detail drawer with audit-log timeline.

### Backend additions

A new module — leaning toward `backend/app/api/v1/admin_invoices.py` (the existing `admin.py` is already large; splitting keeps both readable). Routes:

- `GET /admin/invoices` — paginated list across **all** orgs, with rich filters: `year`, `status[]` (multi), `kind`, `org_id`, `date_from`, `date_to`, free-text `q` over invoice number / customer_name. Returns `{ items, total, facets }` where `facets` aggregates (year-counts, status-counts) for the filter chips.
- `GET /admin/invoices/{id}` — full detail incl. issuer snapshot + customer snapshot + lines + audit-log entries (eager-loaded, descending `created_at`).
- `POST /admin/invoices/{id}/send` — call `InvoiceMailer.send`; returns updated audit log.
- `POST /admin/invoices/{id}/mark-paid` — body `{ paid_at, payment_method, note? }`. Calls `InvoiceService.mark_paid`. Idempotent if already paid (returns 409).
- `POST /admin/invoices/{id}/void` — body `{ reason }`. Calls `InvoiceService.void`. 409 if already voided.
- `POST /admin/invoices/{id}/credit-note` — body `{ reason, lines? }`. Calls `InvoiceService.issue_credit_note`. Returns the new credit-note row.
- `GET /admin/invoices/{id}/audit-log` — separate endpoint for the timeline (since the detail might not need it on the list pivot).

All routes guarded by `Depends(require_super_admin)`.

The existing `InvoiceService` already has `mark_paid`, `void`, `issue_credit_note`, and `_issue_internal` for manual issuance. The audit-log writes are already correct in those service methods. No new service-layer work is strictly required — the new routes are mostly thin wrappers + a list query.

### Frontend additions

- New route under the super-admin shell — `/admin/faktury`. Mirror the existing `/admin/orgs` listing's table-with-filters pattern.
- New hook file `frontend/src/app/admin/useAdminInvoices.ts` — list query (parameterized), detail query, action mutations.
- New page `frontend/src/app/admin/AdminInvoicesPage.tsx` — TanStack Table with columns from §9 F2, filter bar, action menu (zobrazit PDF / stáhnout ISDOC / odeslat / označit zaplacenou / stornovat / vytvořit dobropis), header buttons "Vystavit ručně" + "Export roku".
- Detail drawer with audit-log timeline (events sorted desc, distinct icons per `event` value).
- "Vystavit ručně" + "Export roku" wire to commits #10 and #11 respectively — for #9, render them as disabled with "TODO" tooltip, OR leave them out and add in #10/#11. **Leaning toward leaving them out** so #9 stays small.

### Files to create / touch

Backend:
- `backend/app/api/v1/admin_invoices.py` (new)
- `backend/app/api/v1/__init__.py` — register the new router
- `backend/app/schemas/admin_invoicing.py` (new) — `AdminInvoiceListItem`, `AdminInvoiceDetail`, `AdminInvoiceAuditEntry` schemas
- `backend/tests/api/v1/test_admin_invoices.py` (new) — list filters, detail, mark-paid, void, credit-note, send

Frontend:
- `frontend/src/app/admin/useAdminInvoices.ts` (new)
- `frontend/src/app/admin/AdminInvoicesPage.tsx` (new)
- `frontend/src/app/admin/AdminLayout.tsx` (or wherever the admin nav lives) — add the "Faktury" tab
- `frontend/src/types/api.generated.ts` — regenerate

### Watch-outs for #9

- The list page can return tens of thousands of rows once we've been live a year. Default to `limit=50` + offset paging; index check: `ix_invoice_org_issued` and `ix_invoice_year_status` should cover the common queries. Add `ix_invoice_status_issued_at` if filtering by status alone is slow.
- Cross-org access in admin endpoints means the org_id filter is *opt-in*, not *required* — opposite of the customer endpoints. Be careful in the route impl.
- `InvoiceMailer.send` requires the org's primary email — fall back to the admin user(s) of the org if `customer_email` snapshot is empty. Already handled in `InvoiceMailer`; just confirm.
- The audit-log writes inside `mark_paid` etc. need an actor user id — pass `actor_user_id=current_super_admin.id` so the timeline shows who clicked the button.

## Carryover from earlier commits

- `BillingSettings.seller_ico/seller_iban` legacy column names; snapshot uses `issuer_*`. Worth a follow-up rename.
- The `_wipe_invoices_for_org` cleanup pattern is duplicated in 4 test files (`test_payments.py`, `test_invoices.py`, `test_invoicing_service.py`, `test_invoicing_scheduler.py`). **Promote to a shared helper in `tests/conftest.py` before the next test file uses it** — that's the threshold.
- `useInvoices` in `usePayments.ts` is misnamed — it returns `ChargeList`. Rename to `useCharges` in a separate cleanup commit.
- Renewal-draft scheduler is registered as `renewal_draft_scheduler` but **not auto-started** in `app/main.py` lifespan. Wire it up.
- WeasyPrint emits `Ignored fill:#000000` warning per render (QR SVG). Cosmetic.
- S3 storage path implemented but not exercised by tests.
- The PDF stream test in `test_invoices.py` writes to the default `var/invoices/` (not `tmp_path`). Cleaner long-term: `Depends(get_storage)` so tests can override. For now `var/invoices/` is gitignored.
- `api.generated.ts` was not regenerated in commit #8b — re-run `pnpm run types:generate` before #9.
