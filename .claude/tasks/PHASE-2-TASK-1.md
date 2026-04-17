# Task 2.1 — Company + OwnershipHistory models + migration

## Goal
Add the tenancy-scoped `companies` table and the `ownership_history` audit
table that underlies the "auto-free after 365 days" feature (Phase 9).

## Design notes
- **All company records are scoped to `organization_id`** — CASCADE on
  organization delete. Phase 2.6 adds the row-level filter in queries.
- **ICO uniqueness**: scoped to (organization_id, ico) — two different orgs
  can each have the same ICO as a partner in their book. Nullable because
  non-Czech companies may have no IČO. Indexed for the lookup in 3.3.
- **`owner_user_id` is nullable** — a company may be in the pool (freed,
  never assigned). `ON DELETE SET NULL` so deleting a user doesn't cascade
  to their companies.
- **`last_order_at`** is a denormalized timestamp of the most recent won
  deal; updated by the won-deal flow (Task 5.4). Its purpose is to make
  `ownership_expires_at` computable without a subquery on deals.
- **`ownership_expires_at`** lives as a `Computed` (generated) column:
  `COALESCE(last_order_at, created_at) + INTERVAL '365 days'`. Alembic
  supports this via `sa.Computed`. Indexed for the freeing job.
- **OwnershipHistory** captures assignment events. `reason` is a Postgres
  enum: `initial`, `reassigned`, `freed_timeout`, `won_deal_refresh`.
  `released_at` is nullable (null = still the owner).

## Files in scope
- `app/db/models/enums.py` — add `OwnershipChangeReason`.
- `app/db/models/company.py` — Company.
- `app/db/models/ownership_history.py` — OwnershipHistory.
- `app/db/models/__init__.py` — re-exports.
- `alembic/versions/<rev>_phase2_companies.py` — tables + indexes +
  generated column.
- `tests/db/test_models_phase2.py` — company CRUD smoke, ownership_expires_at
  computed correctly, OwnershipHistory insert.

## Acceptance criteria
1. `alembic upgrade head` creates `companies` + `ownership_history` + the
   `ownership_change_reason` enum; `alembic check` reports no pending ops.
2. Inserting a company with `created_at` and no `last_order_at` produces
   `ownership_expires_at = created_at + 365 days` (computed column).
3. Setting `last_order_at` updates `ownership_expires_at` automatically on
   the next read — because it's generated.
4. `ownership_history` insert works; FK to user + company is enforced.
5. Existing suite still passes; new tests pass; ruff + format + mypy clean;
   `types:check` still green (no API changes in this task).
6. One commit: `feat(db): company + ownership history tables — Task 2.1`.

## Non-goals
- CRUD endpoints — Task 2.6.
- Freeing job — Phase 9.
- Company-detail UI — Phase 4.
