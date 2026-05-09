# Resume: INVOICES_TASK.md commit #8b (frontend) + #9

**Last completed:** *feat(invoicing): customer-facing tax-invoice endpoints (backend)* — commit #8 split into 8a (backend, just landed) and 8b (frontend UI, not yet started).

## State at session end

- Migration head: `1a5b9f76b1ee` (no schema changes since #2).
- New backend module `app/api/v1/invoices.py` — three routes under `/api/v1/organizations/current/invoices`:
  - `GET ` — paginated list, drafts excluded, ordered by `issued_at desc`
  - `GET /{id}` — full detail with eagerly-loaded lines; 404 (not 403) on cross-org
  - `GET /{id}/pdf` — streams `application/pdf` from `InvoiceStorage.fetch_pdf` (hash-verified). Returns 503 with `code=invoice_integrity_failure` if the bytes fail verification.
- New `app/schemas/invoicing.py` with `TaxInvoiceOut`, `TaxInvoiceList`, `TaxInvoiceLineOut`, `TaxInvoiceDetailOut`. Distinct from `ChargeOut` / `ChargeList`.
- Router registered in `app/api/v1/__init__.py` under org-membership but **not** trial-gated (a gated org must still download their PDFs).
- 5 new tests in `tests/api/v1/test_invoices.py`: list happy-path, list excludes drafts, detail with lines, cross-org 404, PDF stream byte-validity.
- Backend suite: **433 passed** (428 → 433). mypy strict, ruff clean. Three commits ahead of `origin/main` after this commit lands.

## Next: commit #8b — frontend UI for the "Faktury" sub-tab

The customer-facing UI per `docs/prompts/INVOICES_TASK.md` §9 F1.

### Files to touch / create

- `frontend/src/components/billing/useTaxInvoices.ts` — NEW. React Query hooks:
  - `useTaxInvoices()` → `apiFetch<TaxInvoiceList>("/api/v1/organizations/current/invoices?limit=50")`
  - `useTaxInvoiceDetail(id)` → `/api/v1/organizations/current/invoices/{id}`
  - PDF download via raw `fetch` to `/api/v1/organizations/current/invoices/{id}/pdf` with `credentials: include` and the access token — see how `useExportCsv.ts` does it for the binary-stream + `triggerDownload` pattern.
- `frontend/src/types/api.generated.ts` — regenerate with the new schemas (`BACKEND_OPENAPI_URL=http://localhost:8000/api/v1/openapi.json pnpm run types:generate`).
- `frontend/src/app/settings/SettingsPage.tsx` — add a new "Faktury" section under the "Předplatné" tab. The existing list of ComGate charges (currently labeled "Faktury") should be renamed to "Platby" — rows are payment attempts, not invoices.
- Optional new test in `frontend/src/__tests__/` — table renders, status pills, click-row opens drawer, "Stáhnout PDF" button calls the right URL.

### UI per §9 F1
- Table columns (TanStack): `Číslo` / `Datum vystavení` / `Splatnost` / `Stav` / `Celkem` / [download icon]
- Status pills: `Vystavena` (info) / `Zaplacena` (success) / `Po splatnosti` (danger) / `Stornována` (neutral, strikethrough) / `Dobropis` (info with corner badge for `kind=credit_note`)
- Empty state: line-art illustration + `Zatím nemáte žádné faktury. Po první platbě tu uvidíte přehled.`
- Click row → detail drawer with all fields + lines table + `Stáhnout PDF` button
- Mobile: stacked cards with download action
- **No magenta** anywhere on the screen — financial records are operational density, not celebration

### How to start

1. `cd backend && uv run uvicorn app.main:app --reload --port 8000` (or restart the existing one) so the new schemas are available for types-regen.
2. `cd frontend && BACKEND_OPENAPI_URL=http://localhost:8000/api/v1/openapi.json pnpm run types:generate`. Verify `TaxInvoiceOut` etc. appear in `api.generated.ts`.
3. Write `useTaxInvoices.ts` mirroring `usePayments.ts`'s shape.
4. Add the section to SettingsPage. The Czech label "Faktury" goes to the new section; rename the existing Charges section to "Platby".
5. Frontend gates: `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build`.
6. Commit. RESUME → commit #9.

## Then: commit #9 — `feat(admin): super-admin invoices browser`

Top-level tab `/admin/faktury`. Filter bar (year, status multi-select, druh, org typeahead, date range, free text). Big table with action menu (zobrazit PDF / stáhnout ISDOC / odeslat / označit zaplacenou / stornovat / vytvořit dobropis). Detail drawer with audit-log timeline. Header buttons: "Vystavit ručně", "Export roku".

This needs **NEW super-admin endpoints** — `GET /admin/invoices`, action endpoints (issue / send / mark-paid / void / credit-note), audit-log endpoint. All in `app/api/v1/admin.py` or a new `app/api/v1/admin_invoices.py` (the existing admin.py is already big — leaning toward splitting).

## Carryover from commits #1–8a

- WeasyPrint pinned `>=63.0,<64`; bumping breaks already-stored `pdf_sha256`.
- `BillingSettings.seller_ico/seller_iban` legacy column names; snapshot uses `issuer_*`. Worth a follow-up rename.
- The `_wipe_invoices_for_org` cleanup pattern is duplicated in 4 test files now (`test_payments.py`, `test_invoices.py`, `test_invoicing_service.py`, `test_invoicing_scheduler.py`). **Promote to a shared helper in `tests/conftest.py` before the next test file uses it** — that's now the threshold.
- Renewal-draft scheduler is registered as `renewal_draft_scheduler` but **not auto-started**. Wire into `app/main.py` lifespan in commit #8b or later.
- WeasyPrint emits `Ignored fill:#000000` warning per render (QR SVG). Cosmetic.
- S3 storage path implemented but not exercised by tests.
- The PDF stream test in `test_invoices.py` writes to the default `var/invoices/` (not `tmp_path`) because the route's `InvoiceStorage()` is instantiated inside the handler with default settings. Cleaner long-term: `Depends(get_storage)` so tests can override. For now, `var/invoices/` is gitignored, so pollution is harmless on CI.
