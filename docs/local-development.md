# Running SimpleCRM locally

This is the single-source guide to get SimpleCRM running on your machine.
For production deploy see [`runbook.md`](./runbook.md); for the
Claude Code sandbox see [`dev-container.md`](./dev-container.md).

## Prerequisites

- **Docker + Docker Compose** — for Postgres (required)
- **Python 3.12** — exactly 3.12, not 3.11 or 3.13
- **Node 20+** and **pnpm** (`npm i -g pnpm` or use corepack)
- **uv** — Python package manager (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- A Google Cloud project with an OAuth 2.0 Client ID —
  **only if you need Google sign-in.** The dev-auth bypass
  (see [§8 Dev mode](#8-dev-mode-auth-bypass)) lets you skip it.

## 1. Clone and set up environment files

```bash
git clone <your-fork-url> simplecrm
cd simplecrm
```

### Backend env (`backend/.env`)

Create `backend/.env` with at minimum:

```dotenv
DATABASE_URL=postgresql+asyncpg://simplecrm:simplecrm@localhost:5432/simplecrm
APP_ENV=dev
JWT_SECRET=any-long-random-string-for-dev

# Google OAuth — create a Client ID of type "Web application" at
# https://console.cloud.google.com/apis/credentials and set:
#   Authorized JavaScript origin:  http://localhost:5173
#   Authorized redirect URI:       http://localhost:8000/api/v1/auth/google/callback
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback

FRONTEND_SUCCESS_REDIRECT=http://localhost:5173/app
FRONTEND_LOGIN_REDIRECT=http://localhost:5173/login
CORS_ORIGINS=http://localhost:5173
```

### Frontend env (`frontend/.env.local`)

```dotenv
VITE_API_BASE_URL=http://localhost:8000
```

## 2. Start Postgres

```bash
docker compose -f docker-compose.dev.yml up -d postgres
```

This exposes Postgres on `127.0.0.1:5432` with user/password
`simplecrm/simplecrm`. Data persists in the `postgres-data` Docker
volume. To nuke it: `docker compose -f docker-compose.dev.yml down -v`.

## 3. Backend

```bash
cd backend
uv sync                           # creates .venv, installs deps from uv.lock
uv run alembic upgrade head       # runs migrations
uv run uvicorn app.main:app --reload --port 8000
```

Open <http://localhost:8000/api/v1/docs> for Swagger and
<http://localhost:8000/api/v1/healthz> for the health check.

### Backend dev loop

```bash
uv run ruff check .               # lint
uv run ruff format .              # format
uv run mypy app                   # strict typecheck
uv run pytest                     # 179 tests, ~2 s
```

New migration after model changes:

```bash
uv run alembic revision --autogenerate -m "describe change"
uv run alembic upgrade head
```

## 4. Frontend

In a second terminal:

```bash
cd frontend
pnpm install
pnpm types:generate               # regenerate API types from backend OpenAPI
pnpm dev                          # http://localhost:5173
```

`types:generate` shells out to the backend via `uv run`, so the backend
virtualenv must exist (step 3). Run it any time you change a backend
endpoint or schema — CI fails if `src/types/api.generated.ts` drifts
from the live OpenAPI spec.

### Frontend dev loop

```bash
pnpm lint
pnpm typecheck
pnpm test                         # 32 tests, ~3 s
pnpm build                        # production bundle → dist/
```

## 5. First login

1. Open <http://localhost:5173>.
2. Click **Přihlásit** and complete the Google OAuth flow.
3. On first login you'll be routed to the onboarding form — enter your
   company name and IČO. ARES auto-fills the rest. You land in `/app`
   as the organization's `admin`.
4. Your free trial starts at 30 days. To test the expiry gate, update
   `organizations.trial_ends_at` in Postgres to a past date.

## 6. Promoting other users, seeding data

There is no invitation UI in MVP (deferred task 7.2). For local testing,
have a second Google account log in — it will hit the onboarding flow
unless you first insert their `users` row with the right
`organization_id`. Simplest path: both accounts create their own org,
then merge via SQL:

```sql
UPDATE users SET organization_id = '<your-org-id>', role = 'salesperson'
WHERE email = 'teammate@example.com';
```

Role editing after that point is available in the UI at
**Nastavení → Uživatelé** (admin only).

## 7. Scheduler / freeing job

The daily freeing sweep runs at 03:00 Europe/Prague via the in-process
scheduler (see `backend/app/services/scheduler.py`). To run it
immediately on-demand:

```bash
cd backend
uv run python -c "import asyncio; from app.services.scheduler import run_freeing_sweep; print(asyncio.run(run_freeing_sweep()))"
```

Or hit the manual admin-only endpoint per-company:
`POST /api/v1/companies/{id}/free`.

## 8. Useful scripts

- `scripts/dev.sh` — wrapper for the Claude Code dev container.
  See [`dev-container.md`](./dev-container.md).
- `scripts/backup_postgres.sh` — production pg_dump → S3 (not used
  locally).

## Troubleshooting

**`uv sync` fails with permission errors**
Inside the Claude Code dev container, `/home/node/.cache` is root-owned.
Export `UV_CACHE_DIR=/tmp/uv-cache` before running `uv`. Not needed on
a host machine.

**Frontend shows `Unexpected fetch` errors in tests**
You introduced a new endpoint but didn't mock it. Update the matching
test file under `frontend/src/__tests__/`.

**Login redirects to `/login` immediately**
Your cookie domain probably doesn't match. Keep both apps on
`localhost` (not `127.0.0.1`) during dev.

**Google OAuth redirect mismatch**
The Client ID's redirect URI must be exactly
`http://localhost:8000/api/v1/auth/google/callback` — no trailing
slash, HTTP not HTTPS.

**Postgres already in use on port 5432**
Change the host port in `docker-compose.dev.yml`
(`"127.0.0.1:5433:5432"`) and set `DATABASE_URL=…@localhost:5433/…`.
