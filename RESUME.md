# RESUME — Reports & Configurable Widgets

## Driving prompt

`docs/prompts/REPORTS_TASK.md`. The full plan lives in
`.claude/tasks/REPORTS.md` (R0–R9 with effort estimates and
sequencing notes).

The auto-loop wrapper (`scripts/claude-loop.sh
docs/prompts/REPORTS_TASK.md`) is running with PID in
`.claude-loop.pid`. Do NOT re-bootstrap it.

## What's already done

(Prior commits in this session: `6cef7d4` queue downsize; `32bb2a8`
seat-quota wizard; `e68b983` seat-count quota backend; `81aa5fc`
default-pipeline trim; `21866af` ownership-window; `f699ea1` admin
Enterprise-price fix; `79c10c7` admin UI.)

REPORTS phase pre-state: existing `/api/v1/reports/*` (kpi-summary,
leaderboard, loss-reasons, pipeline-velocity, team-leaderboard,
my-summary) and existing `frontend/src/app/reports/ReportsPage.tsx`.
The new work lives in parallel: widget endpoints under
`/api/v1/reports/widgets/`, layout config under
`/api/v1/reports/dashboard-config`. The salesperson dashboard's
`kpi-summary` consumer stays untouched.

## Next step

Pick the lowest-numbered pending task from the TaskList (#48–#52
covers R0+R1). Start with #48 (R0.1 — `User.reports_dashboard_config`
column + migration).

Update WORK_LOG.md (`docs/work-log.md`) after each commit so the next
session picks up fast. Delete this RESUME.md when **all** R0–R9
tasks complete and tests are green.

## House rules (compressed)

- pnpm + uv. `pnpm typecheck`, `pnpm lint`, `pnpm test` from
  `frontend/`. `uv run pytest -q` from `backend/`.
- Postgres in `simplecrm-postgres-1` — start with `docker start
  simplecrm-postgres-1`.
- Currency Intl is centralized in
  `frontend/src/components/billing/format.ts`.
- Dev-login auto-creates a fresh org with the default seat=1; for
  testing seed via the **latest** org by `created_at` for
  `admin@example.com`.
- Push permissions are not granted; commits stay local.
- Do NOT add probability-weighted forecasting or expected-vs-actual
  close-date analytics — explicit non-goals (REPORTS_TASK §2).
