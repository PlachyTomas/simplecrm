# ADR 0001 — Stack and repository structure

- Status: Accepted
- Date: 2026-04-17
- Deciders: Product owner (via `../manager-task.md`)

## Context

We are building SimpleCRM, a minimalistic Czech CRM for small sales teams. The brief
(`../manager-task.md`, Section 4) locks in the technical stack. This ADR records that
decision and its rationale so future contributors can see the "why" without re-reading
the whole brief.

## Decision

### Frontend
- **React 18 + Vite + TypeScript (strict)** — mainstream, fast, excellent DX.
- **Tailwind CSS + CSS variables** — themeable without shipping multiple stylesheets.
- **shadcn/ui** — copy-in components over a node-modules framework; low lock-in.
- **TanStack Query v5** — server state; avoids premature Redux/Zustand complexity.
- **TanStack Table v8** — rich tables without building pagination/sort ourselves.
- **react-hook-form + Zod** — performant forms with typed validation.
- **dnd-kit** — accessible, headless drag-and-drop for the Kanban.
- **Recharts** — adequate chart library without a 300 KB dependency (echarts, d3).
- **Lucide React** — one icon set, no mixing.
- **openapi-typescript** — API types are generated from the backend's OpenAPI spec.
  Hand-written API types are forbidden; CI enforces freshness.

### Backend
- **Python 3.12 + FastAPI** — ASGI, OpenAPI out of the box, Pydantic-native.
- **SQLAlchemy 2.0 (async) + asyncpg** — modern typed ORM, async throughout.
- **Alembic** — migrations. No hand-edited DDL.
- **Pydantic v2** — request/response schemas double as OpenAPI spec inputs.
- **python-jose + passlib[bcrypt]** — JWT and password hashing.
- **Authlib** — Google OAuth 2.0 client.
- **httpx** — outbound HTTP for ARES.
- **APScheduler** — daily company-freeing cron inside the app process (simpler than
  a separate worker for MVP).

### Database
- **PostgreSQL 16** in dev and prod.

### Tooling
- **uv** for Python deps. **pnpm** for Node.
- **ruff** + **mypy (strict)** for backend. **tsc --noEmit** + **eslint** for frontend.
- **pytest + pytest-asyncio + httpx.AsyncClient** backend tests.
- **Vitest** for frontend unit tests. **Playwright** for E2E.
- **Docker Compose** for local dev. **Coolify on Hetzner** for deployment.

## Consequences

Positive:
- Single OpenAPI spec is the source of truth for API types — impossible to drift.
- All state is async — no ORM-level sync-to-async impedance.
- CSS variables make theme-swap a single-file change.
- Per-tool choices are uncontroversial and have excellent documentation.

Negative:
- `uv` is newer than pip/poetry — some contributors will need to learn it.
- shadcn/ui components are copy-in — upgrades require manual sync rather than
  a dependency bump.
- APScheduler running in-process means the freeing job is coupled to the API
  process lifecycle. Acceptable for MVP; revisit if scale justifies a separate worker.

## Repository structure

Monorepo with `backend/` and `frontend/` as siblings (see `README.md`). Shared
tooling configuration (Docker, CI, editorconfig) lives at the repo root. Each app
is independently buildable and testable.
