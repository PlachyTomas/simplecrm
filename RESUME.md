# RESUME — paygate build, after F4

## Where we are

Driving prompt: `docs/prompts/PAYGATE_TASK.md`. Auto-loop wrapper
(`scripts/claude-loop.sh`) is **not** running this session — invoked
interactively. Restart per §0.3 if you want autonomous cadence back;
check `.claude-loop.pid` first.

Backend done (B1–B4); F1, F2, F3, F4 done. Last commits:

- `0cf89cc` — B1: Plan/Subscription/BillingSettings + seed + backfill
- `2f8b43a` — B2: BillingService + activity-enum migration
- `dded602` — B3: subscription + admin billing endpoints
- `cdcb6de` — B4: pay-gate dependency wired to BillingService
- `d948a27` — F1: PriceDisplay + useBillingSettings
- `966d382` — F2: pricing page with monthly/annual/enterprise tiers
- `15c4154` — F3: trial countdown CTA + active-org gate
- *(latest)* — F4: trial-expired pay gate with monthly/annual choice

54 frontend tests pass. 257 backend tests pass (1 pre-existing
dev-login-config failure unchanged from before F4). `pnpm typecheck`
and `pnpm lint` green.

Read in order before starting: `docs/work-log.md` Session 5 (latest
entry covers F4), `docs/prompts/PAYGATE_TASK.md` §6 F5 onwards,
`.claude/skills/ui-design.md` (mandatory before any UI change).

## Next task — F5: In-app billing settings page

Per §6 F5 of the prompt — new tab in the Settings layout at
`/app/nastaveni/predplatne` (org admins only):

- **Aktuální plán** card — plan name + status pill (`Zkušební
  verze` / `Aktivní` / `Čeká na platbu` / `Komplementární` /
  `Po splatnosti` / `Zrušeno`). Comp orgs get an extra line and
  hidden actions; enterprise orgs show `Vlastní balíček · …` plus a
  contact CTA; standard trial/active/past_due orgs show a `Změnit
  plán` button → modal with monthly/annual mini cards.
- **Účtování** card (only non-comp/non-enterprise active subs):
  users × effective price = total per period. Monthly orgs see a
  projection `Pokud byste platili ročně, ušetříte {dynamic_savings}
  ročně. [Přejít na roční]`. Annual orgs see `Šetříte {savings}
  oproti měsíčnímu plánu.` Next renewal date via
  `Intl.DateTimeFormat('cs-CZ')` (the date helper, not the currency
  one — currency stays in `format.ts` per AC6).
- **Faktury** card: placeholder `Faktury budou dostupné po první
  platbě.` (real list when invoicing module ships).
- All prices via `<PriceDisplay>`. No hardcoded `Kč`.

Reuse F4's `usePublicPlans`, `useBillingSummary`,
`useCurrentSubscription`, plus the existing `useBillingSettings`.
The "Změnit plán" modal can reuse `formatCzkMinor` from `format.ts`.

Spec the work first at `.claude/tasks/PAYGATE-F5.md` (mirror F4
format). Implement. Verify in browser via Playwright by checking
each variant (trial / active / comp / enterprise / past_due) by
flipping `subscriptions.status` + `plan.code` via psql on the dev
user's latest org. Commit as `feat(billing): in-app subscription
settings page`.

Optional polish during F5: extend the 402 payload to include `email`
so F4's confirmation card can echo `Na e-mail {…} jsme odeslali
fakturu…` per the brief. Right now it uses generic copy because the
gate cannot fetch `/auth/me` (the gated endpoint). Tracked as a
divergence in `.claude/tasks/PAYGATE-F4.md`.

## After F5

§10 commit plan in `docs/prompts/PAYGATE_TASK.md`:
F6 super-admin UI → integration tests → final WORK_LOG / README
polish.

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
  `frontend/src/components/billing/format.ts` (AC6) — do not
  re-instantiate in new files; import from there.
- Dev-login via the LoginPage form **creates a fresh org each time**
  the user's old org disappears (per `upsert_dev_user` +
  `create_organization_with_admin`). When seeding test states via
  psql, look up the *latest* org by `created_at` for the dev user,
  not the historical one.
