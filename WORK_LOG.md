# SimpleCRM Work Log

This is the persistent record of what has been built, by whom (sessions), and when.
Append-only except for correcting factual errors. Each task gets a header block.

---

## Session 1 — 2026-04-17

Starting from a fresh repo (only dev-container tooling + MANAGER_TASK.md + ui-design skill).
Working through Phase 0 tasks sequentially per Section 11 of the brief.

### Task 0.1 — Initialize monorepo ✅ PASS
- Added root `README.md`, `backend/README.md`, `frontend/README.md`,
  `docs/README.md`, and `docs/adr/0001-stack-and-structure.md`.
- Fixed `.gitignore`: stopped ignoring `WORK_LOG.md` and `RESUME.md` (the brief
  requires them to be committed); added `dist/`, coverage, IDE, OS, Playwright
  output, and `.claude/settings.local.json`.
- Wrote `.claude/tasks/PHASE-0-TASK-1.md` as the task spec.
- Dev-env edits (`.docker/*`, `docker-compose.dev.yml`, `fix-docker.sh`) left
  untouched — those are the user's pre-existing in-flight changes.
- Verification:
  - Acceptance criteria re-read and each confirmed.
  - `git status`: only my changes are staged; dev-env files remain unstaged.
- Commit: 73918ab.

### Task 0.2 — Backend skeleton ✅ PASS
- Created `backend/pyproject.toml` with Python 3.12, FastAPI 0.136, Pydantic 2.13,
  pydantic-settings, httpx, plus dev tools (pytest, pytest-asyncio, ruff, mypy,
  asgi-lifespan). Ruff lint rules: E/F/I/B/UP/N/S/C4/SIM/RUF; mypy strict + pydantic plugin.
- Added `app/main.py` with `create_app()` factory, CORS middleware, versioned
  OpenAPI at `/api/v1/openapi.json`, Swagger UI at `/api/v1/docs`.
- Added `app/core/config.py` with `Settings` (pydantic-settings) + cached `get_settings()`.
- Added `app/api/v1/health.py` returning `{"status": "ok"}` with a typed Pydantic
  `HealthResponse` — so the generated OpenAPI schema carries the field.
- Added `tests/conftest.py` with an `httpx.AsyncClient` + `ASGITransport` fixture.
  `tests/api/v1/test_health.py` exercises happy-path and method-not-allowed.
  Permission-denied is N/A and documented in the module docstring.
- Added `backend/Dockerfile` (multi-stage, uv-based, runs as uid 1001).
- Dev-container quirk: `/home/node/.cache` and `.local/share` are root-owned.
  Documented the `UV_CACHE_DIR` / `UV_PYTHON_INSTALL_DIR` workaround in
  `backend/README.md`. CI and prod Dockerfile don't need it.
- Verification:
  - `uv sync` → 39 packages installed.
  - `uv run ruff check .` → All checks passed.
  - `uv run ruff format --check .` → 12 files already formatted.
  - `uv run mypy app` → Success: no issues found in 7 source files.
  - `uv run pytest` → 2 passed.
  - `uvicorn` boots; `curl /api/v1/healthz` → 200 `{"status":"ok"}`.
  - `curl /api/v1/openapi.json` → OpenAPI 3.1 spec served.
  - Dockerfile NOT built (docker-in-docker not available in this dev container);
    will rely on CI (Task 0.5) to exercise it.
- Commit: pending.
