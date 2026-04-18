# Task 3.3 — Add company modal with live IČO lookup

## Goal
A "Přidat firmu" modal on the companies list page. Typing an 8-digit IČO
calls `/api/v1/companies/lookup-registry` on blur (or explicit "Najít"
click); on success the fields prefill, admin reviews, hits "Uložit" →
POST `/api/v1/companies`, modal closes, list refetches.

## State machine
- **empty** — IČO field blank.
- **loading** — query in flight.
- **success** — ARES returned a match; fields prefilled.
- **not_found** — 404 from lookup; show friendly Czech error, keep manual
  fields editable so the admin can still enter something.
- **error** — 429 / 502 / network; show retry CTA.

## Files in scope
- `frontend/src/app/companies/useLookupRegistry.ts` — typed query hook.
- `frontend/src/app/companies/useCreateCompany.ts` — mutation hook.
- `frontend/src/app/companies/AddCompanyModal.tsx` — modal UI.
- `frontend/src/app/companies/CompaniesListPage.tsx` — mount the trigger
  button + modal; invalidate the list query on successful create.
- `frontend/src/__tests__/addCompanyModal.test.tsx` — vitest coverage:
  happy path prefill + save; 404 keeps manual fields; 429 shows retry.

## Acceptance criteria
1. Clicking "Přidat firmu" opens the modal.
2. Entering `27082440` and blurring the IČO field fires the lookup; a
   success response prefills the form.
3. Submitting posts to `/companies`, closes the modal, invalidates the
   companies list query.
4. 404 on lookup shows a friendly Czech message; user can still save with
   whatever fields they've typed.
5. 429 / 502 on lookup shows the appropriate error state with a "Zkusit
   znovu" control that re-fires the query.
6. `pnpm lint` / `typecheck` / `test` / `format:check` / `build` all green.
7. One commit: `feat(frontend): add-company modal with ARES lookup — Task 3.3`.
