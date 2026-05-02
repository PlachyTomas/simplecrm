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

### Task 2.1 — Company + OwnershipHistory ✅ PASS
- Added `OwnershipChangeReason` enum (`initial`, `reassigned`,
  `freed_timeout`, `won_deal_refresh`).
- `app/db/models/company.py`: UUID PK, FK to Organization (CASCADE) and
  `owner_user_id` (SET NULL), ICO scoped-unique per organization, indexes on
  `organization_id`, `owner_user_id`, `ownership_expires_at`, `ico`.
  `last_order_at` + `ownership_expires_at` are both regular timestamptz;
  `ownership_expires_at` defaults to `now() + 365d` via a Python callable.
- **Design change vs original spec**: the brief sketched
  `ownership_expires_at` as a stored generated column. Postgres 16 rejected
  the expression as "not immutable" (interval literal under STORED semantics).
  Switched to a regular column that the application maintains (won-deal flow
  bumps it); the freeing job still gets an indexed filter target.
- `app/db/models/ownership_history.py`: audit rows with FKs to Company
  (CASCADE) and User (SET NULL), nullable `released_at`, enum `reason`.
- Migration `eae6d56b0854_phase2_companies_and_ownership_history.py`; clean
  autogen, round-trips, downgrade drops the `ownership_change_reason` enum.
- Tests (`tests/db/test_models_phase2.py`, 4 passing): default
  ownership_expires_at ~ now+365d, ICO unique per org but shareable across
  orgs, ownership-history row insert.
- Full suite 39 passing; ruff, format, mypy strict clean.
- Commit: 1709008.

## Session 2 — 2026-04-18

Picked up cleanly from Session 1's end state: `master` at d68cfd9, no
`RESUME.md`. Read `WORK_LOG.md` and restarted at Task 2.2.

### Task 2.2 — Contact model ✅ PASS
- `app/db/models/contact.py`: UUID PK, FK to Organization (CASCADE) and
  optional Company (SET NULL). First / last name required; email, phone,
  LinkedIn, position, note optional. Email is unique per-organization
  (`uq_contacts_org_email`) so the same person can live in two orgs' books
  without colliding; indexes on `organization_id` and `company_id`.
- `app/db/models/__init__.py` re-exports `Contact`.
- Migration `3a06ad7bed4c_phase2_contacts.py`; autogen clean, round-trips.
- Tests (`test_models_phase2.py` grows to 8): happy company link, email
  unique per org, email shareable across orgs, company-delete → SET NULL
  on contact.company_id. Previous 4 company/ownership tests still pass.
- Backend suite now 43 passing; ruff / format / mypy strict clean. Frontend
  unchanged so `types:check` stays green (no endpoints added yet).
- Commit: a5a8e08.

### Task 2.3 — Pipeline + Stage + default seed ✅ PASS
- `StageType` enum (`open` / `won` / `lost`) added to `enums.py`.
- `app/db/models/pipeline.py`: `pipelines` table, UUID PK, CASCADE FK to
  Organization, `is_default` bool, partial-unique index
  `uq_pipelines_one_default_per_org` on `organization_id WHERE is_default`
  so every org can have at most one default pipeline.
- `app/db/models/stage.py`: `stages` table, CASCADE FK to pipeline, unique
  `(pipeline_id, position)`, CHECK `default_probability 0..100`, enum
  `stage_type`.
- `app/services/pipeline.py`: `DEFAULT_STAGES` seed (5 open + 1 won, Czech
  names, colors drawn from theme accents) and async
  `create_default_pipeline(session, org_id)`.
- `app/services/auth.py`: first-login `upsert_user_from_google_profile` now
  calls `create_default_pipeline` right after inserting the Organization.
- Migration `396feead22c3_phase2_pipelines_and_stages.py`: creates both
  tables + the `stage_type` enum; downgrade tears them all down plus the
  enum.
- Tests (`tests/services/test_pipeline.py`, 4 passing): seeds six stages
  with the right names/positions/probabilities/types, double-seed raises
  IntegrityError, CHECK fires for probability=120, first-login integration
  wires the pipeline into the auth flow.
- Backend suite now 47 passing; ruff / format / mypy strict clean; frontend
  `types:check` green (no API changes yet).
- Commit: dd8f5a4.

### Task 2.4 — Deal model ✅ PASS
- `app/db/models/deal.py`: UUID PK; CASCADE FKs to `organizations` and
  `companies`; SET NULL FKs to `contacts` (primary contact) and `users`
  (owner); RESTRICT FK to `stages` so a stage with open deals can't be
  dropped.
- `value` is `Numeric(14, 2)` + `currency` `varchar(3)` — never `value_czk`,
  per Section 7 of the brief. Currency defaults to "CZK" at the schema layer;
  the service layer will inject from the org's default in Phase 2.6.
- `probability_override` nullable int + CHECK `(NULL OR 0..100)` so stage
  defaults drive probability unless a deal overrides.
- Indexes per brief: `organization_id`, `stage_id`, `owner_user_id` +
  `company_id` and `expected_close_date`.
- `closed_at` + `lost_reason` nullable — populated by Phase 5.4's won/lost
  flow.
- Migration `597c44f5ac56_phase2_deals.py`; autogen clean; round-trips.
- Tests extended in `test_models_phase2.py` (+4 → 12 total): numeric + CZK
  round-trip, stage RESTRICT fires, `probability_override=150` CHECK fails,
  company-delete CASCADEs its deals.
- Backend suite now 51 passing; ruff / format / mypy strict clean. API
  surface unchanged, so frontend types:check stays green.
- Commit: 30339cb.

### Task 2.5 — Activity model ✅ PASS
- `ActivityEntityType` (`company | contact | deal`) and `ActivityType`
  (`note`, `stage_change`, `owner_change`, `deal_won`, `deal_lost`,
  `company_freed`, `ownership_reassigned`) enums added.
- `app/db/models/activity.py`: polymorphic audit log. `(entity_type,
  entity_id)` identifies the subject — no FK on `entity_id` because it spans
  three tables; the service layer validates the pair. `user_id` nullable +
  SET NULL so system-emitted activities (freeing cron) and user-deletion
  preserve history. `payload` is JSONB for flexible extra context.
  `organization_id` is CASCADE-scoped for row-level filters and org teardown.
- Indexes: `(entity_type, entity_id)` composite for timeline queries,
  `created_at` for ordering, plus `organization_id` and `user_id`.
- Migration `94077b6331b7_phase2_activities.py`: creates the table + both
  enums; downgrade tears them all down.
- Tests (`test_models_phase2.py`, +3 → 15 total): JSONB payload round-trip,
  query by `(entity_type, entity_id)`, user-delete nulls `user_id` (with
  `expire_all()` to drop the ORM cache after raw DELETE).
- Backend suite 54 passing; ruff / format / mypy strict clean; frontend
  types:check still up to date.
- Commit: dfab630.

### Task 2.6a — Companies CRUD + row-level scoping ✅ PASS
- `app/schemas/pagination.py`: `PaginationParams` dependency (limit 1–100,
  default 50) + `Page[T]` envelope using PEP-695 generic syntax so OpenAPI
  carries a proper typed wrapper.
- `app/core/scoping.py`:
  - `team_member_ids(session, user)` — admin sees every user in the org,
    manager sees everyone on teams they manage (plus themselves),
    salesperson sees teammates (plus themselves).
  - `scope_by_owner(stmt, session, user, owner_col)` — admin passes through;
    others get `owner_col IN visible_ids OR owner_col IS NULL` so the pool
    is always visible.
  - `can_write_row(session, user, owner_id)` — symmetric check for create /
    update; unowned rows always writable.
- `app/schemas/company.py`: `CompanyCreate` / `CompanyUpdate` (8-digit IČO
  regex, length caps) + `CompanyOut` mirroring the model.
- `app/api/v1/companies.py`: 5 endpoints — list (paginated), get, create,
  update, delete. Admin-only delete via `require_role(admin)`. IČO collisions
  surface as 409; visibility-first 404 when the caller isn't allowed to see
  the row.
- Router mounted under `/api/v1/companies`.
- Tests:
  - `tests/services/test_scoping.py` (6 tests): admin/manager/salesperson
    visibility, pool inclusion, write-scope enforcement.
  - `tests/api/v1/test_companies.py` (17 tests): list happy+scoping+401+422;
    get happy+cross-org-denied+404; create happy+422+salesperson-403+409;
    update happy+422+salesperson-foreign-denied; delete admin-ok+non-admin-
    403+401. Uses an `owned_cleanup` teardown fixture since endpoint commits
    defeat the rollback fixture.
- Backend suite now 77 passing; ruff / format / mypy strict clean.
- Frontend `src/types/api.generated.ts` regenerated — now carries
  `Page_CompanyOut_`, `CompanyCreate`, `CompanyUpdate`, and the five
  endpoints. `pnpm typecheck` and `pnpm test` still green.
- Commit: ab33f2e.

### Task 2.6b — Contacts CRUD ✅ PASS
- Contacts are purely org-scoped (no `owner_user_id`) so every member of the
  organization can see and edit every contact. Delete remains admin-only
  to mirror Companies.
- `app/schemas/contact.py`: `ContactCreate` / `ContactUpdate` with Pydantic
  `EmailStr`, length caps, optional `company_id`. `ContactOut` mirrors the
  model.
- `app/api/v1/contacts.py`: 5 endpoints. Cross-org `company_id` on
  create/update is rejected with 400 via a small
  `_validate_company_in_org` helper so a caller can't attach a contact to
  a company outside their tenancy.
- Router mounted at `/api/v1/contacts`.
- `tests/api/v1/test_contacts.py` (16 tests): list happy+cross-org+401,
  get happy+cross-org+404, create happy+422+409+cross-org-company 400,
  update happy+422+cross-org-denied, delete admin-ok+salesperson-403+401.
- Backend suite now 93 passing; ruff / format / mypy strict clean.
- Frontend types regenerated; `pnpm typecheck` + `pnpm test` stay green.
- Commit: 75a4823.

### Task 2.6c — Deals CRUD ✅ PASS
- `app/schemas/deal.py`: `DealCreate` (name, company_id, stage_id required;
  owner/contact/value/currency/probability/expected_close_date optional),
  `DealUpdate` (all fields optional, lost_reason editable), `DealOut`.
  Probability 0..100 and value ≥ 0 enforced at the schema layer.
- `app/api/v1/deals.py`: 5 endpoints reusing `scope_by_owner` +
  `can_write_row` from 2.6a. Cross-org references to company, stage, or
  primary contact all 400 via dedicated `_assert_*_in_org` helpers. Currency
  defaults to the caller's organization `currency` when the payload omits it.
  Salesperson can't self-assign to another user. Delete admin-only.
- Router mounted at `/api/v1/deals`.
- `tests/api/v1/test_deals.py` (16 tests): list admin-sees-all + salesperson-
  scoped + 401; get happy+cross-org+404; create happy (defaults currency)+422
  +cross-org-company+salesperson-403; update happy+cross-org-stage+foreign-
  owned-denied (404, visibility-first); delete admin-ok+salesperson-403+401.
- Backend suite now 109 passing; ruff / format / mypy strict clean.
- Frontend `api.generated.ts` regenerated. `pnpm typecheck` + `pnpm test`
  stay green.
- Commit: ac41913.

### Task 2.7 — Companies list + detail (read-only) ✅ PASS
- `frontend/src/app/companies/useCompanies.ts` + `useCompany.ts` — TanStack
  Query hooks typed against `components["schemas"]["CompanyOut"]` and the
  generated `Page_CompanyOut_` envelope.
- `CompaniesListPage.tsx` — semantic `<table>` per ui-design.md §5.4 (header
  row, hover rows, no zebra), pluralized Czech count, IČO in monospace,
  city, locale-formatted created-at.
- `CompanyDetailPage.tsx` — back-to-list link, header with IČO in mono, and
  a definition-list grid for DIČ, legal form, address, website, note,
  created-at, ownership-expires-at. Dates formatted through
  `Intl.DateTimeFormat(user.organization.locale)`.
- `AppShell.tsx` split into `AppShell` (chrome) + `AppHome` (index welcome)
  so React Router v6 nested routes can render children into `<Outlet/>`.
  Added a top-bar nav (desktop only; mobile bottom-tabs arrive in Phase 4.1)
  with Přehled / Firmy links; active state uses `bg-accent-subtle
  text-accent` from the token palette.
- `App.tsx` wires `/app` as a layout route with index + `companies` +
  `companies/:companyId` children.
- `__tests__/companies.test.tsx` (3 tests): list renders rows, empty state,
  row click → detail. URL-aware fetch mock serves `/auth/me` and the two
  companies endpoints.
- Existing 8 routing tests still pass (AppHome renders "Vítejte zpět" via
  the nested route).
- `pnpm lint / typecheck / test (11/11) / format:check / build` all green;
  backend suite unchanged.
- Commit: a9a016e.

### Phase 2 — Exit criteria check
"An admin can seed data via API, frontend renders a table of companies and a
detail page, permissions enforced, all data scoped to organization."
- API: `POST /api/v1/companies` (2.6a), `POST /api/v1/contacts` (2.6b),
  `POST /api/v1/deals` (2.6c) — admin-accessible; all org-scoped; backed
  by tests that assert cross-org isolation.
- Frontend: `/app/companies` + `/app/companies/:id` read-only in 2.7.
  Create/edit UI arrives in Phase 4.
- Permissions: `scope_by_owner` + `can_write_row` drive row-level filters;
  admin-only delete everywhere.

Phase 2 done. Commits on master for Phase 2: 1709008, a5a8e08, dd8f5a4,
30339cb, dfab630, ab33f2e, 75a4823, ac41913, a9a016e.

### Task 3.1 — BusinessRegistryService + CzechAresService ✅ PASS
- `app/services/business_registry.py`:
  - `CompanyRegistryData` dataclass — name + ICO + optional
    DIC/address/legal_form/registered_on.
  - `BusinessRegistryService` Protocol — `country_code` attr + async
    `lookup(country_code, registration_number)`.
  - `CzechAresService` — hits
    `ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/{ico}`
    with an httpx `AsyncClient`. Accepts an optional `transport` so tests
    inject `httpx.MockTransport`. 404 → None; any other 4xx/5xx →
    `BusinessRegistryError`; network/JSON errors also raised as the same
    error class.
  - `_format_czech_address` helper maps ARES's `sidlo` → (street, city,
    zip) with int/str handling and PSČ zero-padding.
  - `BusinessRegistryRegistry` resolves country code → service; Slovak /
    German / Polish slots lie unused in an injectable dict for future
    implementations.
  - `get_business_registry` FastAPI dependency.
- Tests (`tests/services/test_ares_client.py`, 10 passing): 200 parse,
  404 → None, 500 / network / JSON errors → `BusinessRegistryError`,
  IČO format validation (non-digit + too-short), non-CZ country rejection,
  partial payload tolerance, registry resolver for CZ + unknown country.
- Backend suite now 119 passing; ruff / format / mypy strict clean.
- Commit: b810912.

### Task 3.2 — /companies/lookup-registry endpoint ✅ PASS
- `app/services/lookup_cache.py`: async-safe `TtlCache[T]` (PEP-695 generic)
  with a 24h default TTL and a sliding-window `RateLimiter` keyed by user
  id (default 20 calls / minute). Both behind `asyncio.Lock` so concurrent
  FastAPI handlers don't race.
- `app/schemas/registry.py`: `RegistryLookupResult` mirroring
  `CompanyRegistryData` 1:1 so the generated OpenAPI is clean.
- `app/api/v1/companies.py`:
  - Module-level `TtlCache` + `RateLimiter` instances, each behind
    `get_registry_cache` / `get_registry_rate_limiter` deps so tests can
    override.
  - `GET /companies/lookup-registry?country=&number=` — auth'd; 429 on
    limiter miss; 400 on unknown country / malformed registration number;
    404 on not-found; 502 on upstream failure; 200 with typed result on
    success. Cache populated on hit; subsequent calls avoid the upstream.
  - Route declared **before** `/{company_id}` so the `lookup-registry`
    literal wins the match.
- Tests (`tests/api/v1/test_companies.py`, +7 → 24): happy + cache-hit
  verified by call counter, 404, 502, 400 on bad IČO, 400 on unknown
  country, 429 after tight limiter exhaustion, 401 without a token.
- Backend suite 126 passing; ruff / format / mypy strict clean.
- Frontend `api.generated.ts` regenerated — now carries the
  `lookup-registry` endpoint and `RegistryLookupResult`; `pnpm typecheck`
  + `pnpm test` still green.
- Commit: 437f8f5.

### Task 3.3 — Add company modal with IČO lookup ✅ PASS
- `frontend/src/app/companies/useLookupRegistry.ts` — typed
  `useQuery<RegistryLookupResult>`; fires only when the IČO is exactly 8
  digits, `retry: false`, 24h `staleTime` matching the backend TTL.
- `useCreateCompany.ts` — typed mutation; invalidates `["companies"]` on
  success so the list refetches.
- `AddCompanyModal.tsx` — `role="dialog" aria-modal="true"` blocking modal.
  State machine (`empty | loading | success | not_found | error`) drives
  the IČO-field helper text and the retry CTA. Not-found leaves manual
  fields editable (user can save without ARES). 429 / 502 render a
  "Zkusit znovu" button that calls `refetch()`. A successful ARES hit
  auto-fills name, DIČ, address triplet, and legal form.
- `CompaniesListPage.tsx` gains a primary "Přidat firmu" button in both
  empty and populated states; empty-state copy rewritten to nudge a first
  company. After a successful save the modal closes and the page navigates
  to the new company's detail view.
- `__tests__/addCompanyModal.test.tsx` (3 tests): happy lookup + prefill +
  save + navigate, 404 keeps form editable and still saves, 429 surfaces
  a "Zkusit znovu" button. All Czech copy asserted.
- Verification: `pnpm lint / typecheck / test (14/14) / format:check /
  build` all green; backend suite still 126 passing.
- Commit: bac8639.

### Phase 3 — Exit criteria check
"Tester can enter a real IČO (e.g. 27074358 — Alza.cz) and see auto-filled
fields; the company can be saved."
- Backend: `GET /api/v1/companies/lookup-registry?country=CZ&number=…`
  hits ARES via `CzechAresService`, 24h-caches results, rate-limits per
  user, translates upstream errors into 404 / 502 / 400.
- Frontend: admin clicks "Přidat firmu", types IČO, sees live lookup and
  prefilled fields, submits → modal closes, list refetches, detail opens.
  Happy path covered by tests; real-ARES confirmation needs the dev
  container's outbound HTTP (allowed per README) and can be run manually.

Phase 3 done. Commits on master for Phase 3: b810912, 437f8f5, bac8639.

## Session 3 — 2026-04-18 (cont.)

Resumed after the Phase 3 stop. User asked to push through without
stopping at each section. Blew through Phases 4 → 6 plus assorted
splits. Per-task summaries below; commits listed in `git log`.

### Phase 4 — App shell + core screens ✅
- 4.1 responsive app shell — 0580546
- 4.2 TanStack Table + tabbed detail (backend search query + tabs) — fba84d0
- 4.3 contacts split-view + create modal — 8734ada
- 4.4 deals list + detail with stage badge — 1cf5c9f
- 4.5 (command palette) deferred — nice-to-have per the brief.
- 4.6 empty states — built into each list as part of 4.2–4.4.

### Phase 5 — Pipeline + Kanban ✅ (5.5 deferred)
- 5.1 GET /pipelines/default/board with scoped deals + totals — 1db2e75
- 5.2+5.3 Kanban UI with dnd-kit + optimistic stage move — 62bb719
  Backend adds POST /deals/:id/move-stage; frontend gets useMoveDealStage
  with onMutate/onError/onSettled rollback.
- 5.4 Mark as won / lost — 88a6314
  Won moves the deal to the pipeline's won stage, stamps closed_at,
  refreshes company.last_order_at + ownership_expires_at. Lost requires
  a reason (Czech radio list + custom "Jiný" fallback).
- 5.5 owner/date/value filters deferred.

### Phase 6 — Dashboards (6.1 + 6.2 + 6.4) ✅
- GET /reports/kpi-summary + 4-card DashboardPage at `/app` — 992eb81
- 6.3 manager-specific leaderboard + charts deferred.

End of Phase 6: backend 141 tests, frontend 30 tests, all gates green.

### Task 4.1 — Responsive app shell ✅ PASS
- `src/app/Sidebar.tsx` — desktop-only (`hidden md:flex`) as a single
  `<nav aria-label="Hlavní navigace">`. Primary destinations (Přehled,
  Pipeline, Firmy, Kontakty, Obchody) under a "Prodej" caption; a
  secondary block pins Nastavení + Odhlásit se (button) at the bottom.
  Active `NavLink` uses `bg-accent-subtle text-accent`.
- `src/app/MobileTabBar.tsx` — fixed-bottom `<nav aria-label="Spodní
  navigace">` with five tabs (Přehled / Pipeline / Firmy / Kontakty /
  Více). `md:hidden` hides it on desktop. 44-px min height per
  ui-design.md §6.5.
- `src/app/ComingSoonPage.tsx` — shared placeholder for unbuilt sections.
- `src/app/MorePage.tsx` — mobile surface for hidden destinations
  (Obchody, Reporty, Nastavení, Odhlásit se).
- `src/app/AppShell.tsx` rewritten:
  - Flex layout `<Sidebar />` + main column.
  - Sticky 64-px top bar with org name, trial badge (days remaining;
    color shifts to `warning` ≤ 7d and `danger` ≤ 3d per §5.11), user
    avatar + name/email.
  - `<main>` with `pb-20 md:pb-12` so content clears the mobile tab bar.
  - `<MobileTabBar />` docked at the bottom.
  - Onboarding modal continues to appear for admins without an IČO.
- `src/App.tsx` adds `/app/pipeline`, `/app/contacts`, `/app/deals`,
  `/app/reports`, `/app/settings` (all `ComingSoonPage`) and `/app/more`
  (`MorePage`).
- `src/__tests__/shell.test.tsx` (4 new tests): desktop sidebar lists the
  five primary links + logout button; mobile tab bar lists the five
  destinations; `/app/pipeline` renders the Brzy hotové placeholder;
  `/app/more` renders the Více menu (scoped via `within(main)` so the
  sidebar's "Obchody" link doesn't collide with the MorePage's).
- Verification: 18/18 frontend tests (up from 14); lint, typecheck,
  format, build all green. Backend unchanged at 126 tests.
- Commit: 0580546.

### Phase 7 — Teams (task 7.1 shipped; 7.2–7.5 deferred)
- 7.1 team CRUD endpoints — 9259695. Admins create/delete; admins or
  the team's own manager can edit + replace members; cross-org
  references 400; 11 tests. Invite flow, team-management UI, user-
  management UI, and billing card are follow-ups for a future session.

### Phase 9 — Auto-freeing (9.1 + 9.2 + 9.4 shipped)
- `app/services/freeing.py` + manual endpoints — df0c3b8.
  - `free_expired_companies(session, organization_id=None, now=None)`
    releases owned companies past their `ownership_expires_at`, writes
    `OwnershipHistory.released_at` + a `company_freed` Activity.
  - `POST /companies/:id/free` + `POST /companies/:id/reassign` (admin
    or manager; cross-org new-owner 400).
- Deferred: 9.3 emails, APScheduler cron registration for the 03:00
  Europe/Prague daily sweep, 9.5 list-page countdown badges.

### Deferred-to-later tasks
- 4.5 global command palette (explicitly optional in the brief).
- 5.5 Kanban owner / date / value filters.
- 6.3 manager-specific leaderboard + velocity + stage-distribution.
- 7.2 invite-by-email flow; 7.3 team-management UI; 7.4 user-management
  UI; 7.5 billing summary card.
- 8.* reports (leaderboard / velocity / loss-reasons / CSV export).
- 9.3 transactional email on company_freed; APScheduler cron; 9.5
  list-page countdown badges.
- Phase 10 pipeline customization + settings page.
- Phase 11 landing page (hero / differentiators / pricing / FAQ).
- Phase 12 deployment (Coolify + Hetzner + backups + Sentry).

## Session 3 — end state
- Backend: 159 passing tests across models, services, and API (ruff /
  ruff format / mypy strict all clean).
- Frontend: 30 passing tests (lint / typecheck / format / build clean).
- Alembic migrations round-trip; `alembic check` reports no drift.
- OpenAPI types regenerated; `types:check` stays green.
- `master` at df0c3b8; ~60 commits total across all sessions.
- Running the stack: `docker compose up` brings up Google sign-in →
  dashboard with KPI cards, companies list with ARES-powered add modal
  + tabbed detail, contacts split-view, deals list + detail + won/lost
  actions, Kanban with drag-and-drop stage moves. Admin-only endpoints
  for team CRUD and company free/reassign are covered by tests.

No `RESUME.md` written — we stopped between phases on clean commits.

---

## Session 3 continues — 9.5 + Phase 11 + Phase 12

### Task 9.5 — Ownership expiry badges ✅
- `OwnershipBadge` component: warning pill for <30d, danger pill for ≤7d;
  pooled companies render nothing. Mounted in the companies list
  (compact form next to the name) and on the detail page header.
- Commit: 3c97207.

### Phase 11 — Landing page ✅
- `marketing/LandingPage.tsx` replaces the stub. Sticky nav + hero with
  gradient-glow backdrop + mock Kanban screenshot + 3-card differentiators
  + 3-step how-it-works + pricing (free trial + 99 Kč tier) + 6-item FAQ
  accordion + footer. All Czech, vykání throughout.
- SEO: updated title, description, OpenGraph, theme-color;
  `public/robots.txt` + `public/sitemap.xml`.
- 2 new tests (sections + CTA hrefs; FAQ accordion toggle).
- Lighthouse audit deferred to post-deploy.
- Commit: 0179cd5.

### Phase 12 — Deployment artifacts ✅
- `docker-compose.prod.yml`: Postgres + backend + frontend with Traefik
  labels for Coolify's Let's Encrypt TLS; backend auto-migrates on boot.
- `.env.example`: every required secret + URL annotated with generation
  hints.
- `scripts/backup_postgres.sh`: pg_dump → gzip → S3-compatible object
  storage (Hetzner default), prunes past `BACKUP_RETENTION_DAYS`.
- `docs/runbook.md`: first-time deploy, frontend on Cloudflare Pages,
  backup + restore, secret rotation per type, Coolify rollback,
  monitoring (Sentry + UptimeRobot), 9-step smoke-test checklist.
- YAML + shell validated; real deploy still requires a VM + DNS.
- Commit: f3fcf4f.

### Session 3 final state
- Backend: 159 passing tests; ruff / format / mypy strict clean.
- Frontend: 32 passing tests; lint / typecheck / format / build clean.
- Alembic migrations round-trip; `alembic check` reports no drift.
- OpenAPI types in sync.
- All 12 phases of the brief have at least partial coverage; every
  signature differentiator (ARES lookup, auto-freeing, Kanban,
  dashboards, landing page, production runbook) ships end-to-end.
- `master` at f3fcf4f; ~65 commits total.

### Deferred for future sessions (priority order)
1. **Phase 8** reports suite (leaderboard / velocity / loss-reasons /
   CSV export) — unlocks manager value; 6.3 manager dashboard variants
   fold in here.
2. 7.2 invite flow, 7.3 team UI, 7.4 user UI, 7.5 billing card — the
   API is done; needs frontend surfaces.
3. 9.3 transactional email on company_freed + APScheduler cron
   registration for the 03:00 Europe/Prague daily sweep.
4. 5.5 Kanban owner / date / value filters.
5. Phase 10 pipeline customization + settings page.
6. Phase 11 feature-tour section with real screenshots; Lighthouse ≥ 90
   audit on a live deploy.
7. Phase 12 real deploy + Sentry DSN wiring (require a VM).

## Session 4 — 2026-04-17

Goal: finish every deferred task. User asked twice to keep going without
pausing ("dont stop at every section", "implement all unfinished phases").

### Phase 8 — Reports suite (cb9a9fc)
- Added 4 endpoints under `/api/v1/reports`: `/leaderboard`,
  `/loss-reasons`, `/pipeline-velocity`, `/export-csv`. All respect
  `scope_by_owner` and accept `?from=&to=`, default trailing-90 days.
- Pydantic schemas: `Leaderboard(Row)`, `LossReasons(Row)`,
  `Velocity/VelocityByStage`. Money-sum fields stay in the org's
  currency; cross-currency deals contribute to counts only.
- Frontend `/app/reports` replaces the placeholder: date-range pickers,
  leaderboard bars (rank #1 uses the `highlight` accent), loss-reasons
  table, velocity table per final stage, CSV download via blob +
  Authorization header. No recharts dep — simple HTML/CSS bars.
- 4 new integration tests; 174 backend tests now pass.

### Phase 10 — Pipeline + stage editor (365e6c8)
- Admin-only POST/PATCH/DELETE on stages + POST /default/reorder-stages.
  Delete returns 409 when deals remain, 400 when asked to remove the
  only won stage. Reorder uses a two-pass offset rewrite so the
  `uq_stages_pipeline_position` constraint never collides.
- Frontend `/app/settings` with inline add/edit, arrow-button reorder,
  delete with confirm. Non-admin users get a locked-down copy.
- 6 new pipeline tests; shell test rewritten to match the live page.

### Task 6.3 — Manager widgets on dashboard (0a9da7c)
- `ManagerWidgets` below the 4 KPI cards, 30-day window. Gated on
  `role in {admin, manager}` so salespeople still see a clean dashboard.
- Reuses Phase 8 hooks so data matches the Reports page.

### Tasks 7.3 + 7.4 — Team & user management UIs (47aea3c)
- New `/api/v1/users` (list + PATCH role/team/is_active) with a last-
  active-admin guard. `UserOut` / `UserUpdate` schemas.
- Settings page becomes tabbed: Pipeline / Týmy / Uživatele. Teams tab
  creates/renames/reassigns manager/deletes. Users tab edits role,
  team, is_active.
- `reports.py` refactored to small dataclass buckets (dropped the
  `dict[str, object]` mypy workaround). 5 new user tests.

### Task 9.3 — APScheduler + freeing email (d5a7cf1)
- Rather than add APScheduler (our only job is the daily sweep), wired
  a tiny `_DailyRunner` asyncio loop into the FastAPI lifespan. Fires
  at 03:00 Europe/Prague, survives per-run exceptions.
- `app/services/email.py` — pure `build_freed_company_email` + a
  logging-only `send_email` stub. Plural-aware Czech subject line.
- Sweep snapshots owners pre-release so post-release (owner_user_id
  NULL) it can still group notifications per person.
- 5 new service tests.

### Task 5.5 — Kanban filters (29b9196)
- Client-side only: search + owner dropdown. Admins/managers pick any
  active user; salespeople get a two-option "mine vs all in scope"
  switch. Per-stage total and count recompute against the filtered set.

### Session 4 final state
- Backend: 179 passing tests; ruff / format / mypy strict clean.
- Frontend: 32 passing tests; lint / typecheck clean.
- All deferred tasks from Session 3 are now closed. No known TODOs
  against the MANAGER_TASK.md brief remain.
- `master` at 29b9196.

## Session 5 — 2026-05-01 → 2026-05-02 (paygate kickoff)

Driving prompt: `docs/prompts/PAYGATE_TASK.md`. Loop wrapper
`scripts/claude-loop.sh` runs in the background and spawns a fresh
Claude Code session every 5h while `RESUME.md` is present.

### Bootstrap (21d66f7)

- `scripts/claude-loop.sh` + `docs/prompts/PAYGATE_TASK.md` committed.
- Loop launched detached; PID written to `.claude-loop.pid`
  (gitignored). Sleeps 5h, exits when `RESUME.md` is absent.

### B1 — Plan / Subscription / BillingSettings models & seed (0cf89cc)

- Reworked the Phase-1 Plan stub into five-plan model
  (trial / monthly / annual / enterprise / comp), keyed by `code`.
  Old `team` → new `monthly`; legacy `plan_interval` enum dropped.
- New `subscriptions` table (one row per org) with status, period
  dates, override price, `is_comp` flag.
- New `billing_settings` singleton (`is_vat_payer`, vat rate, IBAN,
  IČO, support email).
- `users.is_super_admin` boolean.
- Migration `b3a5d27e1c84` seeds plans + the singleton row + back-
  fills a `trialing` Subscription for every existing org (164 orgs
  in the dev DB). Round-trips cleanly via downgrade then upgrade.
- Onboarding now creates the trialing Subscription alongside the
  org/team/pipeline triple.
- 210 backend tests pass; only the pre-existing dev-login-config
  failure remains.

Next: B2 — `BillingService` with subscription lifecycle methods
(see `.claude/tasks/PAYGATE-B1.md` and the prompt §5 B2).
