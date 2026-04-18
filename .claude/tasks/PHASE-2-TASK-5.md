# Task 2.5 — Activity model + migration

## Goal
A polymorphic audit log — any meaningful user action on a company, contact,
or deal lands in one row so Phase 4's detail pages can render an activity
timeline.

## Design notes
- Polymorphic via `(entity_type, entity_id)` rather than separate FKs because
  the set of linked entity types can grow without schema churn. FKs are *not*
  enforced at the DB level for the polymorphic link (there's no single parent
  table to reference). The service layer validates `entity_type` against a
  known enum.
- `user_id` is the actor — nullable (system jobs like the freeing cron can
  emit activities with `user_id=NULL`). SET NULL on user delete so history
  survives.
- `organization_id` denormalized for the row-level filter (Phase 2.6) and
  for efficient pruning if an org is deleted. CASCADE on org delete.
- `payload` is JSONB — free-form extra context (stage transition before/after,
  deal value changes, lost_reason, etc.).
- `activity_type` enum — named (`note`, `stage_change`, `owner_change`,
  `deal_won`, `deal_lost`, `company_freed`, `ownership_reassigned`). Add as
  we need them.
- Indexes per brief: `(entity_type, entity_id)` composite, `created_at`, plus
  `organization_id`, `user_id` for filters.

## Files in scope
- `app/db/models/enums.py` — `ActivityEntityType`, `ActivityType`.
- `app/db/models/activity.py`
- `app/db/models/__init__.py` — re-export.
- `alembic/versions/<rev>_phase2_activities.py`
- `tests/db/test_models_phase2.py` — add ≥ 2 tests: insert with JSONB payload,
  user delete nulls `user_id`, query by `(entity_type, entity_id)`.

## Acceptance criteria
1. `alembic upgrade head` creates `activities` + the two enum types;
   `alembic check` clean; round-trips.
2. Insert + read an Activity with a nested JSONB payload.
3. Deleting the acting user nulls `user_id` on their activities.
4. Suite + ruff + format + mypy strict clean.
5. One commit: `feat(db): activity log — Task 2.5`.
