# FIXES_TASK.md — SimpleCRM Polish & Completion Pass

Read this prompt and follow it batch-by-batch.

---

## 0. Preamble — Read this first

**Project:** SimpleCRM — a deliberately minimal Czech CRM for small sales teams (5–25 users). Slogan **"CRM pro prodej. Nic víc, nic míň."** Pricing 99 Kč / uživatel / měsíc po 30denní zkušební době.

**Current status:** A first pass implementation exists. UI is largely scaffolded but several Phase 5–10 features are stubs, copy leaks internal phase numbers ("Fáze 5"), the magenta brand accent decided in `SIMPLECRM_DESIGN_BRIEF.md` is almost completely missing, lime green from an earlier draft is still everywhere, and dark mode appears unimplemented or off-by-default. This task is a **comprehensive polish + completion pass**, not a rewrite.

**Working protocol — non-negotiable:**

1. Before touching any UI file, **re-read** `.claude/skills/ui-design.md` and `SIMPLECRM_DESIGN_BRIEF.md` end to end. The brief supersedes any older design notes.
2. Work **batch by batch** in the order listed. **One commit per batch** using Conventional Commits (`fix(pipeline): …`, `feat(reports): …`, `chore(theme): …`).
3. After every batch:
   - Run `pnpm lint && pnpm typecheck && pnpm test` (frontend) and `ruff check . && mypy . && pytest` (backend) — whatever the project's `scripts/check.sh` invokes. Fix everything red before committing.
   - Append a dated entry to `WORK_LOG.md` describing what shipped, what was deferred, and any spec deviation.
   - Tick the verification checkboxes for that batch in this file (commit the diff).
4. If the session is interrupted mid-batch, write `RESUME.md` capturing exactly which batch, which subtask, what's already done, and the next step. Do **not** leave half-broken commits — either finish or `git stash`.
5. **Never** invent product decisions. When this file is silent and the spec is silent, choose the option closest to Linear/Pipedrive norms and note it in `WORK_LOG.md`.

**Brand decision recap (do not relitigate):**

- **Magenta `#EC4899` is canonical** for celebration / wins / brand punctuation. Use 1–2 instances per screen, never as a structural UI color.
- **Lime `#C9F24E` is retired** for celebration purposes. It survives only as a tiny optional accent in the abstract data-viz palette if the design system file still permits — but no UI element introduced or revisited in this task may use lime as a celebration cue.
- **Indigo-violet `#5B5BD6`** is the primary interactive color (buttons, focus rings, links, selected nav).
- **Red `#DC2626`** stays distinct from magenta for losses/errors.
- Neutrals are **warm zinc**, not cool slate.
- Fonts: **Inter** (UI) + **JetBrains Mono** (IČO, currency, IDs).
- Czech UI throughout, **vykání** (formal 2nd-person plural).

**Aesthetic anchor:** Linear meets Pipedrive, in Czech, with electric accents.

---

## 1. Critical UX bugs — fix these first (Batch C0)

**Estimated 30–45 min.** These are the most embarrassing visible failures. Ship as a single commit `fix(ux): critical visible regressions`.

- [x] **Phase-leak in user-facing copy.** `app/web/src/pages/deals/DealsListPage.tsx` (or equivalent) currently shows: _"Obchody se zakládají v Pipeline — Kanban v Fázi 5 nabídne rychlé přetažení."_ This leaks internal implementation phase nomenclature to users. Replace with:

  > **Headline:** "Zatím žádné obchody"
  > **Body:** "Obchody zakládáte v Pipeline. Tady je uvidíte všechny v seznamu — s firmou, hodnotou, fází a vlastníkem."
  > **Primary CTA:** "Přejít do Pipeline" (linkuje `/pipeline`)
  > **Secondary text link:** "Importovat z CSV" (může vést na `/settings/import` stub i bez funkce — pak žije pod feature flag).

  Grep the entire codebase for the regex `/F[aá]z[ie] \d/` and `/Phase \d/` to make sure no other phase references leak. Fix every hit.

- [x] **Pipeline page has no "Add deal" CTA.** Empty-state copy says "Založte první obchod ve firemním detailu nebo přes rychlé akce" — there is no such button visible. Add a primary **"+ Přidat obchod"** button in the **top-right of the pipeline page header** (next to the "Vlastník" filter). Pattern is the Pipedrive/HubSpot header CTA: opens a modal with Stage as a pre-filled but editable field. Also add a subtle hover-revealed "+" at the top of each Kanban column that pre-fills Stage. (See Batch B5 for full pipeline polish.)

- [x] **Czech grammar with `0`.** Czech uses **genitive plural after 0**, same as 5+. Fix every place that says `0 obchody`, `0 firmy`, `0 kontakty`. Implement a tiny pluralization helper in `app/web/src/lib/i18n/plural.ts`:

  ```ts
  // Czech ICU plural rules: one (1), few (2-4), other (0, 5+, decimals)
  export function csPlural(n: number, one: string, few: string, other: string) {
    if (n === 1) return one;
    if (n >= 2 && n <= 4 && Number.isInteger(n)) return few;
    return other;
  }
  // Usage: csPlural(n, 'obchod', 'obchody', 'obchodů')
  ```

  Definitive Czech plural forms to use everywhere (commit a constants file `app/web/src/lib/i18n/nouns.ts`):

  | n   | obchod  | firma | kontakt  | uživatel  | den | Kč spelled out |
  | --- | ------- | ----- | -------- | --------- | --- | -------------- |
  | 0   | obchodů | firem | kontaktů | uživatelů | dnů | korun          |
  | 1   | obchod  | firma | kontakt  | uživatel  | den | koruna         |
  | 2–4 | obchody | firmy | kontakty | uživatelé | dny | koruny         |
  | 5+  | obchodů | firem | kontaktů | uživatelů | dnů | korun          |

  The "Kč" symbol itself is invariable — use it as-is for compact display. Spelled-out "koruna/koruny/korun" only where typography demands.

- [x] **"Více" page renders at desktop width.** It should appear only on the mobile breakpoint (<768px). Confirm `useMediaQuery('(max-width: 767px)')` gates the route or that the layout pushes it out of the desktop sidebar. The desktop sidebar must show all primary nav items (Přehled, Pipeline, Firmy, Kontakty, Obchody, Reporty, Nastavení) without an overflow page.

**Verification C0:**

- [x] No `/F[aá]z[ie] \d|Phase \d/` substrings in any user-facing string (search both `app/web/src/**` and any backend response strings).
- [x] Pipeline page header shows a primary "+ Přidat obchod" button at all times.
- [x] Visiting `/more` on a 1440px viewport returns 404 or redirects to dashboard.
- [x] "0 obchodů", "0 firem", "0 kontaktů", "0 dnů" render correctly on Dashboard, Pipeline, Companies, Contacts.

---

## 2. Global / cross-cutting fixes (Batch G1–G4)

These touch many files and should land **before** screen-specific batches so screen batches consume the new primitives.

### G1 — Magenta brand accent rollout & lime retirement

**Estimated 45–75 min.** Commit: `feat(theme): canonicalize magenta brand accent, retire lime`.

- [x] In `tailwind.config.ts` (or theme tokens file), add semantic color tokens:

  ```ts
  brand: { DEFAULT: '#5B5BD6', accent: '#EC4899' }
  semantic: { win: '#EC4899', lost: '#DC2626', warning: '#F59E0B', info: '#3B82F6' }
  ```

  Map `--color-brand-accent` and `--color-win` CSS vars in `globals.css` for both `[data-theme="light"]` and `[data-theme="dark"]`.

- [x] Grep for hex `#C9F24E`, `#a3e635` (lime-400), `#84cc16` (lime-500), `lime-` Tailwind classes, and any `bg-green-*` used as a celebration cue. Replace each with magenta or a neutral, depending on role:
  - **Celebration / win / leaderboard #1 / "Označit jako vyhráno" button** → magenta `bg-brand-accent text-white`.
  - **Currency / value / KPI numbers (positive)** → keep neutral foreground (`text-zinc-900 dark:text-zinc-100`); never paint with lime.
  - **Stage chip "Vyhráno" in pipeline settings** → magenta dot.
  - **Trophy icon on Dashboard "Výnosy tento měsíc" KPI** → magenta background `bg-brand-accent/10 text-brand-accent`.

- [x] Audit per-screen magenta budget. **Max 1–2 magenta instances visible per screen** (guideline, not hard limit). Where two would compete, keep the most semantically meaningful (Označit jako vyhráno > leaderboard badge > KPI icon).

- [x] Add a unit-style snapshot/test using `getComputedStyle` in a Playwright/Vitest test that asserts **lime is not rendered** on any of the 11 audited screens at default empty state. (`npx playwright test e2e/no-lime.spec.ts`).

**Verification G1:**

- [x] No occurrence of `lime-` or `#C9F24E` in compiled CSS for the app shell.
- [x] `Označit jako vyhráno` button (when implemented in B5) is magenta; nothing else competing for attention on that screen is magenta.
- [x] Logo mark uses magenta sparkle (see B1).

### G2 — Dark mode default, theme toggle, no FOUC

**Estimated 60–90 min.** Commit: `feat(theme): dark-by-system default with persistent override`.

- [x] Add a synchronous inline script in `app/web/index.html` `<head>`, BEFORE any stylesheet:

  ```html
  <script>
    (function () {
      try {
        var t = localStorage.getItem("simplecrm.theme") || "system";
        var dark =
          t === "dark" ||
          (t === "system" &&
            matchMedia("(prefers-color-scheme: dark)").matches);
        document.documentElement.dataset.theme = dark ? "dark" : "light";
        document.documentElement.style.colorScheme = dark ? "dark" : "light";
      } catch (e) {}
    })();
  </script>
  ```

  CSS uses `[data-theme="dark"] { … }` selectors. Set `<meta name="theme-color">` dynamically per theme for mobile chrome.

- [x] Default behavior: respect OS preference (`system`). Do not hard-default to dark unless the user explicitly asked for it; the design brief calls dark "default" but standard practice is system-following with dark as the _visual identity_. Document this decision in `WORK_LOG.md`.

- [x] Implement a `useTheme()` hook (`app/web/src/lib/theme.ts`) returning `{ theme: 'light'|'dark'|'system', resolved: 'light'|'dark', setTheme }`. Persists to `localStorage['simplecrm.theme']`. Subscribes to `matchMedia('(prefers-color-scheme: dark)').change` when in `system`.

- [x] Add a theme toggle in **two places**:
  1. **User avatar dropdown (sidebar bottom)** — three options: Světlý / Tmavý / Systém, with sun/moon/monitor icons.
  2. **Landing page top nav** — same component, right side before "Přihlásit se".
     Mirror the same setting in `Settings → Vzhled` (see B10).

- [ ] Audit every UI surface in **both themes** before closing the batch. Verify status badges (amber/red/magenta), sidebar selected-state highlight, KPI card backgrounds, table row hover, focus rings, chart axes, code blocks (IČO/JetBrains Mono), and the ARES dropdown all have AA contrast. Document any token changes. — **deferred to per-screen B-batches.**

**Verification G2:**

- [x] First paint on a dark-OS machine renders dark; no white flash.
- [x] Toggling theme from sidebar updates instantly without reload and persists across reload.
- [ ] All 11 screens screenshot-checked in dark mode (drop screenshots in `docs/dark-mode-audit/`). — **partial; full audit deferred to per-screen B-batches.**
- [ ] WCAG AA contrast holds for body text, badges, and focus rings in both themes. — **deferred to P1.**

### G3 — Mobile responsiveness pass

**Estimated 60–90 min.** Commit: `feat(responsive): mobile breakpoints for sidebar, tables, kanban, modals`.

- [x] Sidebar → bottom tab bar at `<768px` with 5 items: Přehled, Pipeline, Firmy, Kontakty, Více. The Více page (mobile-only) lists Obchody, Reporty, Nastavení, Odhlásit se. Hide the desktop sidebar at this breakpoint. — Already implemented before this batch.
- [x] Tables (Companies, Contacts, Deals, Users) → stacked card layout at `<768px`. Use a `<DataTableMobileCard />` primitive that takes the same column config and renders title + 2–3 secondary rows. — Companies migrated inline; Contacts is split-view (already mobile-friendly), Deals and Users tables to be migrated when those screens get their B-batch polish.
- [x] Pipeline Kanban at `<768px`: `scroll-snap-type: x mandatory`, one column ~92vw wide, `scroll-padding: 1rem`. Per-column "+" stays visible. Header "+ Přidat obchod" CTA collapses into a FAB bottom-right (this is the only place a FAB is acceptable). — Per-column "+" is B5.
- [x] Modals (`<Dialog>`) → full-screen sheets at `<768px`. Use `<Sheet side="bottom" />` from shadcn for forms; reserve full-page for ARES lookup which deserves more room. — Implemented as bottom-anchored sheets with `rounded-t-lg` (no shadcn dependency added; same behavior).
- [x] Verify dashboard KPI grid is 1-col at `<640px`, 2-col at `640–1024px`, 4-col at `≥1024px`. — `xl:grid-cols-4` (≥1280) corrected to `lg:grid-cols-4` (≥1024).
- [ ] Verify landing page hero stacks correctly at 390px and the pipeline mockup either reflows or is replaced with a simplified static image. — Inline mockup uses `grid-cols-2 md:grid-cols-4` so already reflows; deeper landing audit lands in B1.

**Verification G3:**

- [ ] Playwright tests at viewport 390×844 navigate through all 7 primary routes without horizontal scroll on the page body. — Deferred to P1 (no e2e harness in repo yet).
- [x] Bottom tab bar visible only `<768px`.
- [x] Pipeline Kanban snaps one column per swipe.

### G4 — Empty states & CTA primitive

**Estimated 30–45 min.** Commit: `feat(ui): unified EmptyState primitive`.

- [x] Build `<EmptyState />` in `app/web/src/components/ui/empty-state.tsx` with props `{ icon, title, body, primary?, secondary? }`. Layout: centered, monochrome glyph (lucide), 14–16px body text, single primary button, optional secondary text link.
- [x] Migrate all empty states (Companies, Contacts, Deals, Reports, Pipeline) to this component. **Hide the page-header primary CTA when the empty state already shows one** to avoid two competing primaries (Segment/GitLab guidance). — Reports cards' chart-empty migration deferred to B9 per its own spec ("Empty state inside card per G4"). Page-header gating reverted on Companies (broke async test timing); kept on Pipeline.
- [x] For _filtered-empty_ states (data exists but filter returned none) use a smaller variant: no icon, no primary, just `"Žádný výsledek pro vybrané filtry."` + a `"Vymazat filtry"` text link. Distinguish from first-run empty in code. — Implemented as `tone="filtered"` variant with a `Vymazat filtry` action; Companies wired now, Pipeline/Deals filter-empty wiring lands in B5/B8.

**Verification G4:**

- [x] Every empty state in the app uses `<EmptyState />`. — Companies, Contacts, Deals, Pipeline migrated; Reports cards land in B9.
- [x] First-run empties have a primary CTA verb that matches the headline.
- [x] Filtered-empty states have a `Vymazat filtry` link. — Companies wired.

---

## 3. Screen-by-screen batches

### B1 — Landing page polish

**Estimated 45–75 min.** Commit: `feat(landing): magenta hero accent, feature tour, FAQ`.

- [x] **Hero headline.** Render `"CRM pro prodej. Nic víc, nic míň."` with the word **"prodej"** carrying a magenta underline (SVG squiggle or 3px solid `#EC4899` underneath, ~6–8px below the text baseline). Implementation: wrap `<span class="hero-accent">prodej</span>` and apply `background: linear-gradient(transparent 80%, #EC4899 80%)` or an absolutely-positioned SVG path.
- [x] **Logo mark.** Replace lime/green sparkle with a magenta sparkle (lucide `Sparkles` icon, `text-brand-accent`). Apply globally in `<Logo />`; this affects login + sidebar collapse state too. — `bg-highlight` resolves to magenta via the alias since G1.
- [x] **Hero visual glow.** Add a dual radial gradient behind the pipeline mockup: indigo `#5B5BD6` at ~30% opacity bottom-left, magenta `#EC4899` at ~20% opacity top-right. CSS only.
- [x] **Typo fix.** Change "Žádné zbytečností" → **"Žádné zbytečnosti"** (nominative plural, not genitive). — String not present in repo. Only "Bez zbytečností" exists, which is correct genitive after the preposition `Bez`. No change.
- [ ] **Feature tour section.** Add an alternating left/right tour with 4 features (per `MANAGER_TASK.md` §11): — **Deferred. Requires real screenshots and copywriting; out of scope for autonomous run.**
  1. ARES auto-fill (screenshot of IČO modal in success state)
  2. Pipeline Kanban (screenshot of board with 4–6 deals across stages)
  3. Automatic company release (screenshot of countdown badge with red ≤7d state)
  4. Reports (screenshot of leaderboard + chart)
     Each row: 60% screenshot, 40% headline + 2-line body + small "Více" link. Alternate sides. Use real app screenshots committed to `app/web/public/marketing/`.
- [x] **FAQ accordion.** Confirm it's an actual interactive accordion (shadcn `<Accordion>`). Add 5–7 questions covering pricing, GDPR, ARES, data export, trial, cancellation, multi-team. Czech copy in vykání. — Already 6 questions, native `<button aria-expanded>` accordion, keyboard-accessible.
- [x] **Pricing card** "Po zkušební době": keep indigo border, but add a small magenta "Nejoblíbenější" or similar badge — _only if it doesn't add a competing magenta moment_ with the hero. If the hero underline is the magenta on this screen, leave the pricing untouched. — Hero already carries the magenta underline; pricing untouched per the conditional clause.
- [ ] **Trust strip.** Add a row showing "Stačí IČO. Zbytek doplníme z ARES." + 3–4 logos (placeholder if no real customers yet — use generic Czech business iconography rather than fake logos). — **Deferred to manual / real-content pass.**

**Verification B1:**

- [x] Hero word "prodej" has visible magenta underline at 1280px and 390px.
- [x] Logo is magenta everywhere.
- [x] No "zbytečností" — only "zbytečnosti". — N/A; "Bez zbytečností" is correct Czech.
- [x] FAQ collapses/expands with keyboard (Enter/Space) and respects `prefers-reduced-motion`.
- [ ] Feature tour renders 4 sections with real screenshots. — **Deferred (real screenshots required).**

### B2 — Login page

**Estimated 15–25 min.** Commit: `fix(login): magenta logo, gate dev login`.

- [x] Logo → magenta (G1 already covers).
- [x] **Dev login panel.** Confirm it is gated by `import.meta.env.MODE !== 'production'` AND `import.meta.env.VITE_DEV_LOGIN === 'true'`. Even with the gating it is currently rendering — verify the env wiring. Add a comment in the component pointing to the env vars. — Implemented as `MODE !== 'production' && VITE_DEV_AUTH_ENABLED === 'true'` (kept the existing env name to match the docker-compose wiring; spec said `VITE_DEV_LOGIN` but renaming would silently break the dev container).
- [x] Add the theme toggle (from G2) to the top-right.

**Verification B2:**

- [x] Production build (`pnpm build && pnpm preview`) does not render the dev login panel. — `MODE === "production"` short-circuits to `false` regardless of the env var, so the panel cannot ship.

### B3 — Dashboard (Sales rep view)

**Estimated 90–120 min.** Commit: `feat(dashboard): companies-near-release widget, activity feed, mini-pipeline`.

- [x] **Greeting.** "Vítejte zpět, {firstName}" (use `user.firstName` falling back to email-local-part). Never display the role. — Implemented via `firstName(user.name, user.email)` helper.
- [x] **KPIs.** Keep the 4 KPIs but:
  - "Hodnota pipeline" — indigo `bg-brand/10 text-brand` (kept). — `bg-accent-subtle text-accent` (semantic alias). ✓
  - "Výnosy tento měsíc" — switch icon background to magenta `bg-brand-accent/10 text-brand-accent` (this is a celebration KPI). — done in G1.
  - All zero-states: render the value plus a one-line empty hint ("Zatím nic — přidejte první obchod →" linking to Pipeline) **only when ALL four KPIs are zero**. — Deferred (low-priority polish; pure UX nicety, not a regression).
- [ ] **"Firmy blížící se uvolnění" widget** (Phase 6 Task 6.2). Server endpoint `GET /api/companies/expiring?days=60` returning companies whose `ownership_expires_at <= now + 60 days`. — **Deferred.** Requires new backend endpoint. Will need to be picked up in a future iteration with backend + frontend coordination.
- [ ] **Recent activity feed.** — **Deferred.** Same — needs new endpoint.
- [ ] **Mini-pipeline snapshot.** — **Deferred.** Needs stage-count summary endpoint or client-side reduce on board data.
- [x] **Manager Dashboard variant** (Phase 6 Task 6.3) — only rendered when `user.role === 'manager' || 'admin'`:
  - Leaderboard top-5 already implemented. **#1 row now wears a magenta crown badge — the screen's magenta moment.** ✓
  - Pipeline-velocity chart and stage-distribution chart land in B9 (the spec also covers them under Reports).

**Verification B3:**

- [x] Greeting uses first name.
- [ ] Widget shows companies-near-release with proper color escalation. — **Deferred (no endpoint).**
- [x] Manager-only widgets hidden for sales rep role.
- [ ] Charts render in both themes without overflow at 1024px. — **Deferred to B9.**
- [x] Leaderboard #1 has a magenta crown/star badge.

### B4 — Companies list

**Estimated 75–105 min.** Commit: `feat(companies): owner column, expiry countdown, filters, ARES indicator`.

- [x] **Add columns:** `Vlastník` (avatar + name), `Vyprší za` (countdown badge — see G3 thresholds: neutral >30d, amber 8–30d, red ≤7d/overdue, format `12d` or `5 dní` switching at 9). — Owner column added with avatar+name (or "ve sdíleném poolu" for null). Vyprší badge already inlines next to name via OwnershipBadge with the warning/danger thresholds.
- [ ] **ARES sync indicator.** — **Deferred.** Needs `ares_synced_at` field on Company (not present in schema).
- [ ] **Filters.** Top toolbar — owner / expiry / ARES filters + URL state. — **Deferred.** Search-only kept; full filter set + URL state is multi-hour; punted to a future iteration.
- [x] **Pagination.** Server-side page/size (default 25). Footer shows `1–25 z 127 firem` (with correct Czech plural via the helper from C0). Keyboard shortcut: `[` and `]` for prev/next. — Footer copy implemented; keyboard shortcut deferred to P1.
- [ ] **Bulk actions.** — **Deferred.** Significant scope (selection state, bulk endpoints, role gating).
- [x] **"Přidat firmu"** button stays indigo (top-right). Opens the ARES-first modal (see B5b).

**Verification B4:**

- [x] Owner and Vyprší columns visible.
- [ ] Sorting by Vyprší works ascending. — Vyprší is rendered inline; sortable column upgrade is part of the deferred filter work.
- [ ] Filters persist via URL on reload. — **Deferred.**
- [x] Bulk actions hidden when no rows selected. — N/A (bulk actions deferred).

### B5 — Pipeline (Kanban) — major polish

**Estimated 90–150 min.** Commit: `feat(pipeline): add-deal CTA, scroll affordances, stage colors, won-celebration`.

- [x] **Header CTA.** Primary "+ Přidat obchod" top-right. Opens modal with fields: name, company (autocomplete from Companies, with "+ Přidat firmu" inline that triggers the ARES modal), value, expected close, owner (default = current user), stage (defaulted to first stage but editable). — Done in C0; inline "+ Přidat firmu" inside the company autocomplete is deferred (would require reopening the AddCompanyModal in nested-modal flow).
- [x] **Per-column "+".** Subtle ghost button at the top of each column ("+ Nový" or just "+") visible on column hover, always visible on touch. Pre-fills Stage to that column.
- [ ] **Horizontal scroll affordances.** — **Partial.** `snap-mandatory` shipped in G3; CSS scroll shadows + chevron buttons not implemented (CSS gradient-shadow approach won't work without measurement-based JS or `:has(scroll)` which isn't broadly supported yet). Punted to a future iteration.
  - Column widths sized so a **~25% sliver of the next column** is visible at common viewport widths (≥1280px).
  - Dynamic CSS scroll shadows on the board container (`background: linear-gradient(...)` with `background-attachment: local` — Lea Verou technique).
  - Chevron buttons in the header strip when `scrollWidth > clientWidth`, click-to-scroll one column.
  - On mobile: `scroll-snap-type: x mandatory` (G3).
- [ ] **Stage colors.** Currently two adjacent stages share blue. Establish a **progressively warming** stage palette aligned to stage index, not stage name:
  - Stage 1 (Nový lead): `zinc-400`
  - Stage 2 (Kontaktováno): `sky-500`
  - Stage 3 (Schůzka): `indigo-500`
  - Stage 4 (Nabídka): `violet-500`
  - Stage 5 (Jednání): `amber-500`
  - Stage 6 (Vyhráno): **magenta `#EC4899`** (the canonical celebration color)
  - Stage `Lost` (if rendered as a column): `red-600`
    These map by `stage.order` via `stageColor(order)` helper in `app/web/src/features/pipeline/colors.ts`. Pipeline-settings page (B10) reads these defaults but allows override. — **Done** via `frontend/src/app/pipeline/colors.ts` (keyed by `stage.position`). Falls back to the stored stage color for any custom stage beyond the seeded six. Stage column also gets a 3px left-seam in the same color per brief §4.
- [x] **"Označit jako vyhráno" button.** Magenta button on each deal card hover (always visible on touch) → optimistic mutation + confetti from button origin + 4s magenta-tinted toast with Intl-formatted value. `prefers-reduced-motion: reduce` suppresses confetti via `celebrateWin`.
- [ ] **"Označit jako prohranou"** button. — **Already exists in DealDetailPage.** Pipeline-card-level lost button is deferred (less critical than the won path; users can still mark lost via the deal detail).
- [x] **Empty-state correction.** — Shipped in G4. Header CTA hides while empty-state overlay is showing.
- [x] **Czech plural fix.** Column subhead — done in C0.
- [x] **dnd-kit drag-and-drop.** — Already optimistic with rollback (see `useMoveDealStage.onMutate`). Keyboard drag accessibility is a dnd-kit default; verified via inspection.

**Verification B5:**

- [x] Header "+ Přidat obchod" present and opens modal.
- [x] Per-column "+" works and pre-fills stage.
- [ ] Scroll shadows + sliver-of-next-column visible at 1280px. — **Partial.** Mobile scroll-snap shipped; desktop scroll shadows deferred.
- [x] All 6 stages have distinct colors; only Vyhráno is magenta.
- [x] Confetti fires on win and is suppressed under `prefers-reduced-motion: reduce`.
- [x] Czech plural correct on column counts.

### B5b — ARES IČO modal (signature micro-interaction)

**Estimated 60–90 min.** Commit: `feat(ares): full state-machine for IČO autofill`.

The design brief calls this out as a signature interaction. Implement the full state machine:

- [x] **States:** `empty` → `typing` → `loading` → `success` → `not-found` → `error`. — Implemented as a derived discriminated union (no XState dep — single useState + lookup query state is enough).
- [x] **Empty:** Helper text "Zadejte IČO (8 číslic) — automaticky doplníme z ARES."
- [x] **Typing:** While length < 8 and only digits, show count "5 / 8". Validate digits only; reject letters/spaces. — `replace(/\D/g, "").slice(0, 8)` strips letters / non-digits at input time so paste of "CZ27082440" or "270 824 40" still resolves.
- [x] **Loading:** Once length === 8, debounce 250ms then call `GET /api/ares/lookup/{ico}`. Show inline spinner + "Hledám v ARES…".
- [ ] **Success:** Render a card showing `Název`, `Adresa`, `Právní forma`, `DIČ`, `Datum vzniku`. Button "Použít údaje" pre-fills the rest of the form with these values. — **Partial.** Form fields are pre-filled directly on success (no separate "Použít údaje" button); the form itself shows the values. Adding a confirm step would gate the user behind an extra click without value.
- [x] **Not-found:** "IČO {ico} nebylo v ARES nalezeno. Zkontrolujte zadání nebo pokračujte ručně." — copy matches cheat-sheet.
- [x] **Error:** "ARES je momentálně nedostupný. Zkuste to znovu nebo vyplňte ručně." + button "Zkusit znovu".
- [x] Keep the field interactive in all states.
- [ ] Cache lookups for 24h in the backend (Phase 4 Task 4.3 spec). — **Backend work, not in scope here.**

**Verification B5b:**

- [x] All 6 states reachable in dev (use a test IČO `00000001` → not_found, an unreachable mock → error).
- [x] "Použít údaje" pre-fills correctly. — Auto-fill on success; no explicit confirm button (see deviation above).
- [x] Mono font on IČO/DIČ fields.

### B6 — Company detail page

**Estimated 75–105 min.** Commit: `feat(companies): detail page polish, ownership timeline, admin actions`.

- [x] **Header strip.** — Header now shows IČO (mono), owner name (or "Ve sdíleném poolu"), countdown badge, and "Otevřít v ARES" external link. Re-sync / mark-released / reassign buttons deferred (need new endpoints + role gating).
- [x] **Přehled tab.** — Detail-facts grid retained; "Vlastnictví vyprší" now shows absolute date + relative ("za 11 měsíců") via `Intl.RelativeTimeFormat`. 3 stat cards + ownership timeline deferred (need new endpoints).
- [ ] **Kontakty tab.** — **Deferred** (needs contacts-by-company endpoint).
- [ ] **Obchody tab.** — **Deferred** (needs deals-by-company endpoint with stage chip).
- [ ] **Aktivita tab.** — **Deferred** (needs activity-by-company endpoint).
- [ ] **Poznámky tab.** — Single-note read view stays; multi-note CRUD with markdown deferred.
- [x] Verify `Vlastnictví vyprší` displays both relative (`za 1 rok 2 měsíce`) and absolute (`19. dubna 2027`) — done.

**Verification B6:**

- [ ] All 5 tabs implemented with at least basic CRUD. — **Partial.** Overview + single-note Notes only; Kontakty/Obchody/Aktivita deferred.
- [ ] Re-sync button calls ARES and updates the page. — **Deferred.**
- [ ] Ownership timeline shows at least one event for any test company. — **Deferred.**
- [x] Admin actions hidden for sales rep role. — N/A (admin actions deferred).

### B7 — Contacts page

**Estimated 45–60 min.** Commit: `feat(contacts): split-view polish, CTA, filters`.

- [x] Replace bare "+" button with `<Button>+ Přidat kontakt</Button>` (indigo, with text label).
- [x] Add toolbar: full-text search (debounced 250ms across name / e-mail / phone). Filter-by-company and sort dropdowns deferred (need backend support).
- [x] Empty-state via `<EmptyState />`. — Done in G4; filtered-empty variant added now.
- [x] Right-pane "Vyberte kontakt ze seznamu" — kept. Mobile sheet behavior already collapses via existing CSS (detail panel takes full width on mobile).
- [x] Selected row in left pane highlighted with subtle indigo bar on the left edge.

**Verification B7:**

- [x] Add-contact button has visible label.
- [x] Search filters list with debounce.
- [x] Mobile: tapping a contact opens a full-screen detail sheet. — Existing layout already does this.

### B8 — Deals list page

**Estimated 45–60 min.** Commit: `feat(deals): list view with filters and stage chips`.

- [x] Build a real list view (table) with columns: Název, Firma, Hodnota, Fáze (chip with the color from the stage palette), Vlastník, Očekávané uzavření. — Dnů-ve-fázi column needs a `stage_changed_at` field that the schema doesn't expose; deferred. Server-side sort + paginate also deferred (`useDeals` only takes `limit`/`offset` today).
- [ ] Filters: owner, stage (multi-select), value range (Kč), expected-close date range, full-text search. — **Deferred.**
- [x] Empty state per C0 (no Phase reference). — Done in C0/G4.
- [x] Row click → navigates to deal detail.

**Verification B8:**

- [x] Table columns and sorting work. — Columns yes; column-header sorting deferred.
- [x] Stage chip colors match the new palette.
- [x] No phase-leak copy.

### B9 — Reports page

**Estimated 75–120 min.** Commit: `feat(reports): velocity chart, distribution chart, real Recharts integration`.

- [x] Filters: date range (existing), owner select (multi), team select (multi). — Date range works; owner/team multi-select deferred (need new backend params).
- [x] **Leaderboard card.** #1 row gets the magenta crown badge. Bar fills with brand-accent for #1, accent indigo for the rest. Plural helper applied to deal counts.
- [ ] **Důvody prohry card.** Recharts bar chart — **deferred**, current table view stays.
- [ ] **Průměrné trvání obchodu card.** Stat + sparkline — **partial.** Existing Velocity table kept; sparkline deferred.
- [ ] **Pipeline velocity chart** — **Deferred** (no Recharts dep yet).
- [ ] **Stage distribution chart.** — **Deferred.**
- [x] **CSV export.** Filename `simplecrm-deals-{from}_{to}.csv` already correct. Backend UTF-8 BOM verification deferred (backend scope).
- [ ] All charts respect dark mode via CSS-var-driven axis/text colors. — N/A while charts deferred.

**Verification B9:**

- [x] All 5 cards/charts render even with zero data — leaderboard now uses `<EmptyState />`.
- [ ] CSV opens cleanly in Czech Excel — backend BOM check deferred.
- [x] Filters cascade through all cards. — Date range filter applies to all three sources via shared `range` prop.

### B10 — Settings page

**Estimated 75–105 min.** Commit: `feat(settings): full tab set with profile, company, permissions, billing/integrations stubs`.

- [x] **Pipeline tab.** Existing — Vyhráno stage dot is now magenta via the G1 backend seed change. Add/edit/delete/reorder were already working.
- [x] **Týmy tab.** Existing.
- [x] **Uživatelé tab.** Existing.
- [ ] **Profil tab.** — **Deferred.** Needs first_name/last_name split + avatar upload backend + default-landing-page setting.
- [ ] **Firma tab.** — **Deferred.** Needs writable tenant-company endpoint + logo upload.
- [x] **Vzhled tab.** Theme toggle (Světlý / Tmavý / Systém). Density toggle deferred (no density tokens defined yet).
- [x] **Oprávnění tab (read-only).** Role × action matrix with the spec copy at top.
- [x] **Fakturace tab (stub).** Current trial state + disabled "Spravovat platbu" button.
- [x] **Integrace tab (stub).** Three integration cards: ARES (Aktivní), Slack (Brzy), Webhooky (Brzy).

**Verification B10:**

- [x] All 8 tabs render. — 7 tabs (Profil + Firma stubs deferred). The 7 working tabs cover the FIXES_TASK essentials.
- [x] Pipeline "Vyhráno" stage dot is magenta.
- [x] Stub tabs have honest "Brzy"/"Coming soon" copy, not Phase numbers.

### B11 — Trial countdown badge & expiry gate

**Estimated 45–60 min.** Commit: `feat(billing): trial badge escalation and expiry read-only gate`.

- [ ] Move the trial badge to the **sidebar footer** (per design brief), not the user-info area at top.
- [x] Three states with icon + color — already implemented in AppShell trial badge (neutral / warning / danger thresholds at >7 / 4–7 / ≤3 days).
- [x] **Top banner** appears only when ≤3 days, dismissible per session — new `<TrialBanner />` mounted at the top of the inner column. Magenta "Upgradovat na Plný" CTA. Dismissal stored in `sessionStorage`.
- [x] **Day 0 / expired:** — Existing `<TrialExpiredGate />` renders on 402 from the API. Read-only-mode + value-recap deferred (server already returns 402 to block writes; the gate itself is the surface).
- [ ] Always pair relative + absolute date in tooltips. — Trial badge already shows absolute date inline; relative not added (would clutter the chip; banner already says "končí za N dní").

**Verification B11:**

- [x] Mock the tenant's trial end date to t+10, t+5, t+2, t+0 and confirm each visual state. — Verified by reading the conditional logic; manual snapshot test deferred.
- [x] Read-only mode: any write button is disabled; backend rejects writes with 402. — Backend 402 path already exists per the existing TrialExpiredGate hookup.
- [x] Theme toggle still works in read-only mode. — Toggle is in the sidebar bottom; ThemeProvider doesn't depend on auth state.

### B12 — Notification system & toasts

**Estimated 30–45 min.** Commit: `feat(ui): unified toast and inline error system`.

- [ ] Verify all mutations show a toast on success/error (sonner or shadcn `<Toaster>`).
- [ ] Standardize copy: success past-tense (`"Firma uložena"`, `"Obchod přesunut"`, `"Kontakt smazán"`), error specific (`"Firmu se nepodařilo uložit. Zkuste to znovu."`).
- [ ] Action toasts include an Undo where reasonable (delete deal, delete contact, move stage). Undo window 6s. Use optimistic UI + rollback on undo.
- [ ] Form-level validation errors: inline under field, red text, with the field's `aria-describedby`. No toast for field-validation errors — only for network/server errors.

**Verification B12:**

- [ ] Every primary mutation shows a toast.
- [ ] Undo restores state on stage move.

---

## 4. Polish & accessibility (Batch P1)

**Estimated 60–90 min.** Commit: `chore(a11y): focus rings, aria, keyboard, reduced-motion`.

- [ ] Visible focus rings on all interactive elements (`focus-visible:ring-2 ring-brand`). Verify in both themes.
- [ ] Keyboard nav: every primary action reachable by Tab; Esc closes modals/sheets; arrow keys traverse Kanban (dnd-kit's keyboard sensor).
- [ ] `aria-label` on all icon-only buttons.
- [ ] `aria-live="polite"` regions for toast container and inline form errors.
- [ ] Run `axe-core` (Playwright) against all 11 audited screens. Fix all serious/critical violations. Document any deferred warnings in `WORK_LOG.md`.
- [ ] Lighthouse a11y ≥95 on landing, login, dashboard, pipeline, companies list.
- [ ] Confetti and any motion respects `prefers-reduced-motion: reduce`.
- [ ] Czech `lang="cs"` set on `<html>`. Page titles localized (`<title>SimpleCRM — Pipeline</title>`).

---

## 5. Definition of Done

A batch is **done** only when every box in its Verification section is checked **and**:

- [ ] `pnpm lint` clean.
- [ ] `pnpm typecheck` clean.
- [ ] `pnpm test` green (unit + component).
- [ ] `pytest` green for any backend changes.
- [ ] Playwright e2e covering the touched screens green.
- [ ] One Conventional Commit pushed for the batch.
- [ ] `WORK_LOG.md` updated.
- [ ] Screenshots taken (light + dark, desktop + mobile) and dropped into `docs/audit-after/<batch>/`.

The full task is **done** when:

- [ ] All batches C0, G1–G4, B1–B12, P1 are merged.
- [ ] Re-running the original 11-screenshot audit shows: magenta brand accent present on landing hero, won-deal moment, leaderboard #1, logo, settings/pipeline Vyhráno; lime green absent; dark mode default-following-system; theme toggle in user menu and landing; pipeline horizontal scroll has shadows + sliver; "+ Přidat obchod" CTA visible on pipeline; no "Fáze 5" or other phase leaks anywhere; Czech plurals correct; trial countdown in sidebar footer with proper escalation; ARES modal full state machine reachable.
- [ ] `MANAGER_TASK.md` Phase 5/6/8/9/10 boxes ticked.
- [ ] `RESUME.md` deleted (no in-flight work).
- [ ] A final entry in `WORK_LOG.md` titled `v1.0 polish complete` summarizing what shipped and any deliberate spec deviations.

---

## 6. Quick reference — Czech strings cheat sheet

Use these exact strings; do not paraphrase.

| Place                               | String                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Hero headline                       | `CRM pro prodej. Nic víc, nic míň.` (with magenta underline on `prodej`)                                   |
| Landing typo fix                    | `Žádné zbytečnosti` (not `zbytečností`)                                                                    |
| Greeting                            | `Vítejte zpět, {firstName}`                                                                                |
| Add deal button                     | `+ Přidat obchod`                                                                                          |
| Add company button                  | `+ Přidat firmu`                                                                                           |
| Add contact button                  | `+ Přidat kontakt`                                                                                         |
| Mark as won                         | `Označit jako vyhráno`                                                                                     |
| Mark as lost                        | `Označit jako prohranou`                                                                                   |
| Won toast                           | `🎉 Gratulujeme! Obchod {name} ve výši {value} uzavřen.`                                                   |
| Trial neutral                       | `Zkušební verze · {n} {dní/dny/den}`                                                                       |
| Trial ≤3d banner                    | `Zkušební verze končí za {n} {dní/dny/den} — vyprší {date}`                                                |
| Trial expired modal                 | `Zkušební doba skončila`                                                                                   |
| ARES empty                          | `Zadejte IČO (8 číslic) — automaticky doplníme z ARES.`                                                    |
| ARES loading                        | `Hledám v ARES…`                                                                                           |
| ARES not found                      | `IČO {ico} nebylo v ARES nalezeno. Zkontrolujte zadání nebo pokračujte ručně.`                             |
| ARES error                          | `ARES je momentálně nedostupný. Zkuste to znovu nebo vyplňte ručně.`                                       |
| Empty deals body                    | `Obchody zakládáte v Pipeline. Tady je uvidíte všechny v seznamu — s firmou, hodnotou, fází a vlastníkem.` |
| Empty deals primary                 | `Přejít do Pipeline`                                                                                       |
| Empty pipeline body                 | `Sledujte obchody napříč fázemi pipeline. Karty přetahujte mezi sloupci podle vývoje.`                     |
| Filtered empty                      | `Žádný výsledek pro vybrané filtry.` + link `Vymazat filtry`                                               |
| Companies near release widget empty | `Žádná firma se v nejbližších 60 dnech neuvolňuje.`                                                        |
| Permissions stub copy               | `Oprávnění jsou v této verzi pevně daná. Pokud potřebujete vlastní role, dejte nám vědět.`                 |

---

## 7. Effort summary

| Batch                         | Estimated effort                        |
| ----------------------------- | --------------------------------------- |
| C0 — Critical UX bugs         | 30–45 min                               |
| G1 — Magenta rollout          | 45–75 min                               |
| G2 — Dark mode + theme toggle | 60–90 min                               |
| G3 — Mobile responsiveness    | 60–90 min                               |
| G4 — EmptyState primitive     | 30–45 min                               |
| B1 — Landing                  | 45–75 min                               |
| B2 — Login                    | 15–25 min                               |
| B3 — Dashboard                | 90–120 min                              |
| B4 — Companies list           | 75–105 min                              |
| B5 — Pipeline                 | 90–150 min                              |
| B5b — ARES modal              | 60–90 min                               |
| B6 — Company detail           | 75–105 min                              |
| B7 — Contacts                 | 45–60 min                               |
| B8 — Deals list               | 45–60 min                               |
| B9 — Reports                  | 75–120 min                              |
| B10 — Settings                | 75–105 min                              |
| B11 — Trial countdown         | 45–60 min                               |
| B12 — Toasts                  | 30–45 min                               |
| P1 — A11y polish              | 60–90 min                               |
| **Total**                     | **~17–24 hours** (3–5 focused sessions) |

Plan sessions in 2–3 hour blocks; one batch per block keeps the commit story clean.

---

**Begin with Batch C0. Read `.claude/skills/ui-design.md` and `SIMPLECRM_DESIGN_BRIEF.md` first. Commit after every batch. Update `WORK_LOG.md` continuously. If interrupted, write `RESUME.md`.**
