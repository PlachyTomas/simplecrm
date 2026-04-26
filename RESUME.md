# Resume — SimpleCRM polish pass

Driven by `FIXES_TASK.md`. See `WORK_LOG.md` for batch-by-batch detail.

## Shipped this session (commits on `main`)

1. **C0 — Critical UX bugs.** `8e5cbd7`
   Phase-leak strings on Deals/CompanyDetail tabs replaced. Pipeline gets a
   "+ Přidat obchod" header CTA + minimal AddDealModal. Czech plural helper
   + noun table; trial badge + companies count no longer say `0 firmy /
   0 dny zbývají`. `/more` redirects to `/app` on viewports ≥768px.

2. **G1 — Magenta rollout, lime retirement.** `7c5e1fa`
   Tokens + Tailwind get `brand-accent`, `win`, `text-on-brand-accent`.
   Primary retuned electric-blue → Radix iris-9. Lost = pure red, info =
   cyan. DealDetailPage win button magenta with near-black text; settled
   "Vyhráno" pill switched to success-green per brief ("magenta is
   dopamine, green is the record"). Backend pipeline seed flipped Vyhráno
   color to `#EC4899`. New `no-lime.test.ts` guard.

3. **G2 — Dark-by-system default + theme toggle.** `9319a6f`
   No-FOUC head script reads `simplecrm-theme=light|dark|system`,
   resolves via `prefers-color-scheme`, writes `data-theme`,
   `style.colorScheme`, `<meta theme-color>` before stylesheets.
   `<ThemeProvider>` + `useTheme` (light/dark/system + resolved). Three-way
   `<ThemeToggle>` (Sun/Moon/Monitor) wired into desktop sidebar bottom +
   landing page top nav.

4. **G4 — Unified `<EmptyState />`.** `2a7af43`
   New primitive in `components/ui/empty-state.tsx`. Migrated Deals,
   Pipeline, Companies, Contacts. `tone="filtered"` variant with
   "Vymazat filtry" wired on Companies search.

## Up next, in order

5. **G3 — Mobile responsiveness.** Bottom tab bar exists; remaining work
   is tables → stacked cards at <768px (`<DataTableMobileCard />`),
   Kanban `scroll-snap-type: x mandatory` with one column per snap, FAB
   for "+ Přidat obchod" on pipeline mobile, dialogs → bottom sheets at
   <768px, KPI grid stacking at <640px / <1024px / ≥1024px.
6. **B1 Landing**, **B2 Login**, **B3 Dashboard**, **B4 Companies**,
   **B5 Pipeline + B5b ARES**, **B6 Company detail**, **B7 Contacts**,
   **B8 Deals**, **B9 Reports**, **B10 Settings**, **B11 Trial
   countdown**, **B12 Toasts**.
7. **P1 — A11y pass.** Focus rings, aria-label audit, axe-core e2e,
   Lighthouse ≥95, reduced-motion respect, `lang="cs"` page titles.

## Pre-existing issue parked

`backend/tests/api/v1/test_auth.py::test_dev_login_404_when_disabled`
fails when run inside the dev compose env (which exports
`DEV_AUTH_ENABLED=true`). Confirmed pre-existing on unmodified `main`
via `git stash`. Not a regression. Needs a fixture-level env override
before the full task closes.

## How to continue

Start with **G3**. Read `FIXES_TASK.md §G3` and
`SIMPLECRM_DESIGN_BRIEF.md §6` (responsive breakpoints) before writing
code. Per-batch DoD: `pnpm lint && pnpm typecheck && pnpm test` from
`frontend/`, `ruff check . && mypy app && pytest` if backend touched,
update FIXES_TASK verification boxes + `WORK_LOG.md`, then one
Conventional Commit (`feat(responsive): ...`).

Delete this file when the full task is done (per FIXES_TASK definition
of done).
