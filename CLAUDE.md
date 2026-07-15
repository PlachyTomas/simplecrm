# SimpleCRM — Claude Code instructions

## Task start

- Evaluate the task's difficulty first and recommend a model for it (mention /fast when it fits). Never switch the main-session model yourself — that's the owner's call. For subagent tiers, follow the budget-optimal-ultracode skill.
- Before exploring the codebase, load the `navigating-simplecrm-code` skill (repo map, house patterns, gotchas) — don't rediscover by grepping.

## UI verification

- At the start of any UI task, ask who verifies: playwright (default) or the owner checking manually. If the owner verifies, skip the screenshot loop — finish with the route(s) to look at and keep the console-error check.
- After any change that affects rendered UI, use playwright mcp to navigate to the affected route, screenshot it, and check the browser console for errors.
- Iterate until the screenshot matches the intent. Do not claim a UI task is done without a screenshot in the final summary.
- On the first playwright call of a session, invoke it explicitly by name (e.g. "use playwright mcp to navigate to ...") to avoid falling back to bash or other tools.
- Save screenshots OUTSIDE the repo (scratchpad/tmp) — never into the working tree.

## Dev environment

Two setups — detect with `command -v docker`:

- **Docker mode** (Ubuntu / any machine with docker): `docker compose -f docker-compose.dev.yml up -d` → full stack, frontend :5173, backend :8000.
- **Host mode** (the macOS MacBook — no docker CLI; Homebrew postgresql@16 already runs the DB):
  - Frontend: `cd frontend && pnpm dev` → http://localhost:5173
  - Backend: `cd backend && DATABASE_URL=postgresql+asyncpg://simplecrm:simplecrm@localhost:5432/simplecrm POSTGRES_HOST=localhost DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run uvicorn app.main:app --reload --port 8000`

Gotchas that WILL bite otherwise:

- macOS only: `DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib` is required for ANY process importing the backend (uvicorn, pytest, alembic, scripts) — WeasyPrint needs Homebrew glib; without it: `OSError: cannot load library 'libgobject-2.0-0'`. Not needed on Linux.
- Backend tests in host mode need the same `DATABASE_URL`/`POSTGRES_HOST` env as uvicorn. A plain `uv run pytest` fails ~485 tests with DB-connection noise that looks like real failures — it isn't.
- Regenerate API types via the running server: `BACKEND_OPENAPI_URL=http://localhost:8000/api/v1/openapi.json pnpm types:generate` (default mode imports the backend in-process → same macOS glib crash).
- App login + seeded demo data for UI verification: see `.claude/skills/running-simplecrm/SKILL.md`.

## Before pushing

Run CI locally and get it green BEFORE every push — `.github/workflows/ci.yml` is the source of truth and nothing auto-fixes on the remote. The formatters are what actually go red; a green test suite says nothing about `ruff format` / `prettier`, so run the fix commands, not just the checks.

Fix first:

- `cd backend && uv run ruff check --fix . && uv run ruff format .`
- `cd frontend && npx prettier --write .`

Then verify all three jobs (prefix every backend command with the env from Dev environment; use `npx` on the frontend — see gotchas):

- backend: `uv run ruff check .` · `uv run ruff format --check .` · `uv run mypy app` · `uv run alembic upgrade head` · `uv run pytest`
- frontend: `npx eslint .` · `npx tsc -b --noEmit` · `npx prettier --check .` · `npx vitest run` · `npx vite build`
- api-types: `cd frontend && node scripts/generate-api-types.mjs --check`

Two traps this has already sprung:

- **Local green is necessary, not sufficient — CI is Ubuntu.** Anything asserting on output from a *system* library (not pinned by `uv.lock`) can pass here and fail there: WeasyPrint embeds a font subset via harfbuzz on macOS but via fontTools on the CI image, so identical markup yields different PDF bytes. Never pin a hash of rendered PDF output; assert on the deterministic layer above it (HTML — jinja2/babel/qrcode are pinned and pure-Python) or on same-process equality.
- **The backend job is fail-fast: ruff runs before mypy and pytest.** A lint error masks every test failure behind it, so a red job's first error is rarely the only one — fix it and re-run the rest locally before assuming you're done.

## Conventions

- All UI copy lives in i18n catalogs (`frontend/src/locales`, `backend/app/locales`); cs (vykání) is the reference language, en the first translation. New strings must land in both and pass `pnpm i18n:check`. Money/dates via `@/lib/format` with the locale from `useLocale()` (follows the active UI language) — details in the ui-design skill.
- Postgres native enums: adding values needs `ALTER TYPE ... ADD VALUE` in Alembic, run outside a transaction block.
