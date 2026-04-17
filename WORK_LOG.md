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
- Verification: acceptance criteria re-read; `git status` shows only my changes.
- Commit: 73918ab.

### Task 0.2 — Backend skeleton ✅ PASS
- `backend/pyproject.toml` with Python 3.12, FastAPI 0.136, Pydantic 2.13,
  pydantic-settings, httpx, plus dev tools (pytest, pytest-asyncio, ruff, mypy,
  asgi-lifespan). Ruff lint rules E/F/I/B/UP/N/S/C4/SIM/RUF; mypy strict with
  the pydantic plugin.
- `app/main.py` with `create_app()` factory, CORS middleware, OpenAPI at
  `/api/v1/openapi.json`, Swagger UI at `/api/v1/docs`.
- `app/core/config.py` with pydantic-settings + `lru_cache`'d `get_settings()`.
- `app/api/v1/health.py` — `GET /healthz` returning a typed `HealthResponse`.
- `tests/conftest.py`: `httpx.AsyncClient` + `ASGITransport` fixture.
  `tests/api/v1/test_health.py`: happy-path + method-not-allowed (permission
  denied is N/A for an unauthenticated probe and the module docstring says so).
- Multi-stage `backend/Dockerfile` (uv install → runtime user uid 1001).
- Dev-container quirk documented: `/home/node/.cache` and `.local/share` are
  root-owned, so `UV_CACHE_DIR=/tmp/uv-cache` + `UV_PYTHON_INSTALL_DIR=/tmp/uv-python`
  are required. CI and prod image are unaffected. Documented in `backend/README.md`.
- Verified: 39 deps installed; ruff + ruff format + mypy strict + pytest all
  green; uvicorn boots and serves 200 on `/api/v1/healthz`; OpenAPI 3.1 spec served.
- Commit: a675ef7.

### Task 0.3 — Frontend skeleton ✅ PASS
- Read `.claude/skills/ui-design.md` before starting (per Section 1).
- `frontend/package.json`: React 18, Vite 5, TS 5.6 strict, TanStack Query v5,
  Lucide, clsx, tailwind-merge; dev: Vitest 2, Testing Library, ESLint 9
  (flat config), Prettier + tailwind plugin.
- Tokens file `src/theme/tokens.css` carries both `[data-theme="dark"]` and
  `[data-theme="light"]` blocks plus shared scale/motion tokens at `:root`.
  Values copied verbatim from ui-design.md §2.1–2.3. `prefers-reduced-motion`
  handled at the base layer.
- `tailwind.config.ts` maps only semantic utilities (`bg-surface`, `text-primary`,
  `bg-accent`, ring, spacing, radii, type scale, durations, easings) to the
  CSS variables. Grep confirmed 0 hex codes and 0 default-palette classes in `src/**/*.tsx`.
- `src/App.tsx` — sample hero + 3 token-demo cards + theme toggle button.
  Czech copy, vykání; `Sparkles` icon illustrates the highlight color.
- `src/theme/theme.ts` — storage + system-preference resolver; inline script
  in `index.html` prevents flash of wrong theme.
- `src/__tests__/App.test.tsx` — 3 passing tests (hero, dark default,
  toggle round-trip). `src/test-setup.ts` stubs jsdom's missing `matchMedia`.
- Dev-container quirks handled: `PNPM_HOME=/tmp/pnpm-home`, pnpm store at
  `/tmp/pnpm-store` (saved in `~/.config/pnpm/rc`), and
  `pnpm.onlyBuiltDependencies: ["esbuild"]` for pnpm v10's strict policy.
  Documented in `frontend/README.md`.
- Pinned vite ^5.4 because vitest 2.x types are against vite 5; avoids the
  parallel-install type conflict. Can bump together when vitest 3 ships.
- Verified: lint / typecheck / format:check / test (3/3) / build all green;
  `pnpm dev` → HTTP 200 with `data-theme="dark"`.
- Commit: a199d16.

### Task 0.4 — Database and migrations ✅ PASS
- Added SQLAlchemy 2.0 async + asyncpg + Alembic + greenlet.
- `app/db/base.py`: `DeclarativeBase` with Postgres-style naming convention
  (ix/uq/ck/fk/pk) so autogenerate names are stable.
- `app/db/session.py`: `create_async_engine` with `pool_pre_ping`,
  `async_sessionmaker` (`expire_on_commit=False`), `get_db()` dependency.
- `alembic.ini` + async-aware `alembic/env.py` (pulls `database_url` from
  Settings) + custom `script.py.mako` using PEP 604 types.
- First migration `20260417_2149_initial_empty_baseline_6c57c6890dde.py` — no
  DDL; real schema lands in Task 1.1.
- `GET /api/v1/healthz/db` probe (`SELECT 1` → 200; any exception → 503).
- Tests: happy paths for both probes, method-not-allowed, and a 503 branch
  exercised via FastAPI `dependency_overrides` injecting a failing session.
  All 4 pass.
- Ruff: `extend-immutable-calls` includes `fastapi.Depends`, `Query`, `Body`,
  etc. so B008 no longer flags idiomatic dependency injection.
- Verified: `alembic upgrade head` / `downgrade base` round-trip clean;
  `alembic check` reports no pending ops; ruff + format + mypy strict + pytest all green.
- Commit: a1d5604.

### Task 0.5 — CI pipeline ✅ PASS
- `.github/workflows/ci.yml` with three jobs:
  1. `backend` — Postgres 16 service, ruff, ruff format --check, mypy strict,
     alembic upgrade head, pytest.
  2. `frontend` — pnpm install, lint, typecheck, format:check, test, build.
  3. `api-types-freshness` — regenerates TS types from the backend spec and
     exits non-zero if `src/types/api.generated.ts` has drifted.
- `frontend/scripts/generate-api-types.mjs`: extracts the OpenAPI spec via
  `uv run python -c 'from app.main import app; print(json.dumps(app.openapi()))'`
  (or fetches `BACKEND_OPENAPI_URL` over HTTP), runs `openapi-typescript` +
  `astToString`, writes the file. `--check` runs the same generation into memory
  and prints a unified diff on mismatch.
- `frontend/package.json` gained `types:generate` / `types:check` scripts and
  the `openapi-typescript` devDep.
- First committed `src/types/api.generated.ts` covers the healthz endpoints
  only (all that exists). Generated file is opt-out of ESLint + Prettier.
- `frontend/src/types/README.md` documents the auto-gen contract.
- Manually exercised drift detection: appended a comment → `types:check`
  failed with a proper diff; `types:generate` → restored; `types:check` green.
- YAML validated via `yaml.safe_load`.
- CI run itself requires a remote push (not possible inside this container),
  but every workflow step has a locally equivalent run and all passed.
- Commit: 903c5d1.

### Phase 0 — Exit criteria check
- `docker compose up` — backend and frontend Dockerfiles both exist; the dev
  compose file is user-maintained. Docker-in-docker is unavailable inside this
  sandbox, so real `compose up` is left for the user to run.
- Healthcheck endpoints respond — verified locally against the running uvicorn.
- CI green on PR — workflow committed and locally equivalent-run; the actual
  GitHub run depends on the user pushing to origin.

Phase 0 is done. All five tasks have clean conventional-commits on `master`:
73918ab, a675ef7, a199d16, a1d5604, 903c5d1.
