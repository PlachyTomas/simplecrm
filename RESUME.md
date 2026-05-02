# RESUME — paygate build, after F3

## Where we are

Driving prompt: `docs/prompts/PAYGATE_TASK.md`. Auto-loop wrapper
(`scripts/claude-loop.sh`) is **not** running this session — invoked
interactively. Restart per §0.3 if you want autonomous cadence back;
check `.claude-loop.pid` first.

Backend done (B1–B4); F1, F2, F3 done. Last commits:

- `0cf89cc` — B1: Plan/Subscription/BillingSettings + seed + backfill
- `2f8b43a` — B2: BillingService + activity-enum migration
- `dded602` — B3: subscription + admin billing endpoints
- `cdcb6de` — B4: pay-gate dependency wired to BillingService
- `d948a27` — F1: PriceDisplay + useBillingSettings
- `966d382` — F2: pricing page with monthly/annual/enterprise tiers
- *(latest)* — F3: trial countdown CTA + active-org gate

258 backend tests pass (1 pre-existing dev-login-config failure
unchanged). 44 frontend tests pass. `pnpm typecheck` + `pnpm lint`
green. `pnpm build` has pre-existing strict-index-access errors in
`SettingsPage.tsx`, `DealDetailPage.tsx`, `pipeline/colors.ts`,
`companies.test.tsx`, `LandingPage.tsx` focus-trap — none introduced
by F3.

Read in order before starting: `docs/work-log.md` Session 5 (latest
entry covers F3), `docs/prompts/PAYGATE_TASK.md` §6 F4 onwards,
`.claude/skills/ui-design.md` (mandatory before any UI change).

## Next task — F4: Trial-expired pay gate

Per §6 F4 of the prompt:

- Triggered when API returns 402 `subscription_required` (B4 wires
  this — `app/core/deps.require_active_trial_or_subscription`).
- Centered card on blurred app-shell background — one-screen
  exception to the no-glassmorphism rule (`backdrop-filter: blur(8px)`).
- Headline: `Vaše zkušební doba skončila.`
- Two-card mini pricing (monthly + annual; mobile stacks). Annual
  carries the magenta `Ušetříte 16 %` badge. Each shows dynamic
  `S Vašimi {N} uživateli ušetříte {N × 18900 minor → formatted}` on
  the annual card.
- Below: link `Potřebujete víc? Domluvte se na enterprise balíčku.`
  → contact modal (or mailto fallback for unauthenticated, but here
  the user IS authenticated since the gate fires after login).
- Footer: `Vybrat plán` (primary, disabled until card selected) and
  `Exportovat data` (ghost).
- Tertiary: `Máte otázky? Napište nám na podpora@simplecrm.cz`
- On `Vybrat plán` click after selecting:
  - `POST /api/v1/organizations/current/subscription/choose-plan`
  - 200 → confirmation card: `Děkujeme. Pošleme vám platební instrukce.`
  - Org stays gated until founder activates via super-admin UI.
- For `is_comp=true` orgs the gate is **never** shown (B2's
  `is_app_access_allowed` returns true unconditionally).
- For enterprise orgs whose `current_period_ends_at` has passed,
  CTA changes to `Kontaktovat obchod` only (no monthly/annual cards).

Existing `frontend/src/auth/TrialExpiredGate.tsx` is a Phase-1
placeholder — F4 replaces or substantially extends it. Read it
first, decide whether to extend or rewrite.

For `S Vašimi {N} uživateli` — read the user count from
`GET /api/v1/organizations/current/billing-summary`
(`user_count` field). The endpoint already exists (B3).

Reuse `<PriceDisplay>` for the two cards. Reuse the F2 pattern for
the magenta badge (one element on the screen, top-right of the
annual card).

Spec the work first at `.claude/tasks/PAYGATE-F4.md` (mirror F2/F3
spec format). Implement. Verify in browser via Playwright by
flipping the test org's `trial_ends_at` to the past + status to
`canceled` (the only status that always returns false from
`is_app_access_allowed` once the date is past). Commit as
`feat(billing): trial-expired pay gate with monthly/annual choice`.

## After F4

§10 commit plan in `docs/prompts/PAYGATE_TASK.md`:
F5 in-app billing settings → F6 super-admin UI → integration tests
→ final WORK_LOG / README polish.

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
  `docker start simplecrm-postgres-1` if it's stopped.
- Push permissions are **not** granted; commits stay local.
- The prompt's `PriceDisplay` is the **only** place
  `Intl.NumberFormat` for currency is allowed — grep proves it.
- Dev-login via the LoginPage form **creates a fresh org each time**
  the user's old org disappears (per `upsert_dev_user` +
  `create_organization_with_admin`). When seeding test states via
  psql, look up the *latest* org by `created_at` for the dev user,
  not the historical one.
