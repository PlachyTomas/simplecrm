# SimpleCRM polish & completion pass — work log

Per-batch entries for the work driven by `FIXES_TASK.md`. Newest at the top.

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


