# Task 0.2 — Backend skeleton

## Goal
A runnable FastAPI app with `/api/v1/healthz`, a passing test, and the full linting /
typechecking / test-running toolchain wired up. Alembic and SQLAlchemy come in 0.4.

## Files in scope
- `backend/pyproject.toml` — Python 3.12, deps (fastapi, uvicorn, pydantic[email],
  pydantic-settings, httpx, pytest, pytest-asyncio, ruff, mypy).
  Keep deps minimal now; DB/auth/etc come in later tasks.
- `backend/app/__init__.py`
- `backend/app/main.py` — FastAPI app, router mounted at `/api/v1`.
- `backend/app/api/__init__.py`
- `backend/app/api/v1/__init__.py` — aggregate router.
- `backend/app/api/v1/health.py` — `GET /healthz` returns `{"status": "ok"}`.
- `backend/app/core/__init__.py`
- `backend/app/core/config.py` — Pydantic `Settings` class.
- `backend/tests/__init__.py`
- `backend/tests/conftest.py` — `httpx.AsyncClient` fixture using ASGI transport.
- `backend/tests/api/__init__.py`
- `backend/tests/api/v1/__init__.py`
- `backend/tests/api/v1/test_health.py` — 3 tests per the Section 12 rule where
  applicable. `happy_path`, `method_not_allowed` (the only sensible validation
  variant for a GET), and content-type check (permission_denied is N/A since
  healthz is unauthenticated — that's documented in the test module).
- `backend/Dockerfile` — multi-stage: `uv` install, copy app, run uvicorn.
  Production-shaped but validated locally.
- `backend/.python-version` — `3.12` (consumed by uv).
- `backend/ruff.toml` or section in pyproject — ruff + format config.
- `backend/mypy.ini` or section in pyproject — strict.
- `.editorconfig` at repo root — consistent tab/space across both apps.

## Acceptance criteria
1. `cd backend && uv sync` succeeds.
2. `uv run ruff check .` and `uv run ruff format --check .` are green.
3. `uv run mypy app` is green in strict mode.
4. `uv run pytest` passes with ≥ 1 test (the health tests).
5. `uv run uvicorn app.main:app --port 8000` starts the app; `curl` to
   `localhost:8000/api/v1/healthz` returns `{"status":"ok"}` with 200.
6. Dockerfile builds successfully (validate with `docker build` only if feasible;
   skip actual run since docker-in-docker isn't available inside the dev container).
   If docker build isn't possible here, note the skip and rely on CI in Task 0.5.
7. One commit: `feat(backend): FastAPI skeleton with healthz — Task 0.2`.

## Notes
- Use `pyproject.toml` exclusively (no separate `ruff.toml`/`mypy.ini`).
- Strict mypy + ruff defaults; enable `ruff`'s lint rule sets: E, F, I, B, UP, N, S.
  Ignore `S101` (asserts in tests are fine) and `S106` (hardcoded passwords in tests).
- FastAPI lifespan handler will be added later; not needed yet.
