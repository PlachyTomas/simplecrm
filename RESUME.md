# RESUME — paygate build, after F5

## Where we are

Driving prompt: `docs/prompts/PAYGATE_TASK.md`. Auto-loop wrapper
(`scripts/claude-loop.sh`) is **not** running this session — invoked
interactively. Restart per §0.3 if you want autonomous cadence back;
check `.claude-loop.pid` first.

Backend done (B1–B4); F1, F2, F3, F4, F5 done. Last commits:

- `0cf89cc` — B1: Plan/Subscription/BillingSettings + seed + backfill
- `2f8b43a` — B2: BillingService + activity-enum migration
- `dded602` — B3: subscription + admin billing endpoints
- `cdcb6de` — B4: pay-gate dependency wired to BillingService
- `d948a27` — F1: PriceDisplay + useBillingSettings
- `966d382` — F2: pricing page with monthly/annual/enterprise tiers
- `15c4154` — F3: trial countdown CTA + active-org gate
- `8e94cc9` — F4: trial-expired pay gate with monthly/annual choice
- *(latest)* — F5: in-app subscription settings page

64 frontend tests pass. 257 backend tests pass (1 pre-existing
dev-login-config failure unchanged from before F5). `pnpm typecheck`
and `pnpm lint` green.

Read in order before starting: `docs/work-log.md` Session 5 (latest
entry covers F5), `docs/prompts/PAYGATE_TASK.md` §6 F6 onwards,
`.claude/skills/ui-design.md` (mandatory before any UI change).

## Next task — F6: Super-admin UI

Per §6 F6 of the prompt — new `/admin` route, gated by
`User.is_super_admin`. Hidden from regular users (no main-sidebar
link). Accessible by typing `/admin` directly or via a small gear
icon in the user menu (super-admins only).

**Layout:** two-pane — left search + table of orgs (TanStack Table,
columns: Název, Plán, Stav, Uživatelé, Trial/Period končí, Poslední
aktivita). Right detail drawer when a row is clicked.

**Detail drawer:** org info (name, IČO, created_at, admin user(s),
user count), current subscription card with all dates, and action
buttons (each opens a modal):

- `Aktivovat předplatné` — choose plan (monthly/annual/enterprise),
  optional override price, period_months
- `Nastavit jako komplementární` — required reason text; optional
  ends_at
- `Nastavit Enterprise cenu` — required override price (Kč without
  DPH → minor units on submit), period_months, notes; live preview
  `Měsíční účet: {users × override} Kč / měsíc bez DPH`
- `Prodloužit zkušební dobu` — number of days; preview new ends_at
- `Zrušit předplatné` — confirm by typing org name; optional
  effective_at

History list: read-only timeline of subscription Activity records.

**Billing settings tab:** toggle `Jsem plátce DPH` (with tooltip
about effects), editable IBAN, IČO, podpora email.

All Czech vykání. All actions write Activity records. Every endpoint
already requires `is_super_admin` (B3 wired this).

Reuse what F4/F5 built:
- `usePublicPlans`, `useBillingSummary`, `useCurrentSubscription`
  for read-side data.
- `formatCzkMinor` from `components/billing/format.ts` for inline
  currency.
- `<PriceDisplay>` for plan-card prices.

Spec the work first at `.claude/tasks/PAYGATE-F6.md` (mirror F4/F5
format). Implement. Verify in browser via Playwright by setting
`users.is_super_admin=true` for the dev user via psql, then walking
through each admin action. Commit as
`feat(admin): super-admin org and subscription management`.

After F6: integration tests (§10) and final WORK_LOG / README polish.

## Optional polish (not blocking F6)

- Extend the 402 payload to include `email` so F4's confirmation
  card can echo `Na e-mail {…} jsme odeslali fakturu…` per the
  brief literal. Currently uses generic copy because the gate
  cannot fetch `/auth/me` (the gated endpoint). Tracked as a
  divergence in `.claude/tasks/PAYGATE-F4.md`.
- If F6 builds a third plan-chooser caller, extract a shared
  `<PlanChooser>` component (advisor's "rule of three"). Today
  F4 (pay-gate) and F5 (settings modal) each carry their own copy
  — small duplication, not a problem yet.

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
- Currency `Intl.NumberFormat` lives only in
  `frontend/src/components/billing/format.ts` (AC6). Date
  `Intl.DateTimeFormat` is unrestricted.
- Dev-login via the LoginPage form **creates a fresh org each time**
  the user's old org disappears (per `upsert_dev_user` +
  `create_organization_with_admin`). When seeding test states via
  psql, look up the *latest* org by `created_at` for the dev user,
  not the historical one.
