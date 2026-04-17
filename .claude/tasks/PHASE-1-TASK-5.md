# Task 1.5 — First-time onboarding flow

## Goal
Finish Phase 1 by letting a fresh admin set their organization's real name,
IČO, DIČ, and address right after they sign in. The Organization record is
already created on first login (Task 1.2); onboarding updates the placeholder
into the real legal entity.

## Design notes
- **Onboarding "required" signal** = `organization.ico IS NULL`. First-login
  gives the org a placeholder name and no IČO; completing onboarding requires
  filling the IČO (so we derive state from the data, not a separate flag).
- **Endpoint**: `PUT /api/v1/organizations/current`. Admin-only. Accepts an
  optional subset of: name, ico, dic, address_street, address_city,
  address_zip, legal_form. Returns the updated `OrganizationSummary`.
- **ARES auto-fill** lands in Phase 3 — the onboarding form in this task is
  purely manual entry. The form is written so IČO blur/change will trigger
  the lookup in 3.3 without a rewrite.
- **OrganizationSummary gains `ico`** — the frontend needs to read it to
  decide whether to render the onboarding modal.
- **Route-level UX**: render the onboarding form as a blocking modal (not a
  separate route) — the user must complete it before they can use the CRM,
  but the app shell is still visible behind it so they understand where
  they are.

## Files in scope
### Backend
- `app/schemas/auth.py` — add `ico` (nullable) to `OrganizationSummary`.
- `app/schemas/organization.py` — `OrganizationUpdate` input,
  `OrganizationOut` output.
- `app/api/v1/organizations.py` — `GET /organizations/current`,
  `PUT /organizations/current`.
- `app/api/v1/__init__.py` — mount router.
- `tests/api/v1/test_organizations.py` — happy path update, validation on
  IČO (exactly 8 digits), unauthorized (401), forbidden for non-admin (403),
  user from one org cannot view another org (cross-user-denied — but in
  MVP "current" always resolves to the user's own org, so this is the
  "no leak" test: second admin's GET returns their own org, not someone
  else's).

### Frontend
- `src/app/OnboardingForm.tsx` — the modal form.
- `src/app/AppShell.tsx` — render the form when `user.organization.ico` is
  null and the user is an admin.
- Regenerate `src/types/api.generated.ts`.

## Acceptance criteria
1. `GET /organizations/current` returns the current user's org.
2. `PUT /organizations/current` as admin with `{name:"Alza a.s.", ico:"27082440"}`
   updates the row; subsequent `/auth/me` returns the new name and ico.
3. Same PUT as a salesperson returns 403.
4. Malformed IČO (letters, wrong length) returns 422.
5. Frontend: when `user.organization.ico` is null, the onboarding modal
   appears over the app shell and blocks interaction; on submit it calls
   PUT and invalidates `/auth/me`; once the new `/me` returns an ico, the
   modal closes automatically.
6. Lint / typecheck / test / format / build all green both apps.
7. `types:check` regenerates cleanly.
8. One commit.

## Non-goals
- ARES lookup (Phase 3).
- Validation of IČO checksum (just length + digits for now).
- Editing the org outside onboarding (Phase 10's settings page).
