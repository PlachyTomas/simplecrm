# SimpleCRM — Claude Code instructions

## UI verification

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

## Conventions

- All UI copy is Czech with vykání; money/dates via `Intl` with the org locale — details in the ui-design skill.
- Postgres native enums: adding values needs `ALTER TYPE ... ADD VALUE` in Alembic, run outside a transaction block.
