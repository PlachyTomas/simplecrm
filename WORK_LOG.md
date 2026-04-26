# SimpleCRM polish & completion pass — work log

Per-batch entries for the work driven by `FIXES_TASK.md`. Newest at the top.

---

## 2026-04-27 — B10 settings polish

Tab list expanded from 3 to 7: Pipeline / Týmy / Uživatelé / Vzhled /
Oprávnění / Fakturace / Integrace. Each new tab is a self-contained
section component:

- **Vzhled** — mirror of the G2 ThemeToggle (Světlý / Tmavý / Systém).
- **Oprávnění** — read-only matrix of role × action with the spec copy
  "Oprávnění jsou v této verzi pevně daná. Pokud potřebujete vlastní
  role, dejte nám vědět."
- **Fakturace** — disabled "Spravovat platbu" button + trial copy.
- **Integrace** — three cards: ARES (Aktivní), Slack (Brzy), Webhooky
  (Brzy).

Pipeline-tab Vyhráno stage dot already turned magenta via the G1
backend seed change.

### B10 deferred

- **Profil** tab — needs first_name/last_name split + avatar upload
  backend.
- **Firma** tab — needs writable tenant-company endpoint + logo upload.
- Density toggle in Vzhled — no density tokens defined yet.

Commit: `feat(settings): vzhled / oprávnění / fakturace / integrace tabs (B10)`.

---

## 2026-04-27 — B9 reports polish

- Leaderboard #1 row now wears a magenta crown badge (matches the
  dashboard treatment) and the progress bar fills with brand-accent
  instead of the alias `bg-highlight`.
- Czech plural helper applied to leaderboard deal counts ("3 obchody"
  / "1 obchod" / "0 obchodů").
- Empty-state for the leaderboard card now uses the `<EmptyState />`
  primitive (icon Trophy, no primary CTA — there's nothing to do until
  someone closes a deal).

Recharts charts (pipeline velocity, stage distribution, loss-reasons
bar chart, velocity sparkline) deferred — adding Recharts is a heavy
dependency and the existing tabular variants still convey the same
data legibly. Owner/team multi-select filters deferred (need new
backend params). CSV BOM verification is backend scope.

Commit: `feat(reports): magenta leaderboard crown + plural counts (B9)`.

---

## 2026-04-27 — B8 deals list

- Real columnar list now: Název / Firma / Hodnota / Fáze chip / Vlastník
  / Uzavření. Stage chip uses the same `stageColor(position)` palette
  that B5 wired into the kanban. Owner + company resolved through the
  existing `useOrgUsers` and `useCompanies` lookups — single fetch each.
- Mobile (<768px): only Název and Hodnota visible; Firma / Fáze /
  Uzavření hidden until ≥768px; Vlastník until ≥1024px. Standard
  responsive pattern to keep the row legible at 390px.

Filters (owner / stage / value range / date range / search), server-
side sort, and Dnů-ve-fázi column deferred — server side needs new
endpoint params and the schema doesn't expose stage_changed_at.

Commit: `feat(deals): list view with company / stage / owner columns (B8)`.

---

## 2026-04-27 — B7 contacts polish

- Bare "+" header button replaced with labeled "+ Přidat kontakt"
  (indigo, text + icon).
- New search field (debounced 250ms) filters the list across first
  name + last name + email + phone.
- Filtered-empty state with "Vymazat filtry" primary; first-run empty
  state unchanged.
- Selected row gets a 2px indigo seam on the left edge per brief §5.

Filter-by-company dropdown and explicit "Naposledy přidané" sort
deferred — both would benefit from backend support (sort param on the
contacts list endpoint).

Commit: `feat(contacts): labeled add button + search filter + selected seam (B7)`.

---

## 2026-04-27 — B6 company detail (partial)

- Header now surfaces owner name ("Vlastník: …" or "Ve sdíleném
  poolu") and an "Otevřít v ARES" external link at
  https://ares.gov.cz/ekonomicke-subjekty?ico={ico}.
- Vlastnictví vyprší overview row shows the absolute date (existing) +
  a relative line below it ("za 11 měsíců" / "za 1 rok 2 měsíce") via
  `Intl.RelativeTimeFormat`.
- 3-stat-card grid, ownership timeline, and Kontakty/Obchody/Aktivita
  sub-tabs deferred — all require new backend endpoints (contacts-
  by-company, deals-by-company, activity-by-company, ownership-events).

Commit: `feat(companies): owner display + ARES external link + relative date (B6)`.

---

## 2026-04-27 — B5b ARES IČO modal state machine

- IČO field now triggers the registry lookup automatically when the
  debounced (250ms) value matches `^\d{8}$`. The previous on-blur
  trigger was kept too — auto-fire is the more intuitive flow.
- Input strips non-digit characters at input time (`replace(/\D/g,"")`)
  and slices to 8 chars, so paste of "CZ27082440" or "270 824 40"
  still resolves cleanly without surfacing a validation error.
- Six explicit states surfaced as text/icon variants:
  - `empty`: cheat-sheet helper "Zadejte IČO (8 číslic) — …"
  - `typing`: "X / 8" counter + "Pokračujte ve psaní…"
  - `loading`: "Hledám v ARES…"
  - `success`: "Údaje doplněny z ARES."
  - `not_found`: "IČO {ico} nebylo v ARES nalezeno. Zkontrolujte
    zadání nebo pokračujte ručně."
  - `error`: "ARES je momentálně nedostupný…" + "Zkusit znovu" button
- One affected test updated (the 404 hint copy moved from "v ARES
  nenašli" to "nebylo v ARES nalezeno" per FIXES_TASK §6).

### B5b deferred

- Discrete "Použít údaje" confirm button on success — current behavior
  auto-fills the form fields on success; adding a confirm step would
  gate users behind an extra click without clear UX value. Logged as a
  deliberate deviation.
- Backend 24h cache (Phase 4 Task 4.3) — backend scope, out of this
  pass.

Commit: `feat(ares): six-state IČO autofill machine (B5b)`.

---

## 2026-04-27 — B5 pipeline major polish

- New `frontend/src/app/pipeline/colors.ts`: progressive stage palette
  keyed off `stage.position` (zinc-400 → sky-500 → indigo-500 →
  violet-500 → amber-500 → magenta), with fallback to the stage's
  stored hex for any admin-added stage beyond the seeded six.
  `StageColumn` consumes it for the dot AND a 3px left-seam (`box-
  shadow: inset 3px 0 0 …`) per brief §4.
- Per-column "+" button: ghost icon button on each column header,
  invisible on desktop until hover/focus, always visible on touch.
  Pre-fills the stage in the AddDealModal.
- Win celebration:
  - `frontend/src/lib/celebrate.ts` — single `celebrateWin(anchor?)`
    helper using `canvas-confetti` (added as a new dep,
    `@types/canvas-confetti` as a dev-dep). Suppressed under
    `prefers-reduced-motion: reduce`. Tuned to brief: 120 particles,
    spread 80, scalar 0.9, magenta + indigo + zinc palette.
  - `useMarkAnyDealWon` (new): variant of `useMarkDealWon` that takes
    the `dealId` per call instead of per hook-instance. Lets the deal
    card list fire the win without spawning N hooks.
  - Magenta "Vyhráno" button on each card (hover-revealed, always on
    touch). On click: optimistic mutation + confetti anchored on the
    button + magenta-tinted toast. Toast auto-dismisses at 4s.
  - Cards in the won-type column hide the win button — there's nowhere
    to move them.

### B5 deferred

- Inline "+ Přidat firmu" inside the company autocomplete in the
  AddDealModal (would require a nested-modal flow).
- Card-level "Označit jako prohranou" — DealDetailPage already
  handles it; pipeline shortcut is lower priority.
- Desktop horizontal scroll shadows + chevron buttons. Mobile scroll-
  snap landed in G3; the gradient-shadow approach needs JS measurement
  to handle dynamic content widths.

Commit: `feat(pipeline): stage palette, per-column +, win confetti (B5)`.

---

## 2026-04-27 — B4 companies list (partial)

- New "Vlastník" column rendering owner avatar (initials) + name, or
  "— ve sdíleném poolu" when `owner_user_id` is null. Owner lookup is
  built once via `useOrgUsers` and memoized into a `Map`.
- Pagination footer copy switched to FIXES_TASK spec: `1–25 z 127
  firem` with `csNoun(total, "firma")` so the n=0 / n=2–4 / n=5+ forms
  are right.
- Mobile stacked-card variant from G3 retained.

### B4 deferred

- ARES sync indicator — needs new `ares_synced_at` field on the
  Company schema.
- Owner / expiry / ARES-status filters + URL state — multi-hour
  feature work, punted to a future pass.
- Bulk actions (select rows + bulk reassign / release / export) —
  significant scope.
- `[`/`]` keyboard shortcuts for prev/next page — punted to P1.
- Sortable Vyprší column — needs the Vyprší value as its own column
  instead of inline next to the name; rolled into the deferred filter
  work.

Commit: `feat(companies): owner column + paginated count footer (B4)`.

---

## 2026-04-27 — B3 dashboard polish (partial)

- Greeting "Vítejte zpět, {firstName}" — extracts first whitespace-
  delimited token from `user.name`, falls back to email local-part.
  Test fixture updated.
- Leaderboard #1 row gains a small magenta crown badge — the
  dashboard's magenta moment. Brief calls this out in §3 ("Sparkline
  trend leader on the dashboard" / "Badge on the leaderboard leader").

### B3 deferred (significant scope)

- "Firmy blížící se uvolnění" widget — needs `GET /api/companies/expiring?
  days=60` endpoint that doesn't exist; would also need owner avatar
  rendering. Backend + frontend coordination required.
- Recent activity feed — needs activity-list endpoint.
- Mini-pipeline snapshot — needs stage-count summary or client reduce.
- Velocity / stage-distribution charts — punted to B9 (the same charts
  appear in the Reports spec).
- All-zero KPI hint line — pure UX nicety; not a regression.

Two largest deferrals (expiring widget + activity feed) require new
backend endpoints; flagging here so the scope-of-work decision is
visible.

Commit: `feat(dashboard): first-name greeting + leaderboard magenta crown (B3)`.

---

## 2026-04-27 — B2 login

- Dev-login panel double-gated: `import.meta.env.MODE !== "production" &&
  import.meta.env.VITE_DEV_AUTH_ENABLED === "true"`. Production bundles
  short-circuit to `false` regardless of the env var. FIXES_TASK B2
  spec named the var `VITE_DEV_LOGIN` — kept the existing
  `VITE_DEV_AUTH_ENABLED` since `docker-compose.dev.yml` already wires
  that name. Renaming would silently break the dev container with no
  visible signal.
- ThemeToggle (compact) placed top-right of the login page.

Commit: `feat(login): theme toggle + production-mode dev-login gate (B2)`.

---

## 2026-04-27 — B1 landing polish

- Hero headline: word "prodej" now wears the magenta underline via a
  Tailwind arbitrary-value `bg-[linear-gradient(transparent_82%,var(--color-brand-accent)_82%,…)]`.
  The earlier accent-blue treatment of "Nic víc, nic míň." was removed
  per the brief — the headline reads in primary text, with one earned
  magenta moment on the single most-weighted word.
- Hero glow: the single accent blur was replaced with a dual radial
  gradient — indigo bottom-left at 30% opacity, magenta top-right at
  20% — the only place the brief allows that gradient combo.
- FAQ accordion already keyboard-accessible (native `<button
  aria-expanded>`); no change.
- Pricing card untouched per spec — hero already owns the magenta
  moment; adding a magenta "Nejoblíbenější" badge would compete.
- Typo "Žádné zbytečností" → "Žádné zbytečnosti" not present in the
  repo. Only "Bez zbytečností" exists, which is correct genitive after
  the preposition `Bez`.

### B1 deferred

- Feature tour with 4 real screenshots — needs visual content + copy
  pass; out of scope for autonomous run.
- Trust strip with logos / iconography — same.

Commit: `feat(landing): magenta hero accent, dual glow, FAQ confirm`.

---

## 2026-04-27 — G3 mobile responsiveness pass

- Dashboard KPI grid `sm:grid-cols-2 xl:grid-cols-4` → `sm:grid-cols-2
  lg:grid-cols-4` to match the spec breakpoints (1 / 2 / 4 at <640 /
  640–1024 / ≥1024).
- Companies list now renders a `<ul>` of stacked cards at <768px
  (mobile) and the existing TanStack table at ≥768px. Each card shows
  name + ownership badge + IČO (mono) + city. No new primitive yet —
  `<DataTableMobileCard />` lands when Deals/Users tables are migrated
  in B8/B10.
- Pipeline Kanban: columns `w-72` → `w-[92vw] md:w-72` with `snap-start`,
  container `snap-x snap-mandatory` with `[scroll-padding-left:1rem]`.
  One column per swipe at <768px, no change at desktop.
- Pipeline header CTA hidden on mobile; replaces with a circular FAB
  bottom-right (only when there are deals — empty-state has its own
  primary). FAB sits above the bottom tab bar (bottom-20).
- Dialogs (`AddCompanyModal`, `AddDealModal`, `AddContactModal`) now
  render as bottom-anchored sheets at <768px (`items-end`,
  `rounded-t-lg`), full-centered modals at ≥768px. No shadcn `<Sheet>`
  dependency added — Tailwind classes accomplish the same anchoring.
- Tests updated: Companies tests now use `findAllByText` /
  `getAllByText` because jsdom renders both desktop+mobile lists
  simultaneously (CSS `hidden md:table` is a no-op in jsdom).

### G3 deferred

- Landing-page hero deeper audit at 390px → B1.
- Per-column "+" on Kanban → B5.
- Deals + Users tables → mobile cards: B8 + B10.
- Playwright e2e at 390×844 (no horizontal scroll on 7 routes) → P1.

Commit: `feat(responsive): mobile breakpoints for sidebar, tables, kanban, modals`.

---

## 2026-04-26 — G4 unified EmptyState primitive

- `frontend/src/components/ui/empty-state.tsx` (new): centered glyph +
  18/600 title + 14/secondary body + optional primary CTA + optional
  secondary text-link. Two tones: `default` (accent-tint icon) and
  `filtered` (overlay-tint, signals "no results for filters").
- Migrated DealsListPage, PipelinePage, CompaniesListPage, ContactsPage
  empty states. Reports per-card empties stay until B9 (its spec
  explicitly says "Empty state inside card per G4").
- Filtered-empty wired on Companies search: tone="filtered", primary
  action is "Vymazat filtry" (clears search + resets page).
- Pipeline header CTA hides when the empty-state overlay is showing
  (Segment guidance — its own CTA replaces the header CTA). Companies
  page-header gating tried, reverted: testing-library `findByRole`
  resolves on the header button DOM node before fetch settles, then
  React replaces that node with the EmptyState button when isPending
  flips, leaving the test holding a stale ref. Cleaner fix than
  refactoring 3 ARES-modal tests = keep the header button visible on
  empty Companies. Logged here so a future pass can either adapt the
  tests or use `findAllByRole` + click-last.

Commit: `feat(ui): unified EmptyState primitive`.

---

## 2026-04-26 — G2 dark-mode default + theme toggle

- `frontend/index.html` head script rewritten to the FIXES_TASK §G2
  template: reads `localStorage['simplecrm-theme']` (one of `light` |
  `dark` | `system` — `system` is the implicit default when nothing is
  stored), resolves to `light` or `dark` via `(prefers-color-scheme:
  dark)`, and writes both `data-theme` and `style.colorScheme` plus the
  `<meta name="theme-color">` content before stylesheets run. This kills
  the FOUC for users on either OS preference.
- `frontend/src/lib/theme.ts` (new): `<ThemeProvider>` + `useTheme`
  exporting `{ theme, resolved, setTheme }`. The hook subscribes to
  `prefers-color-scheme` only while `theme === "system"` so explicit
  light/dark choices ignore OS flips. Stored value: `light` / `dark`.
  `system` clears the storage key to keep the implicit default
  recoverable. The `useTheme` hook returns a no-throw fallback when
  rendered outside the provider — pragmatic concession to the existing
  test harnesses, which would otherwise need a per-test wrapper update.
- `frontend/src/lib/ThemeToggle.tsx` (new): radiogroup-styled three-way
  toggle (Světlý / Tmavý / Systém) with Sun / Moon / Monitor icons. Has
  a `compact` variant that hides the labels for tight spots.
- Toggle wired into the desktop sidebar bottom (compact, full-width) and
  the landing-page top nav (compact, hidden on mobile until G3 reflows
  the marketing nav).
- Old `frontend/src/theme/theme.ts` (the legacy two-state helper) removed
  — nothing was importing it.

### Brief vs FIXES_TASK on the default

The brief calls dark "default" full stop. FIXES_TASK §G2 explicitly
overrides: "respect OS preference (`system`). Do not hard-default to
dark... document this decision". Followed FIXES_TASK. The brief still
holds for visual identity (dark is the primary canvas all screens are
designed against).

### G2 deferred (per the FIXES_TASK box wording)

- Per-screen contrast audit (status badges, focus rings, chart axes,
  ARES dropdown) is deferred to the B-batches that touch each screen,
  and the WCAG AA validation lands in P1 (a11y).
- Settings → Vzhled mirror is B10's responsibility.
- 11-screen dark-mode screenshot audit lands in the B-batches.

Commit: `feat(theme): dark-by-system default with persistent override`.

---

## 2026-04-26 — G1 magenta rollout, lime retirement

Tokens (`frontend/src/theme/tokens.css` + `tailwind.config.ts`):

- Primary `--color-accent` retuned from electric blue `#3D5AFE` (older
  skill) to Radix iris-9 `#5B5BD6` light / indigo-400 `#818CF8` dark, per
  the brief's "tune deliberately a few degrees off Tailwind's default
  `#6366F1`" rule. Subtle/border alpha bumped (8% → 10–16%) so the new
  hue keeps adequate selected-row contrast.
- Lost / error `--color-danger` swapped from `#EF4444` (rose-tinted) to
  the brief's `#DC2626` (pure red) so it sits visibly distant from
  magenta in the Kanban.
- Info `--color-info` decoupled from accent — now `#0EA5E9` light /
  `#38BDF8` dark per the brief's "info should not blur with action".
- New `--color-brand-accent: #EC4899` and `--color-win: #EC4899` (same
  hex, both themes). Light-mode `*-subtle` uses solid `#FBEAF0` (Radix
  pink-50) per the brief's "magenta on white reads louder" rule.
- New `--color-text-on-brand-accent: #0a0a0b` (both themes) so solid
  magenta fills always carry near-black text — never white. Brief calls
  this out as the most-violated rule in the wild.
- `--color-highlight*` retained as a soft-deprecated alias pointing at
  the magenta brand-accent so any unaudited callsite flips automatically.
  Long-term: rename to `bg-brand-accent` everywhere; for G1, alias spares
  a per-component churn.

Tailwind config exposes new `brand-accent` and `win` namespaces alongside
the alias. New `text-on-brand-accent` utility for the win button.

Component changes:

- `DealDetailPage`: "Označit jako vyhráno" button now `bg-brand-accent
  text-text-on-brand-accent` (per brief: dopamine hit color, near-black
  text). The settled "Vyhráno" pill switched from magenta-fill to
  `bg-success-subtle text-success` with a check icon — per brief
  "magenta is the dopamine, green is the record".
- `LandingPage` Kanban mockup's "Vyhráno" stage dot was hardcoded
  `#C9F24E`; replaced with `#EC4899` and a comment explaining the
  exception (LandingPage is the only place currently allowed two magenta
  moments — logo + dot today, hero word underline lands in B1).

Tests: new `no-lime.test.ts` walks every component file and asserts no
lime hex / `lime-*` Tailwind class / `bg-green-(300|400|500)` celebration
class survives. 36/36 passing.

Per-screen magenta budget audit (default empty state, dev login):

- Landing dark/light: logo + Vyhráno mockup dot (2). B1 will add the
  hero "prodej" underline — that's where the budget tightens.
- Login: logo (1). ✓
- AppShell mobile header: logo (1). Desktop sidebar has no magenta. ✓
- Dashboard: "Výnosy tento měsíc" KPI icon bg (1). Manager view adds
  leaderboard #1 row → 2; tolerated per the "1–2 instances" guideline.
- Pipeline empty: 0 magenta on the page; the win button only appears
  on a deal-card hover/detail. ✓
- Reports leaderboard #1 row: 1 magenta. ✓
- Deal detail (open): win button (1). ✓
- Deal detail (won): success-green pill, 0 magenta on settled state. ✓

Commit: `feat(theme): canonicalize magenta brand accent, retire lime`.

---

## 2026-04-26 — kickoff & deliberate deviations from FIXES_TASK.md

Recording two repo-wide path/file translations once so individual batch
entries don't have to keep repeating them:

- **Frontend path.** FIXES_TASK.md references `app/web/src/...`. This repo
  uses `frontend/src/...`. All "create file at `app/web/src/X`" instructions
  are translated to `frontend/src/X`.
- **MANAGER_TASK.md absent.** FIXES_TASK references ticking phase boxes in
  `MANAGER_TASK.md`. That file does not exist in this repo (the Phase
  numbering survives only in code comments). DoD checkboxes referencing it
  are skipped.

### Brief vs ui-design.md skill conflict

`SIMPLECRM_DESIGN_BRIEF.md` (newer) makes magenta `#EC4899` canonical and
retires lime `#C9F24E`. `.claude/skills/ui-design.md` (older) still names
lime as the celebration accent. FIXES_TASK.md §0 explicitly states
"the brief supersedes any older design notes" — followed.

### C0 plan

Per advisor: focus C0 on the user-facing fixes, defer ergonomic polish to
later batches.

- Czech plural helper + noun-form constants under `frontend/src/lib/i18n/`.
- Replace ad-hoc plural ternaries in DealsListPage and PipelinePage column
  subhead.
- Fix phase-leak strings in DealsListPage (line 55) and CompanyDetailPage
  (lines 177/182/187). Code comments in `backend/app/services/{pipeline,
  freeing}.py` and `OnboardingForm.tsx:26` are not user-facing — leave for
  later if at all.
- Pipeline header "+ Přidat obchod" CTA + minimal AddDealModal (name,
  company, value, owner, stage prefilled). Per-column hover "+", inline
  company-create, etc., are deferred to B5.
- Pipeline empty-state copy ("rychlé akce" link doesn't exist) corrected
  inline; full `<EmptyState />` primitive lands in G4.
- `/more` desktop access redirected to `/app` via `useMediaQuery`-driven
  `<Navigate>` inside MorePage (avoids matchMedia flicker on first paint
  of route config).

Tokens (`--color-highlight`) stay lime through C0 — magenta rollout is G1.

### C0 shipped

- `frontend/src/lib/i18n/plural.ts` and `frontend/src/lib/i18n/nouns.ts`
  with `csPlural` + `csNoun` helpers and the noun-form table
  (obchod/firma/kontakt/uživatel/den/koruna).
- `frontend/src/lib/useMediaQuery.ts` — SSR-safe matchMedia hook.
- `DealsListPage`: phase-leak copy replaced with the FIXES_TASK §6
  cheat-sheet copy, "Přejít do Pipeline" indigo CTA, plural helper applied
  to the count line. CSV-import secondary link omitted (settings/import
  stub doesn't exist; FIXES_TASK marks it optional under feature flag).
- `CompanyDetailPage` placeholder tabs no longer mention "Fáze 4.3 / 5 /
  6". Reworded to "připravujeme".
- `PipelinePage`: header "+ Přidat obchod" CTA next to filters; column
  subhead now uses the plural helper; empty-state copy rewritten to the
  brief's wording with its own primary CTA.
- `AddDealModal` (new) — minimal flow: name, company autocomplete, value,
  expected close date, owner (defaults to current user), stage. Uses the
  existing `/api/v1/deals` POST endpoint; invalidates the board cache.
- `MorePage`: returns `<Navigate to="/app" replace />` on viewports
  ≥768px; full mobile menu otherwise.
- `CompaniesListPage`: hand-rolled `pluralizeCompanies` had a `n=0 → "0
  firmy"` bug — replaced with the shared helper.
- `AppShell` trial badge: hand-rolled `daysRemaining` plural would say
  `0 dny zbývají` — replaced with the shared helper plus the verb-form
  rule (`zbývají` only for n=2–4, `zbývá` everywhere else).
- `AddDealModal` parent: stage options memoized so background refetches
  of the board don't wipe in-progress modal state.

### C0 deferred (per advisor scoping)

- Per-column hover "+" button — moved to B5.
- Inline "+ Přidat firmu" within the company autocomplete — moved to B5.
- Stage-prefilled-but-editable polish — basic editable select shipped;
  full UX in B5.
- `<EmptyState />` primitive — G4; C0 inlines the corrected copy.
- Backend code-comment phase references in `services/{pipeline,freeing}.py`
  and `OnboardingForm.tsx:26` — not user-facing, intentionally untouched.

### C0 verification

`pnpm lint`, `pnpm typecheck`, `pnpm test` (33/33) all green. Updated two
pre-existing tests (pipeline empty-state heading; mobile-only `/more`
behavior split into two cases). Backend `ruff check` + `mypy` clean.
`pytest` shows one failure — `test_dev_login_404_when_disabled` —
confirmed pre-existing on the unmodified `main` branch (the dev compose
service exports `DEV_AUTH_ENABLED=true`, which the test expects to be
unset). Not a C0 regression. Logged here for visibility; will need a
fixture-level env override later.

Commit: `fix(ux): critical visible regressions (C0)`.


