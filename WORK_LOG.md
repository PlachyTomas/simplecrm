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

---

## Session 1 continues — Phase 1

### Task 1.1 — Organization/User/Team/Plan models + seed ✅ PASS
- Four SQLAlchemy 2.0 models in `app/db/models/`:
  - `Organization` — name, optional Czech registry fields (ICO/DIC/address/…),
    `region` enum (default `eu-cz`), `locale` default `cs-CZ`, `currency`
    default `CZK`, `trial_ends_at` defaulted to `now() + 30 days` in Python.
  - `Plan` — catalog of subscription plans (`trial` at 0, `team` at 9900 CZK
    monthly); names are unique.
  - `User` — email is globally unique (a Google login always maps to the same
    row); `role` enum defaults to `salesperson`; `google_id` unique nullable;
    organization FK mandatory with CASCADE delete.
  - `Team` — per-organization; `manager_user_id` nullable FK; `members`
    relationship via `User.team_id`.
- Enums exposed as Postgres `enum` types with explicit names
  (`organization_region`, `plan_interval`, `user_role`). `Region` uses
  `values_callable` so hyphenated values (`eu-cz`) survive Python → SQL.
- Naming convention from `Base` flows through — all constraint names stable.
- Migration `c98b20a997d0_phase1_foundation_org_user_team_plan`:
  - Creates `organizations` → `plans` → `teams` (without the circular FK) →
    `users`.
  - After both tables exist, `op.create_foreign_key(..., use_alter=True)`
    adds `fk_teams_manager_user_id_users`. Downgrade drops it first.
  - `bulk_insert` seeds the two plans with fixed UUIDs so fixtures can refer
    to them later.
  - Downgrade explicitly drops the three enum types to leave a clean schema.
- Pitfall caught during verification: inline `ForeignKeyConstraint(use_alter=True)`
  inside `op.create_table` is silently dropped (constraint never emitted).
  Switched to a separate `op.create_foreign_key` step after `users` exists.
  Had to clean the broken DB state (DROP TABLE + DROP TYPE) once before the
  fixed migration could run.
- Side-effect import `import app.db.models` added to `alembic/env.py` so
  autogenerate sees everything.
- `tests/conftest.py`: added `db_session` fixture that opens an `AsyncSession`,
  begins an outer transaction, yields, and rolls back on exit — per-test
  isolation without nuking the dev DB. Required bumping pytest-asyncio's
  loop scope to `session` (both fixture and test) so the module-level async
  engine's connections live on the same loop as all tests.
- `tests/db/test_models_phase1.py` — 5 tests: default plans present,
  organization gets ~30-day trial window, user requires valid org (FK fires
  IntegrityError), team↔manager↔members relationship round-trip, email
  uniqueness enforced.
- Ruff tweaks: `N811` ignored in `app/db/models/*` (SQLAlchemy class aliases
  like `UUID as PgUUID` aren't constants in the pep8 sense).
- `ResourceWarning` added to pytest's ignore filters — asyncpg connection
  cleanup is noisy on Python 3.12 even on happy paths.
- Verified: alembic upgrade / downgrade round-trip clean, `alembic check`
  reports no pending ops, all 9 backend tests pass, ruff + format + mypy
  strict green, frontend `types:check` still up-to-date (no API surface
  changes in this task).
- Commit: 6c7d09a.

### Task 1.2 — Google OAuth flow ✅ PASS
- Added deps: `authlib`, `python-jose[cryptography]`, `itsdangerous`.
- `app/core/config.py`: JWT + Google OAuth + frontend redirect settings.
- `app/core/security.py`: `create_access_token` / `create_refresh_token` /
  `decode_token` (HS256; access TTL 1 h, refresh TTL 30 d), plus
  `sign_oauth_state` / `verify_oauth_state` using `URLSafeTimedSerializer`.
- `app/services/google_oauth.py`: `GoogleOAuthClient` Protocol +
  `AuthlibGoogleOAuthClient` implementation; `get_google_oauth_client`
  dependency so tests can inject a fake.
- `app/services/auth.py`: `upsert_user_from_google_profile` — strongest match
  by `google_id`, fallback by `email` (attaches `google_id` to an invite-seeded
  user). First-time login creates a placeholder Organization (name derived
  from the email domain) and an admin User; the 30-day trial comes from the
  Organization default.
- `app/core/deps.py`: `get_current_user` Bearer-token dependency (rejects
  missing/invalid/wrong-type tokens, inactive users).
- `app/api/v1/auth.py`:
  - `GET /auth/google/login` — 307 to Google with a signed state cookie.
  - `GET /auth/google/callback` — validates state (both equality against the
    cookie and signature/TTL), exchanges code, upserts user, issues access
    token in the redirect fragment, sets refresh cookie, 302 to frontend.
  - `GET /auth/me` — returns the authenticated user + org summary.
  - `POST /auth/logout` — clears the refresh cookie, 204.
- `app/schemas/auth.py`: typed response models; `CurrentUser` carries a nested
  `OrganizationSummary` with trial, locale, currency — the frontend needs all
  three for trial-expiry gate and Intl formatters.
- Tests:
  - `tests/services/test_auth_service.py` — 3 upsert scenarios.
  - `tests/api/v1/test_auth.py` — 9 scenarios: login redirect, callback happy
    path, state mismatch, missing code (422), Google failure, /me happy path,
    /me missing token, /me bad token, logout clears cookie.
  - Total backend suite now 21 tests, all green.
- Frontend OpenAPI types regenerated (adds all four auth operations +
  `CurrentUser` / `OrganizationSummary` / `HTTPValidationError` schemas).
  `pnpm typecheck` + `pnpm test` still pass.
- Commit: 74f75ba.

### Task 1.3 — Auth dependencies ✅ PASS
- Extended `app/core/deps.py`:
  - `require_role(*allowed)` — factory returning an async dependency that
    enforces one of the allowed roles. Admins bypass unconditionally.
  - `require_roles(iterable)` — iterable-accepting alias for composing role
    sets at module level.
  - `require_active_trial_or_subscription` — 402 Payment Required when the
    org's `trial_ends_at` has passed AND `stripe_customer_id` is null. Payload
    carries `trial_ends_at` + `organization_id` so the frontend can render
    the trial-expiry gate without extra API calls.
- `app/schemas/errors.py` — typed `TrialExpiredError` for the 402 body. Kept
  separate from the dependency so route handlers that need a typed response
  model can reference it.
- Tests in `tests/services/test_permissions.py` (8 unit tests):
  admin-bypasses-everything, allowed role passes, disallowed role → 403,
  iterable variant, empty role set raises `ValueError` (config error),
  trial-gate happy paths (in trial / with subscription) and rejection (expired
  without subscription) with the 402 payload asserted.
- mypy needed `Callable[[User], Awaitable[User]]` for the factories — fixed.
- Full suite now 29 passing tests; API types unchanged (no new endpoints or
  schemas exposed); `types:check` stays green.
- Commit: 72c4cb0.

### Task 1.4 — Frontend auth context + login + trial gate ✅ PASS
- `src/lib/api.ts`: `apiFetch<T>()` wrapper + typed `ApiError`; `isTrialExpired`
  helper peels FastAPI's `{detail: {...}}` envelope.
- `src/lib/queryClient.ts`: shared TanStack Query client.
- `src/auth/AuthContext.tsx` + `src/auth/useAuth.ts`: access token in memory
  only (per brief). Provider scrapes `#access_token=` from the URL on mount
  and then history-replaces the URL so the token doesn't linger in the bar.
- `src/auth/useCurrentUser.ts`: TanStack Query hook around `/auth/me`; typed
  against the generated `components["schemas"]["CurrentUser"]`.
- `src/auth/ProtectedRoute.tsx`: anonymous → `/login`; pending → `Načítání…`;
  401 → `/login`; 402 → `<TrialExpiredGate />`; success → children.
- `src/auth/TrialExpiredGate.tsx`: full-screen gate implementing ui-design.md
  §5.11 exactly — Czech copy, vykání, `Přejít na předplatné` primary CTA,
  `Exportovat data` ghost CTA, support email footnote. Date formatted via
  `Intl.DateTimeFormat("cs-CZ")` — never hardcoded.
- `src/auth/LoginPage.tsx`: centered card with `Přihlásit se přes Google`
  anchor pointing at `${API_BASE_URL}/api/v1/auth/google/login`.
- `src/app/AppShell.tsx`: minimal authed shell (org name, trial countdown
  date formatted via Intl, user avatar/initials, logout button calling
  `/auth/logout` via a mutation).
- `src/marketing/LandingStub.tsx`: placeholder `/` until Phase 11.
- `src/App.tsx`: `AppRoutes` + BrowserRouter + `QueryClientProvider` +
  `AuthProvider`. Exported `AppRoutes` so tests can drop `MemoryRouter` in.
- Replaced the old `App.test.tsx` with router-aware tests (6 tests):
  landing renders, Google CTA points at backend, anonymous `/app` → login,
  `/auth/me` 200 renders shell, `/auth/me` 402 renders gate, `/auth/me` 401
  kicks to login. `fetch` is stubbed with a Vitest mock.
- `eslint.config.js`: no new rules (kept the `AuthContext` export + a narrow
  eslint-disable on the `createContext` export for fast-refresh).
- Verification: `pnpm lint` (0), `pnpm typecheck` (0), `pnpm test` (6/6),
  `pnpm format:check` (0), `pnpm build` (218 kB gzipped 69 kB). Backend
  untouched in this task; its suite still 29/29. `types:check` green (no API
  changes).
- Commit: 22ae3ec.

### Task 1.5 — First-time onboarding flow ✅ PASS
- Backend:
  - `app/schemas/auth.py`: `ico: str | None` added to `OrganizationSummary`
    so the frontend can branch on onboarding state.
  - `app/schemas/organization.py`: `OrganizationUpdate` (all fields optional,
    `ico` validated as 8 digits) + `OrganizationOut`.
  - `app/api/v1/organizations.py`: `GET /organizations/current` (any auth'd
    user, returns their org) + `PUT /organizations/current` (admin-only via
    `require_role(admin)`, applies `model_dump(exclude_unset=True)`).
  - Mounted the router in the v1 aggregator.
  - `tests/api/v1/test_organizations.py` — 6 tests: happy GET, missing-token
    401, happy PUT, non-admin 403, malformed IČO 422, isolation-by-user.
    The endpoint commits internally (defeats the rollback fixture), so tests
    seed users with UUID-suffixed emails and tear them down via a dedicated
    `owned_emails` fixture.
  - Ruff: added `app.core.deps.require_role` / `require_roles` to
    `extend-immutable-calls` so B008 no longer flags the admin dependency.
  - Backend suite now 35 passing (was 29).
- Frontend:
  - `src/app/OnboardingForm.tsx` — `role="dialog" aria-modal="true"` blocking
    modal with IČO / name / city inputs. Submit calls
    `PUT /organizations/current` via a TanStack Query mutation and invalidates
    `["auth","me"]`. ARES auto-fill noted as a Phase-3 follow-up.
  - `src/app/AppShell.tsx`: renders the form when
    `user.organization.ico == null && user.role === "admin"`.
  - `src/__tests__/App.test.tsx`: existing authed-shell test now passes
    `ico` in its mock so the modal stays hidden; two new tests cover the
    admin-sees-modal and salesperson-does-not branches.
  - Regenerated `api.generated.ts`: now carries `OrganizationOut`,
    `OrganizationUpdate`, and the two new endpoints.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (8/8),
  `pnpm format:check`, `pnpm build`, `types:check` all green. Ruff, mypy,
  pytest (35/35) green on the backend.
- Commit: 9638482.

### Phase 1 — Exit criteria check
- "User can Google-sign-in from landing page, lands in app shell,
  `/api/v1/auth/me` returns their info."
  - Landing-stub → `/login` → "Přihlásit se přes Google" → backend OAuth URL:
    wired. Real end-to-end confirmation needs real Google OAuth credentials,
    which only the deploy owner has; the stub path is fully covered by tests
    on both sides.
  - `/auth/me` returns a typed `CurrentUser` that the frontend consumes via
    `useCurrentUser`; verified in the 6 frontend routing tests and 9 backend
    auth tests.
  - Trial gate (402 from authed calls) renders per ui-design.md §5.11.
  - First-time onboarding modal captures IČO + name and persists via
    `PUT /organizations/current`.

Phase 1 done. Commits on master for Phase 1:
6c7d09a, 74f75ba, 72c4cb0, 22ae3ec, 9638482.

Next up: Phase 2 — core data model and CRUD. Companies, Contacts, Pipeline,
Deals, Activities; plus list/detail screens.
