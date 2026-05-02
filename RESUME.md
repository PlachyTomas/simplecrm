# RESUME — paygate build, after F2

## Where we are

Driving prompt: `docs/prompts/PAYGATE_TASK.md`. Auto-loop wrapper
(`scripts/claude-loop.sh`) was started in Session 5 but is **not
currently running** (`.claude-loop.pid` is absent and no `claude-loop`
process exists). This session was opened interactively. If you want
the autonomous cadence back, restart it per §0.3 of the prompt — but
do **not** start a second instance; check `.claude-loop.pid` first.

Backend done (B1–B4), F1 + F2 done. Last commits:

- `0cf89cc` — B1: Plan/Subscription/BillingSettings + seed + backfill
- `2f8b43a` — B2: BillingService + activity-enum migration
- `dded602` — B3: subscription + admin billing endpoints
- `cdcb6de` — B4: pay-gate dependency wired to BillingService
- `d948a27` — F1: PriceDisplay + useBillingSettings hook + public
  billing-settings read
- *(latest)* — F2: pricing page with monthly/annual/enterprise tiers

258 backend tests pass (1 pre-existing dev-login-config failure
unchanged). 40 frontend tests pass. `pnpm typecheck` + `pnpm lint`
green. `pnpm build` has pre-existing strict-index-access errors in
`SettingsPage.tsx`, `DealDetailPage.tsx`, `pipeline/colors.ts`,
`companies.test.tsx`, `LandingPage.tsx` focus-trap — none introduced
by F2. Address as a separate cleanup pass if desired.

Read in order before starting: `docs/work-log.md` Session 5
(latest entry covers F2), `docs/prompts/PAYGATE_TASK.md` §6 F3
onwards, `.claude/skills/ui-design.md` (mandatory before any UI
change), existing components for style match.

## Next task — F3: Trial countdown UI updates

Per §6 F3 of the prompt:

- More than 7 days left: tertiary text `Zkušební verze · {days} dní
  zbývá`
- ≤ 7 days: warning + small CTA `Vybrat plán →` →
  `/app/nastaveni/predplatne` (route doesn't exist yet — F5 builds
  it; for F3, link can land on `/app/settings` and we wire the deep
  link in F5)
- ≤ 3 days: danger color, same CTA bolder

Where to render: the `AppShell` sidebar footer (or topbar, whichever
the existing trial badge currently lives in — grep
`Zkušební verze`). The current badge logic is somewhere in
`frontend/src/app/AppShell.tsx` or `MorePage.tsx`; it pre-dates the
paygate work, so locate and extend rather than rebuild.

Subscription read: `GET /api/v1/organizations/current/subscription`
returns `current_period_ends_at`. Compute `days_remaining` client-side
from `Date.now()` — don't trust a server-side count that can drift
across the user's timezone.

Spec the work first at `.claude/tasks/PAYGATE-F3.md` (mirror the F2
spec format). Implement. Verify in browser via Playwright MCP per
CLAUDE.md (screenshot, console clean, three test orgs at >7d / ≤7d /
≤3d remaining — easiest to seed via psql against
`simplecrm-postgres-1`). Commit as
`feat(billing): trial countdown with upgrade CTA`.

## After F3

§10 commit plan in `docs/prompts/PAYGATE_TASK.md`:
F4 trial-expired pay gate → F5 in-app billing settings → F6
super-admin UI → integration tests → final WORK_LOG / README polish.

## When everything is done

- Verify every acceptance criterion in §8 of the prompt.
- Ensure all tests / lint / typecheck green on both stacks.
- **Delete `RESUME.md`** — its absence is the loop's "work complete"
  signal. The loop will exit on its next wake.

## House rules (compressed)

- Never go more than 30 minutes between commits.
- Update `docs/work-log.md` after each commit.
- The dev container is **not** running here; backend / frontend run
  on the host. Postgres is in `simplecrm-postgres-1` — start it with
  `docker start simplecrm-postgres-1` if it's stopped (this happens).
- Push permissions are **not** granted; commits stay local.
- The prompt's `PriceDisplay` is the **only** place
  `Intl.NumberFormat` for currency is allowed — grep proves it.
