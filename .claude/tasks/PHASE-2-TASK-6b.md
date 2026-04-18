# Task 2.6b — Contacts CRUD

## Goal
`/api/v1/contacts/*` list/get/create/update/delete. Contacts are purely
org-scoped (no `owner_user_id`), so the role-based filter from 2.6a doesn't
apply — everyone in the org can see every contact. Admin-only delete to
mirror companies.

## Files in scope
- `app/schemas/contact.py` — `ContactCreate`, `ContactUpdate`, `ContactOut`.
- `app/api/v1/contacts.py` — five endpoints.
- `app/api/v1/__init__.py` — mount.
- `tests/api/v1/test_contacts.py` — per-endpoint happy/validation/denied;
  cross-org 404.

## Acceptance criteria
1. List returns paginated contacts scoped to the caller's org.
2. Get returns 404 when the contact belongs to another org.
3. Create enforces: unique `email` per org → 409, bad email → 422.
4. Update allows any org member (no owner-based filter).
5. Delete is admin-only.
6. Every endpoint has ≥ 3 tests.
7. Suite green; ruff/format/mypy clean; types:check regenerated.
8. One commit.
