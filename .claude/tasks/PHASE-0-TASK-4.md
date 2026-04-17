# Task 0.4 — Database and migrations

## Goal
SQLAlchemy async session, Alembic initialized with an empty base migration that
runs cleanly against the dev Postgres. No models yet — those come in Phase 1/2.

## Files in scope
- `backend/pyproject.toml` — add deps: `sqlalchemy>=2.0`, `alembic>=1.13`,
  `asyncpg>=0.30`, `greenlet` (needed for SQLAlchemy async sync-API internals).
- `backend/app/db/__init__.py`
- `backend/app/db/base.py` — declarative `Base` with naming conventions for
  indexes / constraints (PostgreSQL best practice; Alembic autogenerate needs it).
- `backend/app/db/session.py` — `async_engine`, `AsyncSessionLocal`, `get_db()`
  FastAPI dependency.
- `backend/alembic.ini` — minimal; URL overridden at runtime from `Settings`.
- `backend/alembic/env.py` — async-aware env, reads `DATABASE_URL` from settings,
  imports `Base.metadata`.
- `backend/alembic/script.py.mako`
- `backend/alembic/versions/<rev>_initial_empty.py` — revision with empty
  `upgrade` / `downgrade` (placeholder for the first real migration in Task 1.1).
- `backend/app/api/v1/health.py` — extend with a DB-probing endpoint
  `/healthz/db` that does `SELECT 1`. Return 200 on success, 503 if DB is
  unreachable.
- `backend/tests/api/v1/test_health.py` — add a test for the new DB-ping
  endpoint (happy path with real DB). Mock the failure case via session fixture.
- `backend/tests/conftest.py` — add a `test_settings` fixture that points at a
  dedicated test schema `simplecrm_test` (or uses the main DB — decide).

## Decision on test DB
Use the same `simplecrm` database but connect to it from tests; tests that
write data will use transactional rollback (added in later tasks). For 0.4 the
only test touching the DB is the healthz probe, which is read-only.

## Acceptance criteria
1. `uv sync` installs the new deps.
2. `uv run alembic upgrade head` runs cleanly against the dev Postgres, creates
   the `alembic_version` table, and is a no-op beyond that.
3. `uv run alembic downgrade base` reverses cleanly.
4. `uv run alembic check` (dry run) or `alembic current` reports the expected rev.
5. `uv run pytest` stays green; a new test confirms `/api/v1/healthz/db` → 200.
6. Mypy strict still passes on the new modules.
7. One commit: `feat(db): async SQLAlchemy + Alembic base setup — Task 0.4`.

## Non-goals
- Actual tables — handled by Task 1.1 forward.
- Connection pool tuning / retry logic.
- Multi-tenancy primitives.
