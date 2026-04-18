# Task 2.6c — Deals CRUD

## Goal
`/api/v1/deals/*` list/get/create/update/delete with the same org-scoped
row-level filters as companies (deals carry an `owner_user_id`). Create
defaults `currency` to the caller's org currency and validates that the
referenced company/stage/contact all live in the same tenancy.

## Files in scope
- `app/schemas/deal.py` — `DealCreate`, `DealUpdate`, `DealOut`.
- `app/api/v1/deals.py` — five endpoints.
- `app/api/v1/__init__.py` — mount.
- `tests/api/v1/test_deals.py` — per-endpoint happy/validation/denied tests
  plus cross-org and scoping.

## Design notes
- `DealCreate`: `name`, `company_id`, `stage_id` required; `owner_user_id`,
  `primary_contact_id`, `value` (Decimal, default 0), `currency` (defaults
  to the caller's org.currency), `expected_close_date`, `probability_override`
  optional. Cross-tenancy references 400.
- Scoping: salespeople see own + team + pool; manager sees team + pool;
  admin sees all. Delete is admin-only.
- Won/lost flows land in Phase 5; this task does plain CRUD only.

## Acceptance criteria
1. CRUD happy paths for admin / manager / salesperson.
2. Cross-org company/stage/contact refs 400.
3. `probability_override` out of range → 422.
4. Unknown stage in an update → 400.
5. Salesperson can't edit a deal owned by a non-teammate → 404
   (visibility-first).
6. Delete admin-only; non-admin 403.
7. Backend suite green; `types:check` regenerates.
8. One commit.
