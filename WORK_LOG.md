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
- Commit: a675ef7. (Task 0.3 committed as a199d16; see above.)

### Task 0.4 — Database and migrations ✅ PASS
- Added SQLAlchemy 2.0 async + asyncpg + Alembic + greenlet to
  `backend/pyproject.toml`.
- `app/db/base.py`: declarative `Base` with a Postgres-style naming convention
  (ix/uq/ck/fk/pk) so Alembic autogenerate produces stable constraint names.
- `app/db/session.py`: `create_async_engine` with `pool_pre_ping`,
  `async_sessionmaker` (`expire_on_commit=False`), and a `get_db()` FastAPI
  dependency.
- `alembic.ini` + `alembic/env.py` (async-aware; pulls `database_url` from
  `app.core.config.Settings`) + custom `script.py.mako` (PEP 604 types,
  `from __future__ import annotations`).
- First migration: `20260417_2149_initial_empty_baseline_6c57c6890dde.py` — no
  DDL; real schema arrives in Task 1.1.
- New endpoint `GET /api/v1/healthz/db` does `SELECT 1` via `get_db` session;
  503 on failure.
- Tests: two happy-path probes and a 503 branch exercised via FastAPI
  `dependency_overrides` injecting a session that raises `OperationalError`.
  Kept method-not-allowed test. All 4 pass.
- Ruff tweaks: added `extend-immutable-calls` for FastAPI's `Depends` /
  `Query` / `Body` / etc. so B008 doesn't flag idiomatic dependency injection.
- Verified:
  - `uv run alembic upgrade head` → creates `alembic_version`, stamps 6c57c6890dde.
  - `uv run alembic downgrade base` → reverses cleanly.
  - `uv run alembic check` → "No new upgrade operations detected."
  - `ruff`, `ruff format --check`, `mypy app`, `pytest` all green.
- Commit: pending.

### Task 0.3 — Frontend skeleton ✅ PASS
- Read `.claude/skills/ui-design.md` before starting (per Section 1).
- `frontend/package.json`: React 18, Vite 5, TS 5.6 strict, TanStack Query v5,
  Lucide, clsx, tailwind-merge; dev: Vitest 2, Testing Library, ESLint 9
  (flat config), Prettier + tailwind plugin.
- Tokens file `src/theme/tokens.css` carries both `[data-theme="dark"]` and
  `[data-theme="light"]` blocks plus shared (scale/motion) tokens at `:root`.
  Values copied verbatim from ui-design.md §2.1–2.3. `prefers-reduced-motion`
  handled at the base layer.
- `tailwind.config.ts` maps semantic utilities (`bg-surface`, `text-primary`,
  `bg-accent`, `ring`, spacing, radii, type scale, durations, easings) to the
  CSS variables. Tailwind's default palette intentionally not whitelisted; grep
  confirmed no `bg-blue-*` / `text-gray-*` / hex codes in any `.tsx`.
- `src/App.tsx` — sample landing-ish page exercising tokens: hero, 3 token-demo
  cards, theme toggle button. Czech copy, vykání, Inter + highlight-moment
  sparkle icon. `Intl` not exercised yet (no money/date values here).
- `src/theme/theme.ts` — storage + system-preference resolver; `applyTheme`
  writes `data-theme` and persists. Inline script in `index.html` prevents FOUC.
- `src/__tests__/App.test.tsx` — 3 passing tests (hero rendered, dark default,
  theme toggle round-trips). `src/test-setup.ts` stubs jsdom's missing
  `matchMedia`.
- Dev-container quirks hit & fixed:
  - pnpm's default store at `/home/node/.local/share/pnpm` is root-owned; used
    `PNPM_HOME=/tmp/pnpm-home` and `store-dir=/tmp/pnpm-store` (saved in
    `~/.config/pnpm/rc`). Documented in `frontend/README.md`.
  - esbuild postinstall blocked by pnpm v10's strict build script policy;
    added `pnpm.onlyBuiltDependencies: ["esbuild"]` and re-ran `pnpm rebuild`.
- Picked vite 5.4 (not 6) because vitest 2.x pins its types to vite 5; avoiding
  the parallel-install type conflict. Can bump both when vitest 3 is on npm.
- Verification:
  - `pnpm lint`, `pnpm typecheck`, `pnpm test` (3/3), `pnpm format:check`,
    `pnpm build` — all green.
  - `pnpm dev` → HTTP 200 on `/`, HTML sets `data-theme="dark"` via inline
    script (verified with curl).
  - Theme tokens audit: 0 hex/rgb literals in `src/**/*.tsx`; 0 default-palette
    Tailwind classes.
- Commit: pending.
