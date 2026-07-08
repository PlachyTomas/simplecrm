---
name: running-simplecrm
description: Use when starting, verifying, or driving the SimpleCRM app locally — booting the dev stack, logging into the UI for Playwright checks, seeding demo data, running test suites, or regenerating API types. Covers both macOS host mode and Docker/Ubuntu mode.
---

# Running SimpleCRM locally

## Boot (pick by `command -v docker`)

**Docker mode** (Ubuntu / any docker machine):
```bash
docker compose -f docker-compose.dev.yml up -d   # frontend :5173, backend :8000, postgres :5432
```

**Host mode** (macOS MacBook — no docker CLI; brew postgresql@16 serves the DB):
```bash
cd frontend && pnpm dev                          # :5173
cd backend && DATABASE_URL=postgresql+asyncpg://simplecrm:simplecrm@localhost:5432/simplecrm \
  POSTGRES_HOST=localhost DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib \
  uv run uvicorn app.main:app --reload --port 8000
```
Readiness: `curl http://localhost:8000/api/v1/openapi.json` → 200, `curl http://localhost:5173` → 200.
Migrations: `uv run alembic upgrade head` (same env prefix as uvicorn in host mode).

## UI login for Playwright verification

- **eva@demo.cz / ClaudeReview2026!** — org admin of the seeded demo org (12+ companies,
  38+ deals). Local dev DB only.
- If that login 401s (fresh DB / other machine): `uv run python scripts/seed_demo_org.py`
  (env prefix as above), then set a known password directly:
  ```bash
  HASH=$(uv run python -c "from app.core.passwords import hash_password; print(hash_password('ClaudeReview2026!'))")
  psql -h localhost -U simplecrm -d simplecrm -c \
    "UPDATE users SET password_hash='$HASH', email_verified=true, email_verified_at=now() WHERE email='eva@demo.cz';"
  ```
  (The "error reading bcrypt version" warning is benign passlib noise.)

## Test suites (all must be green before claiming done)

```bash
# backend — host mode NEEDS the env prefix; without it ~485 phantom DB failures
cd backend && DATABASE_URL=postgresql+asyncpg://simplecrm:simplecrm@localhost:5432/simplecrm \
  POSTGRES_HOST=localhost DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run pytest -q
cd frontend && npx vitest run && npx tsc -b --noEmit
```
`pnpm vitest`/`pnpm typecheck` occasionally die in pnpm's deps-status-check — `npx` is reliable.

## API types regen (after backend schema changes)

Backend must be running with the NEW code (no --reload in scripts → restart it), then:
```bash
cd frontend && BACKEND_OPENAPI_URL=http://localhost:8000/api/v1/openapi.json pnpm types:generate
```
Default (URL-less) mode imports the backend in-process → crashes on macOS glib (WeasyPrint).

## Verify-a-change flow

1. Boot stack, log in as eva, navigate to the affected route with playwright mcp.
2. Exercise the change for real (create/edit/move data — old rows may predate new payload
   shapes; activity-feed features usually need FRESH actions to show new rendering).
3. Screenshot (save under the session scratchpad, NEVER in the repo) + check console
   (React Router future-flag warnings and /favicon.ico 404 are known noise).
4. Full suites (above) before claiming done.

## Known traps

- Playwright MCP shares ONE browser — never run two browser agents in parallel.
- Backend has no --reload when started by agents/scripts: restart after backend edits.
- macOS `DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib` applies to EVERY backend-importing
  command (uvicorn, pytest, alembic, seed scripts); SIP strips it through node child
  processes, hence the BACKEND_OPENAPI_URL workaround for types:generate.
