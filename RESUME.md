# Resume: INVOICES_TASK.md commit #10

**Last completed:** *feat(admin): super-admin invoices browser* — commit #9 of INVOICES_TASK.md.

## State at session end

- 7 commits ahead of `origin/main` since the invoicing work began.
- Backend: 442 tests, mypy strict, ruff format + check clean.
- Frontend: 79 tests pass, lint clean, typecheck clean, `pnpm build` green.
- New super-admin `/admin/faktury` tab with table + filter chips + detail drawer + audit-log timeline.
- Action endpoints wired: mark-paid (409 if already paid), void, send. Credit-note endpoint exists in the backend but **no UI builder yet** — that's commit #10.
- New backend module `backend/app/api/v1/admin_invoices.py` (separate from the already-large `admin.py`). Schemas in `backend/app/schemas/admin_invoicing.py`. 9 new tests in `backend/tests/api/v1/test_admin_invoices.py`.
- `api.generated.ts` was **not** regenerated this commit — admin-side types are hand-written in `frontend/src/admin/useAdminInvoices.ts`. The backend OpenAPI now exposes `AdminInvoiceListItem`/`AdminInvoiceDetail`/etc., so re-running `BACKEND_OPENAPI_URL=… pnpm run types:generate` would let the admin hooks switch to generated types.

## Next: commit #10 — `feat(admin): manual invoice + credit-note builders`

Per INVOICES_TASK.md §6 + §9. Two parallel UIs the founder uses:

1. **Vystavit ručně** — header button on `/admin/faktury`. Opens a modal with: org typeahead (`useAdminOrgList`), line builder (table-style: description, quantity, unit_label, unit_price_minor, vat_rate_percent), note field, optional `due_at` override. Submit calls `POST /admin/invoices/manual` (NEW endpoint) which wraps `InvoiceService.issue_manual`.
2. **Vystavit dobropis** — promote the placeholder text in the detail drawer into a real builder. Modal with the original invoice's lines pre-filled at *negative* quantities, editable; reason field. Submit calls the existing `POST /admin/invoices/{id}/credit-note`.

### Backend additions for #10

- `POST /admin/invoices/manual` in `admin_invoices.py`:
  - body: `{ org_id, lines: [{description, quantity, unit_price_minor, unit_label?, vat_rate_percent?}], note?, due_at?, taxable_supply_date? }`
  - calls `InvoiceService.issue_manual(...)`
  - returns `AdminInvoiceDetail` of the new row
- Schema: `AdminManualInvoiceIn` + `AdminManualLineIn` in `schemas/admin_invoicing.py`. The `lines` shape is intentionally close to `AdminCreditNoteLineIn` — could share a base type.
- Tests in `test_admin_invoices.py`: happy path, blocks if BillingSettings unconfigured, blocks if org doesn't exist, validates line quantities.

### Frontend additions for #10

- `frontend/src/admin/ManualInvoiceModal.tsx` — modal with org typeahead + line builder (TanStack Table or hand-rolled). State: `lines: ManualLineDraft[]`. Add/remove/reorder rows. Real-time total preview using the issuer's DPH state from the new public `/api/v1/plans/billing-settings/public` endpoint (or an admin variant if needed).
- `frontend/src/admin/CreditNoteModal.tsx` — modal driven by an existing invoice. Pre-fills negated lines from the parent. Reason required.
- "Vystavit ručně" button in `InvoicesList.tsx` header. Wire to ManualInvoiceModal.
- "Vystavit dobropis" button in `InvoiceDetailDrawer.tsx` — replace the placeholder text with this.
- Hooks: `useIssueManualInvoice` mutation (POST /admin/invoices/manual). Existing `issue_credit_note` API call moves into a fresh `useIssueCreditNote` mutation hook (currently the credit-note endpoint isn't wired to a hook because the UI placeholder didn't call it).

### Watch-outs for #10

- `InvoiceService.issue_manual` requires `BillingSettings.issuer_*` populated. UI should preflight with a check + inline "Doplňte fakturační údaje" link if not configured. Already-existing `AdminBillingSettings` is the destination.
- DPH-on/off: when `issuer_is_vat_payer=False`, the line VAT is always 0 — disable the VAT rate input in the line builder when not a payer.
- The line preview math is duplicated between FE and BE. Acceptable: the BE recomputes authoritatively, FE preview is courtesy. Don't over-engineer a shared formula.

## Commits #11 onward (still TODO)

- #11 — year export jobs (CSV/ZIP/full-year)
- #12 — archive integrity dashboard
- #13 — broader test suites
- #14 — `docs/invoicing.md`

## Carryover (still applies after #9)

- `BillingSettings.seller_ico/seller_iban` legacy column names; snapshot uses `issuer_*`. Worth a follow-up rename.
- The `_wipe_invoices_for_org` cleanup pattern is duplicated in 5 test files now (`test_payments.py`, `test_invoices.py`, `test_invoicing_service.py`, `test_invoicing_scheduler.py`, `test_admin_invoices.py`). **Promote to a shared helper in `tests/conftest.py` before the next test file uses it.** This is past the threshold — do it as part of #10 cleanup.
- `useInvoices` in `usePayments.ts` is misnamed — it returns `ChargeList`. Rename to `useCharges` in a separate cleanup commit.
- Renewal-draft scheduler is registered as `renewal_draft_scheduler` but **not auto-started** in `app/main.py` lifespan. Wire it up.
- WeasyPrint emits `Ignored fill:#000000` warning per render (QR SVG). Cosmetic.
- S3 storage path implemented but not exercised by tests.
- The PDF stream test in `test_invoices.py` writes to the default `var/invoices/` (not `tmp_path`). Cleaner long-term: `Depends(get_storage)` so tests can override. For now `var/invoices/` is gitignored.
- `api.generated.ts` regen lagging two commits (#8 + #9). Worth running before #10 lands so the admin hooks can swap to generated types.
