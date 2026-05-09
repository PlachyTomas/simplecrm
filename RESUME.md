# Resume: INVOICES_TASK.md — DONE

**All 14 commits of INVOICES_TASK.md have landed.** The Czech-law-compliant tax-invoicing system is feature-complete. This file is now an archive of the journey + a pointer to the operations runbook.

## What's done

| # | Commit | Hash | Summary |
|---|---|---|---|
| 1 | foundation | (rebased) | Charge rename + Invoice models + triggers |
| 2 | issuer fields | (rebased) | BillingSettings extension |
| 3 | renderer | 36d38a4 | WeasyPrint PDF + ISDOC XML |
| 4 | storage | 126343f | S3 + local fallback + hash verification |
| 5 | service | 926f500 | InvoiceService orchestrator + InvoiceMailer |
| 6 | webhook hook | 3fde7d4 | Auto-issue on ComGate paid |
| 7 | scheduler | edfa448 | Daily renewal-draft job |
| 8a | customer api | 0b32111 | List/detail/PDF endpoints (backend) |
| 8b | customer ui | 9743229 | Faktury sub-tab + PDF download |
| 9 | admin ui | 2f3550b | Cross-org invoices browser + actions |
| 10 | manual builders | e5cb5e7 | Manual + credit-note modals |
| 11 | year exports | b0a52be | CSV / PDF ZIP / full ZIP |
| 12 | integrity | ef62fed | Walker + dashboard + weekly scheduler |
| 13 | tests | d5d6ca5 | Cleanup helper consolidation + happy-path integration suite |
| 14 | docs | (this commit) | docs/invoicing.md operations runbook |

## Final state

- 12 commits ahead of `origin/main`. Push when ready: `git push origin main`.
- Backend: 455 tests, mypy strict on `app/` clean, ruff check + format clean.
- Frontend: 79 tests pass, lint clean, typecheck clean, `pnpm build` green.
- See `docs/invoicing.md` for the operational runbook (founder workflows, customer surface, architecture, configuration, common issues, Czech compliance gotchas).

## Carryover items NOT addressed in this 14-commit series

These are nice-to-haves that don't block production. Pick up in a follow-up cleanup commit when convenient:

1. **Rename `BillingSettings.seller_ico/seller_iban` → `issuer_ico/issuer_iban`.** The snapshot fields use `issuer_*`; the source columns still use the legacy `seller_*` names. Pure cosmetic; requires a small migration + a ripple through `_require_issuer_configured`.
2. **Rename `useInvoices` → `useCharges` in `usePayments.ts`.** Hook name predates the Charge/Invoice split; misleading.
3. **Run `BACKEND_OPENAPI_URL=… pnpm run types:generate`.** Six commits' worth of new Pydantic schemas haven't been pulled into `api.generated.ts`. The admin hooks (`frontend/src/admin/useAdminInvoices.ts`, `IntegrityPanel.tsx`) are hand-typed; switch to generated types after regen.
4. **Loosen `apiFetch` body type or add index signatures.** Manual + credit-note hooks cast through `unknown` because `Record<string, unknown>` doesn't accept their `interface` types.
5. **Test-fixture `AsyncIterator` vs `AsyncGenerator` typing.** Pre-existing mypy noise across many fixtures; not blocking.
6. **WeasyPrint `Ignored fill:#000000` warning.** Cosmetic per-render warning from the QR SVG. Harmless.
7. **S3 storage path not exercised by tests.** Local fallback is, but the boto3 path runs only in prod. Worth a moto-mocked test eventually.
8. **`var/invoices/` host pollution.** Several tests issue against the default storage which writes to `backend/var/invoices/`. Gitignored, but a cleaner long-term fix is `Depends(get_storage)` so tests can override per-call.
9. **`drag-login.png` in repo root.** Stray screenshot from a debugging session — not gitignored but never committed. Should add to `.gitignore` or delete.

## Resolved during this 14-commit series

- ~~Renewal-draft scheduler not auto-started in lifespan~~ → wired in `app/main.py` (commit #12)
- ~~Cleanup helper duplicated across 6 test files~~ → promoted to `tests/conftest.py` (commit #13)
- ~~Credit-note exceeds-original guard~~ → enforced in `InvoiceService.issue_credit_note` + 409 in admin route (commits #5 + #9)
- ~~Idempotency at the invoice level~~ → asserted in tests (commits #5 + #13)
- ~~Trigger immutability of issued rows~~ → asserted in tests (commits #1 + #13)

For day-to-day operations, work from `docs/invoicing.md`. This RESUME file is now historical.
