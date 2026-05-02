# RESUME — billing management

## Driving prompt

`docs/prompts/BILLING_MGMT_TASK.md`. Eight-step plan in tasks #33–#40
(see TaskList for live status). The auto-loop wrapper
(`scripts/claude-loop.sh BILLING_MGMT_TASK.md`) is running with PID
in `.claude-loop.pid`. Do NOT re-bootstrap it.

## What's already done

(Prior commits in this session, before this task started:
`81aa5fc` default-pipeline trim; `21866af` ownership-window;
`f699ea1` admin Enterprise-price fix; `79c10c7` admin UI;
`b865492` in-app billing settings; `8e94cc9` trial-expired pay gate.)

## Next step

Pick the lowest-numbered pending task from the TaskList and execute.
Update WORK_LOG.md after each commit so the next session picks up
fast. Delete this RESUME.md when **all** tasks #33–#40 are complete
and tests are green; that's the loop's "done" signal.

## House rules (compressed)

- pnpm + uv. `pnpm typecheck`, `pnpm lint`, `pnpm test` from
  `frontend/`. `uv run pytest` from `backend/`.
- Postgres in `simplecrm-postgres-1` — start with `docker start
  simplecrm-postgres-1`.
- Currency Intl is centralized in
  `frontend/src/components/billing/format.ts`. Don't reinstantiate.
- Dev-login creates a **fresh org each time the user's prior org is
  gone**; seed via the **latest** org by `created_at` for
  `admin@example.com`.
- Push permissions are not granted; commits stay local.
