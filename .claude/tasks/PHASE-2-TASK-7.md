# Task 2.7 — Companies list + detail (read-only)

## Goal
First screens in the authed app: a companies index at `/app/companies` and a
detail screen at `/app/companies/:id`. Read-only — create/edit/delete live in
Phase 4.

## Files in scope
- `frontend/src/app/companies/useCompanies.ts` — TanStack Query list hook.
- `frontend/src/app/companies/useCompany.ts` — single-company hook.
- `frontend/src/app/companies/CompaniesListPage.tsx` — simple semantic table.
- `frontend/src/app/companies/CompanyDetailPage.tsx` — header + field grid.
- `frontend/src/app/AppShell.tsx` — add a nav entry + nested routes.
- `frontend/src/App.tsx` — wire up child routes.
- `frontend/src/__tests__/companies.test.tsx` — list renders rows; detail
  renders fetched company; row click navigates.

## Design rules
- Types come exclusively from `components["schemas"]["CompanyOut"]` and
  `components["schemas"]["Page_CompanyOut_"]`.
- Empty state: Czech copy + CTA-less placeholder (full empty-state per
  ui-design.md §5.9 lands with Phase 4's create modal).
- Currency + dates via `Intl` with the org locale (from `useCurrentUser`).

## Acceptance criteria
1. `/app/companies` renders a table with the current user's companies;
   empty state when total = 0.
2. Clicking a row navigates to `/app/companies/:id` and the detail page
   fetches the single company.
3. Detail page renders IČO in monospace (ui-design §3.1) and dates via Intl.
4. `pnpm lint`, `typecheck`, `test`, `build`, `format:check` all green.
5. Backend suite unchanged (no API edits).
6. One commit: `feat(frontend): companies list + detail — Task 2.7`.
