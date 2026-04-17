# Task 0.5 — CI pipeline

## Goal
A GitHub Actions workflow that runs lint, typecheck, and test for both apps,
plus a `types:check` step that re-generates the frontend's OpenAPI-derived
types and fails if the committed file drifts.

## Files in scope
- `.github/workflows/ci.yml` — main pipeline. Three jobs:
  1. `backend` — spin up Postgres service, run ruff, ruff format --check,
     mypy, pytest with DATABASE_URL pointing at the service.
  2. `frontend` — pnpm install, lint, typecheck, test, build.
  3. `api-types` — start backend briefly, dump `/openapi.json`, re-run
     `pnpm run types:generate`, fail if `git diff --exit-code src/types/api.generated.ts`.
- `frontend/package.json` — add `types:generate` and `types:check` scripts.
- `frontend/scripts/generate-api-types.mjs` — node script that:
  - Starts the backend (or reuses an already-running one via env var), or
    reads `BACKEND_OPENAPI_URL` pointing at the running instance.
  - Runs `openapi-typescript` to write `src/types/api.generated.ts`.
- `frontend/src/types/api.generated.ts` — initial committed content generated
  from the current backend (only has `/api/v1/healthz` + `/healthz/db`).
- Add `openapi-typescript` to frontend devDependencies.
- `frontend/src/types/README.md` — one-pager explaining these files are
  auto-generated; do not hand-edit.

## Acceptance criteria
1. `.github/workflows/ci.yml` is present and syntactically valid (yamllint
   mental-check — runner can't yamllint here).
2. `pnpm run types:generate` produces `src/types/api.generated.ts` that
   matches what CI would produce against the current backend.
3. `pnpm run types:check` runs generate + `git diff --exit-code` and fails
   clearly if drift is detected.
4. One commit: `ci: lint/typecheck/test pipeline + OpenAPI type freshness gate — Task 0.5`.

## Non-goals
- Coverage gates (will add once we have real tests).
- Docker image builds to a registry.
- Deployment triggers.
- Caching pnpm / uv across runs (bonus — add if straightforward).
