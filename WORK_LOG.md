# SimpleCRM polish & completion pass — work log

Per-batch entries for the work driven by `FIXES_TASK.md`. Newest at the top.

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


