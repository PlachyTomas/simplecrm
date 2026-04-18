# Task 2.6a — Companies CRUD + row-level scoping helpers

## Goal
Shipped: `/api/v1/companies` list/get/create/update/delete with org-scoped,
role-aware row filters. Also the shared pagination + scoping helpers that
contacts (2.6b) and deals (2.6c) will reuse.

## Design notes

### Pagination
`limit`/`offset` query params; default `limit=50`, max `limit=100`.
Response shape `{items, total}` so TanStack Query can display counts.
A small generic wrapper in `app/schemas/pagination.py` keeps it uniform.

### Row-level scoping — rule by role
For any resource with an `owner_user_id` column:
- **admin** — every row in the user's organization.
- **manager** — every row in the org with `owner_user_id` NULL or belonging
  to a member of the manager's team OR belonging to the manager themselves.
- **salesperson** — rows owned by the salesperson themselves OR by a teammate
  (shared team visibility so deals can be handed off), plus unowned rows
  (so the company pool is visible).

Helper: `app/core/scoping.py::scope_by_owner(stmt, user, owner_col)` returns
the statement with the right WHERE clause applied.

### Company-specific quirks
- ICO uniqueness per-org is a schema invariant; POST/PUT should surface a
  friendly 409 if the user tries to create a duplicate.
- `owner_user_id` may be set on create (admin assigns) or left null (goes
  into pool).

## Files in scope
- `app/schemas/pagination.py` — `Page[T]` generic wrapper + `PaginationParams`
  dependency.
- `app/core/scoping.py` — `scope_by_owner` helper; `team_member_ids(session,
  user)` utility.
- `app/schemas/company.py` — `CompanyCreate`, `CompanyUpdate`, `CompanyOut`.
- `app/api/v1/companies.py` — the five endpoints.
- `app/api/v1/__init__.py` — mount router.
- `tests/services/test_scoping.py` — unit tests for the scoping helper with
  admin / manager / salesperson users.
- `tests/api/v1/test_companies.py` — per-endpoint happy, validation,
  permission-denied; plus cross-org isolation and role visibility scenarios.

## Acceptance criteria
1. `GET /companies` — list for admin = all org rows; for manager = team +
   unowned; for salesperson = self + team + unowned. Paginated; `total`
   correct.
2. `GET /companies/{id}` — 404 if the row is outside the caller's org.
3. `POST /companies` — admin + manager can assign any owner; salesperson
   creates a row owned by themselves.
4. `PUT /companies/{id}` — admins can edit anything in their org; managers
   only rows whose owner is on their team (or unowned); salespeople only
   their own rows.
5. `DELETE /companies/{id}` — admin-only for MVP (per the brief's role split
   — salespeople don't delete customers).
6. Every endpoint has ≥ 3 tests (happy / validation / permission-denied).
7. Cross-user-denied test: salesperson from org A can't read a company from
   org B even by id.
8. ICO collision returns 409.
9. Backend suite stays green; frontend `types:check` passes after regen.
10. One commit: `feat(api): companies CRUD + org-scoped row filters — Task 2.6a`.

## Non-goals
- ARES lookup — Phase 3.
- `/companies/{id}/reassign` — touched in Phase 9 freeing job work.
- Frontend list — Task 2.7.
