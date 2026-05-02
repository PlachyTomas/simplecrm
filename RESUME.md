# RESUME — paygate build, after F1

## Where we are

Driving prompt: `docs/prompts/PAYGATE_TASK.md`. Auto-loop wrapper
(`scripts/claude-loop.sh`) is running and will keep relaunching Claude
sessions every 5h until this file is **absent**. Do **not** start a
second loop instance — check `.claude-loop.pid` first.

Backend is done. Last commits:

- `0cf89cc` — B1: Plan/Subscription/BillingSettings + seed + backfill
- `2f8b43a` — B2: BillingService + activity-enum migration
- `dded602` — B3: subscription + admin billing endpoints
- `cdcb6de` — B4: pay-gate dependency wired to BillingService
- `d948a27` — F1: PriceDisplay + useBillingSettings hook + public
  billing-settings read

258 backend tests pass (1 pre-existing dev-login-config failure
unchanged). Frontend lint/typecheck/test all green.

Read in order before starting: `docs/work-log.md` (Session 5 covers
B1–F1), `docs/prompts/PAYGATE_TASK.md` §6 onwards (frontend tasks),
`.claude/skills/ui-design.md` (mandatory before any UI change),
existing components for style match.

## Next task — F2: Public pricing page (`/cenik`)

Three-card layout. Czech, vykání. Mobile-stacks vertically.

- **Card 1 — Měsíční**: title `Měsíční`,
  `<PriceDisplay baseMinor={9900} interval="monthly" size="xl" />`,
  bullets ("Bez závazků", "Zrušení kdykoliv", "Plná funkcionalita"),
  CTA `Vyzkoušet 30 dní zdarma` → `/login` (or `/onboarding`).
- **Card 2 — Roční (highlighted)**: magenta `Doporučujeme · Ušetříte
  16 %` badge top-right (the **one** magenta element on the screen,
  light-mode only — re-read `.claude/skills/ui-design.md` §3),
  `<PriceDisplay baseMinor={99900} interval="annual" size="xl" />`,
  green-text savings line (`Ušetříte 189 Kč na uživatele · 2 měsíce
  zdarma`), bullets, CTA `Vyzkoušet 30 dní zdarma`.
- **Card 3 — Enterprise**: title `Enterprise`, instead of price the
  string `Vlastní balíček` size-xl, bullets ("25+ uživatelů",
  "Vlastní cena a podmínky", "Dedikovaná podpora", "Jednání o SLA"),
  CTA `Domluvte se s námi` → contact modal that posts to
  `POST /api/v1/organizations/current/subscription/contact-enterprise`
  *if logged in*; for unauthenticated visitors send to
  `mailto:podpora@simplecrm.cz` or to a separate
  `POST /api/v1/contact/enterprise` (out of scope — link to email if
  not authed).

**Below the cards** (smaller helper section):

- `is_vat_payer=false`: "Všechny ceny jsou bez DPH."
- `is_vat_payer=true`: "Ceny bez DPH; konečné ceny zobrazujeme s 21%
  DPH."
- "Zkušební doba je 30 dní. Žádná kreditní karta při registraci."

Read the plans + the public is_vat_payer via the existing
`useBillingSettings()` hook + a new `useQuery` for
`/api/v1/plans/public`. Bundle these into a tiny
`useCenikData()` hook in the new page module.

Mount the route. Look for the existing landing/marketing-page
structure under `frontend/src/marketing/` — copy that pattern. Pages
register in `frontend/src/App.tsx` (or wherever the router is).

Spec the work first at `.claude/tasks/PAYGATE-F2.md` (mirror the B1/
B2 spec format). Implement. Verify in browser via Playwright MCP per
CLAUDE.md (screenshot, console clean, 390 / 768 / 1280 viewports).
Commit as `feat(landing): pricing page with monthly/annual/enterprise
tiers`.

## After F2

§10 commit plan in `docs/prompts/PAYGATE_TASK.md`:
F3 trial countdown → F4 trial-expired pay gate → F5 in-app billing
settings → F6 super-admin UI → integration tests → final WORK_LOG /
README polish.

## When everything is done

- Verify every acceptance criterion in §8 of the prompt.
- Ensure all tests / lint / typecheck green on both stacks.
- **Delete `RESUME.md`** — its absence is the loop's "work complete"
  signal. The loop will exit on its next wake.

## House rules (compressed)

- Never go more than 30 minutes between commits.
- Update `docs/work-log.md` after each commit.
- The dev container is **not** running here; backend / frontend run
  on the host. Postgres is in `simplecrm-postgres-1`.
- Push permissions are **not** granted; commits stay local.
- The prompt's `PriceDisplay` is the **only** place
  `Intl.NumberFormat` for currency is allowed — grep proves it.
