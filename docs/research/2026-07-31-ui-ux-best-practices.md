# UI/UX best practices — research + SimpleCRM audit (2026-07-31)

Owner ask: "find research on best UI practices, optimal layouts, memorable
design and compile a report that we will use to improve general UI/UX."

Scope note: `docs/prompts/SIMPLECRM_DESIGN_BRIEF.md` already locks the
visual identity (palette, magenta budget, dark-first elevation, semantic
grammar) — this report deliberately does NOT re-open it. It covers what
the brief doesn't: evidence-based **interaction, layout, density and
memorability** practices, each checked against the app as it exists
today. Numbers quoted from UX-industry sources are flagged as reported,
not gospel.

## 1. The evidence base

### Cognitive load & choice (Hick, Fitts, chunking)

- Working memory holds ~4±1 chunks; dashboards demanding more than 5–7
  simultaneous metrics measurably degrade decisions (NN/g-derived
  guidance).
- **Hick's law**: decision time grows with the number and complexity of
  choices — fewer, better-labeled options beat comprehensive menus;
  progressive disclosure is the escape hatch (reported to cut cognitive
  load substantially).
- **Fitts's law**: acquisition time = f(distance, size). High-frequency
  targets must be big and near; hover-revealed micro-buttons are the
  anti-pattern for anything used constantly.
- **Visual hierarchy** is cheap cognition: when the design says what
  matters, the user doesn't have to decide. Users scan in an F-pattern —
  the top-left quadrant is the most valuable real estate.

### Dense B2B tables & dashboards

- Tables win when data is dense, structured and *acted on*: alignment
  (numbers right, text left), typographically distinct labels vs values
  (weight/size/color — identical type forces reading instead of
  scanning), ≥1.4 line-height in dense bodies, sorting/filtering that
  matches real tasks, and **bulk actions + inline editing** where users
  act on many rows.
- Dashboards: 5–7 primary metrics max; highest-value info top-left;
  every number needs its comparison (delta vs a reference period) to be
  a decision input rather than trivia.

### Forms

- **Single column** beats multi-column (Baymard/CXL eye-tracking:
  faster comprehension, fewer errors).
- **Inline validation** — validate on leaving a field, never while
  typing; clear the error the moment it's fixed; reported +22 % success
  / +31 % satisfaction vs submit-time-only validation.
- Error anatomy: *what* went wrong, *why*, *what to do* — state the
  requirement ("min. 8 znaků"), place it under the field, never only in
  a top-of-page banner.

### Speed as UX (the Linear lesson)

- The most impactful improvements in CRM-type tools are rarely visual —
  they remove one step from a workflow repeated dozens of times a day.
  Every high-frequency task should cost the minimum possible
  interactions.
- Linear's playbook: **keyboard-driven interface + opinionated
  defaults** — the product decides the right way to do a thing, and
  power users never touch the mouse. Perceived speed is a brand
  attribute, not a nicety.
- No handbook needed to start: onboarding by doing (our per-page tours
  are exactly this pattern).

### Memorability (aesthetic-usability, peak-end)

- **Peak-end rule** (Kahneman): experiences are remembered by their
  most intense moment and their ending, not the average. Products earn
  memory by engineering one great *peak* and clean *endings* — and
  novel peaks beat imitated ones.
- **Aesthetic-usability effect**: interfaces perceived as beautiful are
  perceived (and forgiven) as more usable — polish compounds.
- Signature moments must be scarce to stay signature — which is exactly
  the brief's magenta budget, independently confirmed by the research.

### Dark mode (we're dark-first)

- WCAG holds in both modes: 4.5:1 body text, 3:1 large text. No pure
  black (halation), no pure white text (glow) — transparent whites /
  light greys, slightly heavier weights, more line spacing.
- Elevation via lighter surfaces and borders, not shadows; desaturate
  accents on dark. (The brief already mandates all of this.)
- Charts must not rely on hue alone — direct labels and patterns keep
  red/green pairs meaningful (also a CVD requirement).

## 2. Audit — where SimpleCRM already complies

| Practice | Evidence in the app |
|---|---|
| Hierarchy & color discipline | The 80/10/5/<5 ratio in the brief IS the hierarchy research, enforced |
| Peak moment | Won-deal magenta flash + confetti (`celebrateWin`) — a textbook engineered peak, scarce by rule |
| Progressive disclosure | Per-page tours; quick-actions ⚡ menu; hover-revealed win/lose; timeline "Načíst další" |
| Speed of frequent tasks | ⚡ note/call = 2 fields; ARES = 1 field; drag-to-lose; create-from-email = 0 typed fields |
| Dashboards | Home default: 4 KPI tiles top row (within the 5–7 cap), F-pattern respected; report widgets carry delta-vs-previous badges |
| Tables | Numbers right-aligned + tabular-nums throughout; responsive column hiding; label/value type distinction on cards |
| Dark mode | Off-black surfaces, elevation-by-lightness, desaturated dark-mode accents — all per brief and per research |
| Forms | Modals are single-column; dismiss guards protect typed input |

## 3. Audit — gaps, in priority order

**P1 — No keyboard layer.** The single biggest divergence from the
speed-as-UX research. There are no app shortcuts: no command palette, no
`n` = new deal, no `g p` = go to pipeline, no `/` focus-search, no Esc/
arrow flows on the board. For an app whose brand is "lightweight and
fast," a keyboard layer is the cheapest way to *feel* like Linear rather
than a legacy CRM. (Global search exists in the header — it is the
natural seed for a Cmd+K palette.)

**P1 — Deal detail still overflows a laptop viewport** (~190 px at
1280×800 for a typical deal; Události/E-maily below the fold). The
compaction pass helped; one more density step (or collapsible sections
with counts) finishes it.

**P2 — Validation consistency.** Mixed patterns: some forms validate
inline with field-level messages (deal edit), others only toast on
submit. Adopt one contract app-wide: validate on blur, message under the
field, state the requirement, clear on fix.

**P2 — No bulk actions on tables.** Research calls bulk actions a core
dense-table task. Obchody/Kontakty/E-maily have no multi-select — e.g.
"mark 5 stale deals lost," "assign 3 unmatched mails," "export selected."

**P2 — Endings are unengineered.** We have a great peak (win moment) but
no *ends*: completing the last no-next-step deal, clearing Nepřiřazené,
finishing an import — all end silently. Peak-end says a one-line
celebratory empty state ("Vše má další krok. Skvělá práce!") at these
moments is disproportionately memorable. (The new widget's empty state
already does this — extend the pattern.)

**P3 — Fitts audit of hover-only micro-targets.** Card win/lose buttons
are 24×24 px, hover-revealed — at the small end of acceptable for
mouse, invisible for touch (mobile cards correctly show labeled buttons
instead). Keep ≥24 px and always-visible-on-focus; consider size bump on
the most-used ✕.

**P3 — Chart/dark-mode audit.** Recharts widgets warn about zero-size
containers on Reports; verify dark-mode series colors are desaturated
and not hue-only (add direct labels where red/green carry meaning).

**P3 — Table micro-craft pass.** Verify 1.4 line-height in dense tables,
and that secondary cell text (e.g. counterparty lines on E-maily) stays
typographically subordinate on all viewports.

## 4. Recommended sequence (for a future pass — NOT started)

1. Keyboard layer: Cmd+K palette (reuse global search) + `n`/`g`
   navigation + board arrows. The one item that changes how the app
   *feels*.
2. Deal-detail final densification.
3. Form-validation contract + shared field-error component.
4. Bulk actions: Obchody first (multi-select → mark lost / export), then
   E-maily (batch assign).
5. Engineered endings: celebratory empty states for no-next-step,
   Nepřiřazené, and import-complete.
6. Fitts/touch + chart/dark audits as one polish sweep.

## Sources

- [Laws of UX — Peak-End Rule](https://lawsofux.com/peak-end-rule/) · [ui-patterns: Peak-End](https://ui-patterns.com/patterns/Peakend-rule)
- [Looppanel — The 21 Laws of UX](https://www.looppanel.com/blog/laws-of-ux) · [ParallelHQ — UX laws reference](https://www.parallelhq.com/blog/ux-laws-design-principles)
- [IJRASET — Reducing cognitive load in UI design](https://www.ijraset.com/best-journal/reducing-cognitive-load-in-ui-design)
- [Eleken — Table design UX for SaaS](https://www.eleken.co/blog-posts/table-design-ux) · [Lollypop — Enterprise SaaS typography](https://lollypop.design/blog/2026/july/enterprise-saas-typography-rules/)
- [Context.dev — Dashboard design best practices](https://www.context.dev/blog/dashboard-design-best-practices)
- [Baymard — Usability testing of inline form validation](https://baymard.com/blog/inline-form-validation) · [fomr.io — Form UX: what the research says](https://fomr.io/blog/form-ux-best-practices)
- [Figma blog — The Linear Method: opinionated software](https://www.figma.com/blog/the-linear-method-opinionated-software/) · [Eleken — Linear case study](https://www.eleken.co/blog-posts/linear-app-case-study)
- [Adam Fard — CRM design best practices](https://adamfard.com/blog/crm-design) · [Nutshell — user-friendly CRM traits](https://www.nutshell.com/blog/most-user-friendly-crm)
- [Uxcel — 12 principles of dark mode](https://uxcel.com/blog/12-principles-of-dark-mode-design-627) · [DubBot — Dark mode a11y](https://dubbot.com/dubblog/2023/dark-mode-a11y.html) · [AccessibilityChecker — dark mode guide](https://www.accessibilitychecker.org/blog/dark-mode-accessibility/)
