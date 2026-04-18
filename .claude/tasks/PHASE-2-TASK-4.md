# Task 2.4 — Deal model + migration

## Goal
Add the `deals` table — the central CRM record the Kanban moves around.

## Design notes
- Per Section 7 of the brief: `value` (numeric) + `currency` varchar(3), NOT
  `value_czk`. This keeps the schema multi-currency-ready.
- `company_id` NOT NULL (a deal always belongs to a company — it can be the
  placeholder "My Company" row created during onboarding, but never NULL).
  CASCADE on company delete.
- `primary_contact_id` nullable; SET NULL on contact delete.
- `stage_id` NOT NULL; CASCADE restrict so a stage can't be deleted while it
  still has deals. Using `ON DELETE RESTRICT`.
- `probability_override` nullable int 0..100 (falls back to stage default).
  CHECK constraint.
- `owner_user_id` nullable; SET NULL on owner delete.
- `closed_at` + `lost_reason` nullable. `closed_at` is populated when the
  deal enters a won/lost stage. `lost_reason` short text.
- `expected_close_date` nullable date (not timestamptz — we don't care about
  time-of-day).
- Indexes per brief: `owner_user_id`, `stage_id`. Plus `organization_id`
  (via the company chain? No — denormalize an `organization_id` FK directly
  on the deal so the row-level filter in Phase 2.6 stays a single-table
  join). CASCADE on org delete.
- Currency defaults from the organization's `currency`; service-layer code
  will inject it. Schema just requires NOT NULL.

## Files in scope
- `app/db/models/deal.py`
- `app/db/models/__init__.py` — re-export.
- `alembic/versions/<rev>_phase2_deals.py`
- `tests/db/test_models_phase2.py` — extend: deal requires (company, stage,
  org); stage RESTRICT on delete; probability_override CHECK.

## Acceptance criteria
1. `alembic upgrade head` creates `deals`; `alembic check` clean.
2. Inserting a Deal with `value=42500.00, currency="CZK"` round-trips.
3. Deleting a Stage with deals attached raises IntegrityError.
4. `probability_override=150` raises IntegrityError.
5. Deleting a Company cascades its deals.
6. `organization_id` column present and indexed.
7. Suite + ruff + format + mypy all green.
8. One commit: `feat(db): deal table — Task 2.4`.

## Non-goals
- Stage-move endpoint — Phase 5.3.
- Won/lost flow — Phase 5.4.
- Deal CRUD endpoints — Phase 2.6.
