# Task 2.3 — Pipeline + Stage + default seed

## Goal
Every organization gets a default sales pipeline with 6 stages, created at the
moment the org is provisioned. Phase 5's Kanban reads these.

## Design notes
- **Pipeline**: `(name, is_default, organization_id)`. CASCADE on org delete.
  Only one default pipeline per org — partial unique index on
  `(organization_id) WHERE is_default = TRUE`.
- **Stage**: `(pipeline_id, name, default_probability, color, position,
  stage_type)`. CASCADE on pipeline delete. `stage_type` enum
  `open | won | lost`. `default_probability` 0–100 (CHECK constraint).
  `position` int; unique per pipeline so Kanban can sort without ties.
- **Default stages** (5 open + 1 won, per brief's "6 stages"):
  1. "Nový lead"        — open,  10%, #3D5AFE (accent)
  2. "Kontaktováno"     — open,  25%, #5470FF
  3. "Schůzka"          — open,  45%, #F59E0B (warning)
  4. "Nabídka"          — open,  65%, #A8D03A (muted highlight)
  5. "Jednání"          — open,  85%, #10B981 (success)
  6. "Vyhráno"          — won,  100%, #C9F24E (neon lime per §4.2)
  A lost stage is not seeded — lost deals keep their current stage and the
  app flags them via `closed_at` + `lost_reason`. Orgs can add custom
  lost-columns later via the pipeline editor (Phase 10).
- **Seeding**: `app/services/pipeline.py::create_default_pipeline(session, org)`
  called from `app/services/auth.py::upsert_user_from_google_profile` when a
  first-time login provisions a new Organization.

## Files in scope
- `app/db/models/enums.py` — add `StageType`.
- `app/db/models/pipeline.py`
- `app/db/models/stage.py`
- `app/db/models/__init__.py` — re-export.
- `alembic/versions/<rev>_phase2_pipelines_stages.py`
- `app/services/pipeline.py` — `DEFAULT_STAGES` tuple + `create_default_pipeline`.
- `app/services/auth.py` — call `create_default_pipeline` on first-login org
  creation.
- `tests/services/test_pipeline.py` — seed helper creates 6 rows with the
  right positions / probabilities / stage_types.
- `tests/services/test_auth_service.py` — existing "first login creates org"
  test extended to assert a default pipeline is seeded.
- `tests/db/test_models_phase2.py` — `default_probability` CHECK fires for
  120; partial-unique on `is_default` fires for a second default pipeline.

## Acceptance criteria
1. `alembic upgrade head` creates `pipelines`, `stages`, `stage_type` enum;
   `alembic check` clean; round-trips.
2. `create_default_pipeline(session, org)` inserts one Pipeline + 6 Stages
   with `is_default=True` and contiguous positions 0..5.
3. After `upsert_user_from_google_profile` on a fresh profile, the session
   sees exactly one Pipeline with `is_default=True` and 6 Stages.
4. Trying to insert a second `is_default=True` pipeline in the same org
   fails with IntegrityError.
5. Inserting a Stage with `default_probability=120` fails.
6. Suite + ruff + format + mypy still green; frontend types:check unchanged.
7. One commit: `feat(db): pipeline + stages + default seed — Task 2.3`.
