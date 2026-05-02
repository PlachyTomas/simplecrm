# SimpleCRM — Reports & Configurable Widgets

You are continuing the SimpleCRM build. This brief covers **Phase 8 — Reports**, expanded into a configurable widget-based dashboard for managers and admins. Read `MANAGER_TASK.md` (master spec), `.claude/skills/ui-design.md` (design system), and `SIMPLECRM_DESIGN_BRIEF.md` (brand decisions) before starting. Follow the operating protocol in Section 13 of `MANAGER_TASK.md` (single session, plan → build → verify → commit, `WORK_LOG.md` after every step, `RESUME.md` on session boundaries).

This brief is self-contained for the Reports feature. Do **not** invent metrics outside the catalog below. Do **not** add probability-weighted forecasting or expected-vs-actual close-date analysis — both were explicitly cut.

-----

## 1. Goal

Replace the single static reports page from the original Phase 8 plan with a **configurable widget dashboard**:

- Managers and admins land on `/app/reports` and see a grid of widgets.
- Each widget displays one metric from a fixed catalog of 12 (Section 4).
- Users add, remove, resize, reorder widgets. The layout persists per user.
- A shared filter bar at the top (date range, team, salesperson) updates every widget at once. Some widgets also expose their own per-widget controls (e.g., leaderboard sort axis).
- A pared-down, non-interactive version of the same widgets appears in the landing-page demo section to communicate the feature to prospects.

Salespeople do **not** get this page. The existing per-user KPI tiles on the salesperson dashboard remain untouched.

-----

## 2. Non-goals (do not build)

- Probability-weighted pipeline value, expected pipeline forecasts, weighted forecasts of any kind.
- Expected-close-date vs actual-close-date analytics — `expected_close_date` is optional and unreliable.
- Custom user-defined metrics, formula builders, SQL access.
- Sharing dashboards between users, public dashboard links.
- Scheduled email reports, alerts, anomaly detection.
- Drilldown from a widget into a full-screen detail view (a click on a leaderboard row may navigate to that user’s profile, but no purpose-built drilldown screens).
- Multi-pipeline support (UI shows only the default pipeline; data model allows it).
- AI-driven insights or recommendations.

CSV export remains in scope (Task R7) — it exports the data underlying the currently-visible widgets with the currently-applied filters.

-----

## 3. Data model changes

### 3.1 New column

```
User.reports_dashboard_config  JSONB  NOT NULL  DEFAULT '{}'::jsonb
```

Stores the user’s widget layout and per-widget configuration. Schema:

```jsonc
{
  "version": 1,
  "widgets": [
    {
      "id": "wid_01HXYZ...",          // ULID, generated client-side
      "type": "pipeline_value",        // one of the 12 widget types
      "position": { "x": 0, "y": 0, "w": 3, "h": 2 },  // 12-col grid
      "config": {                      // widget-specific, validated server-side
        "groupBy": "stage"             // example for pipeline_value
      }
    }
  ],
  "globalFilters": {
    "dateRange": {
      "preset": "last_30_days",        // or "custom"
      "from": null,                    // ISO date if custom
      "to": null
    },
    "teamId": null,                    // null = all teams (admin only)
    "ownerUserId": null                // null = all reps in scope
  }
}
```

If `reports_dashboard_config` is empty `{}`, the API returns the default layout (Section 6.3) and the frontend persists it on first edit.

### 3.2 Indexes

No new indexes. All widget queries hit existing indexed columns (`Deal.owner_user_id`, `Deal.stage_id`, `Company.organization_id`, `Activity.created_at`, etc.).

### 3.3 Migration

One Alembic migration adds the column with default `'{}'`. No backfill needed.

-----

## 4. Widget catalog — the 12 metrics

Each widget below specifies: the Czech UI label, the metric definition, the visualization, the per-widget config options, the default grid size on a 12-col layout, and the formula. **Do not deviate** — these are the locked set for v1.0.

All widgets respect the global filter bar (date range, team, salesperson) plus their own config. All currency values format via `Intl.NumberFormat` with the org’s locale and currency. All counts use tabular nums.

### KPI tiles (default size: 3 × 2)

These render as single-number tiles with a label, an optional comparison delta vs. the previous period of equal length, and a small sparkline showing the metric over the selected range. Visual model: the existing salesperson KPI card (`frontend/src/app/dashboard/kpi-card.tsx`).

**1. Hodnota pipeline** — `pipeline_value`

- Sum of `Deal.value` (converted to org currency) where `Deal.stage.stage_type = 'open'` and the deal owner matches the filter scope.
- Date range filters by `Deal.created_at`.
- Per-widget config: `groupBy: "none" | "stage" | "owner"`. When grouped, the widget grows to a stacked bar (size 6 × 2 minimum); when `none`, single number.

**2. Nové firmy** — `new_companies`

- Count of `Company` rows created in the date range, scoped by owner filter.
- Per-widget config: `breakdown: "none" | "by_owner"`. With `by_owner`, renders a horizontal bar (size 6 × 2 minimum).

**3. Vyhrané obchody** — `deals_won`

- Count and total value of deals closed-won in the date range (`Deal.closed_at` within range AND `Deal.stage.stage_type = 'won'`).
- Tile shows count as primary, value as secondary line.
- Per-widget config: `display: "count" | "value" | "both"` (default `both`).

**4. Úspěšnost** — `win_rate`

- `won_count / (won_count + lost_count)` × 100, rounded to one decimal. Both counts use `Deal.closed_at` within range.
- Empty denominator (no closed deals): show `—`, not `0 %`. Tooltip: “V tomto období žádné uzavřené obchody.”
- Per-widget config: none.

**5. Průměrná velikost obchodu** — `avg_deal_size`

- `sum(Deal.value where stage_type='won' and closed_at in range) / count(those deals)`.
- Per-widget config: `scope: "won" | "open"` (default `won`).

**6. Délka prodejního cyklu** — `sales_cycle_length`

- For each deal closed-won in the range: `(Deal.closed_at − Company.created_at).days`. Average across deals.
- Show median as well in tooltip — averages mislead when the distribution is skewed.
- Per-widget config: `metric: "mean" | "median"` (default `median` — more robust for SMB sample sizes).

**7. Konverze lead → obchod** — `lead_to_deal_conversion`

- `count(distinct Company with at least one Deal created in range) / count(Company created in range)` × 100.
- Companies created in the range that didn’t yet get a deal count as un-converted (the rep didn’t open one yet).
- Per-widget config: `breakdown: "none" | "by_owner"`.

### Charts (default size: 6 × 4)

**8. Důvody prohraných obchodů** — `lost_reasons_breakdown`

- Horizontal bar chart of `Deal.lost_reason` counts for deals closed-lost in the range.
- Bars sorted descending. Long-tail collapses into “Ostatní” if there are more than 6 reasons.
- Per-widget config: `display: "count" | "value"` (sort axis: count of deals, or summed lost value).

**9. Žebříček obchodníků** — `sales_leaderboard`

- Bar chart of reps in scope ranked by a configurable metric.
- Leader gets a single magenta accent on their bar (one magenta moment per screen rule — and *only* when the widget appears alone; if the dashboard already shows the leader badge elsewhere, suppress it here).
- Pair color with rank number — never color-only.
- Per-widget config: `metric: "won_count" | "won_value" | "win_rate" | "deals_added"`. Default `won_value`.

**10. Aktivita obchodníků** — `rep_activity`

- Number of new deals each rep added to the pipeline in the range.
- Visualization: bar chart, one bar per rep, sorted descending.
- This is the “pipeline starvation” early-warning metric — managers spot reps not generating new opportunities.
- Per-widget config: none.

### Lists (default size: 6 × 4)

**11. Stagnující obchody** — `stale_deals`

- Open deals whose stage hasn’t changed for ≥ N days. “Stage hasn’t changed” = no `Activity` of type `stage_change` for that deal in the last N days, AND `Deal.updated_at` is older than N days.
- Show: deal name, company, stage, value, owner, days-since-last-stage-change. Up to 20 rows. Sorted descending by days.
- Per-widget config: `threshold: 30 | 60 | 90` (default `60`).
- Row click navigates to the deal detail.

**12. Firmy ohrožené uvolněním** — `companies_at_risk`

- Companies where `ownership_expires_at` is within N days from now AND `owner_user_id IS NOT NULL`. This is the signature SimpleCRM auto-freeing visibility.
- Show: company name, owner, days-until-freeing (color-coded: tertiary > 30 days, warning ≤ 14, danger ≤ 7), last activity date.
- Up to 20 rows. Sorted ascending by days remaining.
- Per-widget config: `threshold: 30 | 14 | 7` (default `30`).
- Row click → company detail.
- This widget exists on the salesperson dashboard at smaller scale; here it’s team-wide and filtered by owner if scoped.

-----

## 5. Filter system

### 5.1 Global filter bar (top of the Reports page)

Sticky at the top of the page, below the app’s top nav. Three controls in a horizontal row, collapsing to a single “Filtry” sheet on mobile.

**Date range** — segmented control with presets, “Vlastní” opens a date-range picker:

- Posledních 7 dní
- Posledních 30 dní (default)
- Tento kvartál
- Letošní rok
- Posledních 12 měsíců
- Vlastní (date-range popover)

**Tým** — dropdown. Options: “Všechny týmy” (admin only) | one entry per team the user is allowed to see.

**Obchodník** — dropdown. Options: “Všichni obchodníci” | one entry per rep in the selected team’s scope.

Permission rules (already defined in Section 8 of `MANAGER_TASK.md`):

- **Salesperson**: cannot reach `/app/reports`. Route returns 403 + redirects to dashboard.
- **Manager**: team selector locked to their team(s); rep selector limited to those teams.
- **Admin**: all teams, all reps.

Changes to global filters debounce by 300ms and trigger refetch on every visible widget. Use TanStack Query with `queryKey` including the filter object — automatic deduping handles concurrent widget refetches.

### 5.2 Per-widget config

Each widget has a small gear icon in its header. Clicking opens a popover with the config options listed in the catalog. Changes persist immediately to `reports_dashboard_config` and refetch the widget.

### 5.3 Empty filter results

If the active filter combination yields no data, every widget renders its own empty state with copy like “V tomto období žádná data.” The page shell does **not** render a global empty state — managers need to see which widgets are empty and which aren’t.

-----

## 6. Architecture

### 6.1 Backend — endpoint shape

**One endpoint per widget type**, all under `/api/v1/reports/widgets/`. This keeps OpenAPI types tight (each response is uniquely shaped — no `any` unions in the generated TS).

```
GET /reports/widgets/pipeline-value
GET /reports/widgets/new-companies
GET /reports/widgets/deals-won
GET /reports/widgets/win-rate
GET /reports/widgets/avg-deal-size
GET /reports/widgets/sales-cycle-length
GET /reports/widgets/lead-to-deal-conversion
GET /reports/widgets/lost-reasons-breakdown
GET /reports/widgets/sales-leaderboard
GET /reports/widgets/rep-activity
GET /reports/widgets/stale-deals
GET /reports/widgets/companies-at-risk
```

Common query parameters on every widget endpoint:

- `from` (ISO date, required), `to` (ISO date, required)
- `team_id` (UUID, optional)
- `owner_user_id` (UUID, optional)
- Plus widget-specific config params (`group_by`, `breakdown`, `threshold`, `metric`, `display`, `scope`).

Every response includes a `comparison` object when applicable, giving the previous period of equal length so the frontend can render the delta indicator without a second request:

```jsonc
{
  "value": 1245000,
  "currency": "CZK",
  "sparkline": [/* daily buckets within range */],
  "comparison": {
    "value": 980000,
    "delta_pct": 27.04,
    "previous_from": "2026-03-01",
    "previous_to": "2026-03-30"
  }
}
```

### 6.2 Layout persistence

```
GET    /api/v1/reports/dashboard-config   → returns user's config or default
PUT    /api/v1/reports/dashboard-config   → validates and persists
DELETE /api/v1/reports/dashboard-config   → resets to default
```

Server-side validation:

- Reject unknown widget types.
- Reject invalid config values per widget type (use a Pydantic discriminated union by `type`).
- Reject overlapping positions on the grid.
- Reject more than 20 widgets per dashboard (sanity ceiling).
- Reject invalid grid positions (`x + w > 12`, `h < 1`, etc.).

### 6.3 Default layout

When a user first visits `/app/reports`, their config is empty and the API returns:

```jsonc
{
  "version": 1,
  "widgets": [
    { "type": "pipeline_value",     "position": { "x": 0, "y": 0, "w": 3, "h": 2 } },
    { "type": "deals_won",          "position": { "x": 3, "y": 0, "w": 3, "h": 2 } },
    { "type": "win_rate",           "position": { "x": 6, "y": 0, "w": 3, "h": 2 } },
    { "type": "avg_deal_size",      "position": { "x": 9, "y": 0, "w": 3, "h": 2 } },
    { "type": "sales_leaderboard",  "position": { "x": 0, "y": 2, "w": 6, "h": 4 }, "config": { "metric": "won_value" } },
    { "type": "lost_reasons_breakdown", "position": { "x": 6, "y": 2, "w": 6, "h": 4 } },
    { "type": "stale_deals",        "position": { "x": 0, "y": 6, "w": 6, "h": 4 }, "config": { "threshold": 60 } },
    { "type": "companies_at_risk",  "position": { "x": 6, "y": 6, "w": 6, "h": 4 }, "config": { "threshold": 30 } }
  ],
  "globalFilters": {
    "dateRange": { "preset": "last_30_days", "from": null, "to": null },
    "teamId": null,
    "ownerUserId": null
  }
}
```

ULIDs are generated client-side on first load and persisted on first save.

### 6.4 Frontend — grid library choice

Use **`react-grid-layout`** (not dnd-kit alone — dnd-kit handles drag well but doesn’t handle resize and reflow). It’s mature, has Tailwind-friendly styling hooks, and supports responsive breakpoints. Document the choice in an ADR (`docs/adr/0007-react-grid-layout-for-reports.md`).

Behavior:

- Desktop ≥ 1024px: drag and resize enabled, 12-col grid, row height 64px.
- Tablet 768–1023px: drag enabled, resize disabled, 6-col grid (widgets reflow — width clamped to 6).
- Mobile < 768px: grid library disabled entirely. Widgets render as a single vertical stack in the order from the layout (sorted by `y` then `x`). No drag, no resize. The “Upravit rozložení” button is hidden.

### 6.5 Widget component contract

Every widget is a React component that receives:

```ts
interface WidgetProps<TConfig> {
  id: string;
  config: TConfig;
  globalFilters: GlobalFilters;
  isEditMode: boolean;     // when true, show drag handle + remove button + gear
  onConfigChange: (next: TConfig) => void;
  onRemove: () => void;
}
```

Widgets fetch their own data via TanStack Query. The `queryKey` is `['widget', type, config, globalFilters]`. Loading shows the skeleton variant defined in `ui-design.md` Section 5.10. Errors render a small inline retry card — never a toast (errors per widget should not stack into a notification spam).

### 6.6 Edit mode

A “Upravit rozložení” button in the page header toggles edit mode:

- Widgets gain a 1px dashed accent border, a drag handle in their top-left, an X remove button in their top-right, and resize handles on bottom-right.
- An “Přidat widget” button reveals a sheet listing all 12 widget types with previews. Clicking adds the widget at the next free row position with its default size.
- “Uložit” persists the layout via PUT and exits edit mode. “Zrušit” reverts in-memory changes and exits.
- “Obnovit výchozí” calls DELETE and reloads the default layout (with confirmation modal: “Opravdu chcete obnovit výchozí rozložení? Vaše úpravy budou ztraceny.”).

-----

## 7. Tasks

Sequential. Each task ends with one commit (Conventional Commits format). Update `WORK_LOG.md` after every task and after every meaningful sub-step. Write `RESUME.md` if you sense the session limit approaching.

### R0 — Foundation

- **R0.1** Add `reports_dashboard_config` JSONB column to `User` model + Alembic migration. Default `'{}'`. Update User Pydantic schemas.
- **R0.2** Add Pydantic discriminated-union schemas for the 12 widget types under `backend/app/schemas/reports/widgets/`. One file per widget. Re-export from `__init__.py`.
- **R0.3** Add the `DashboardConfig` schema with strict validation (unknown widget rejected, position bounds enforced, max 20 widgets, no overlap).
- **R0.4** Service layer: `backend/app/services/reports/` directory with one module per metric (`pipeline_value.py`, `win_rate.py`, …). Each module exports a single async function returning the typed response. **No business logic in route handlers** — they just call the service.

**Acceptance:** migration runs, schemas validate, service-layer files exist as stubs returning fake data.

### R1 — Layout endpoints

- **R1.1** `GET /api/v1/reports/dashboard-config` — returns saved config or the default from Section 6.3.
- **R1.2** `PUT /api/v1/reports/dashboard-config` — validates and persists.
- **R1.3** `DELETE /api/v1/reports/dashboard-config` — resets.
- **R1.4** Tests in `backend/tests/api/v1/test_reports.py`: happy path, validation error (invalid widget type, overlapping positions, too many widgets), permission denied (salesperson role gets 403).

**Acceptance:** all four endpoints respond correctly; tests green.

### R2 — Widget endpoints, batch 1 (the four KPI tiles in default layout)

Implement service + route + tests for: `pipeline_value`, `deals_won`, `win_rate`, `avg_deal_size`. Each needs at least three test functions (happy, validation, permission). Each must compute the comparison delta correctly.

**Acceptance:** all four endpoints return correct numbers against seeded data. Tests green. OpenAPI spec regenerated; frontend types regenerated; CI passes the freshness check.

### R3 — Widget endpoints, batch 2 (remaining KPI tiles)

Implement: `new_companies`, `sales_cycle_length`, `lead_to_deal_conversion`. Same testing standard.

### R4 — Widget endpoints, batch 3 (charts and lists)

Implement: `lost_reasons_breakdown`, `sales_leaderboard`, `rep_activity`, `stale_deals`, `companies_at_risk`.

The two list widgets (`stale_deals`, `companies_at_risk`) must be paginated server-side at 20 rows max — frontend never asks for more.

### R5 — Frontend foundation

- **R5.1** `frontend/src/app/reports/` directory. `ReportsPage.tsx` is the route component, role-gated to `manager | admin`.
- **R5.2** `useDashboardConfig` hook — TanStack Query for GET, mutation for PUT/DELETE, optimistic update on save.
- **R5.3** Global filter bar component. Date-range presets + custom popover; team and owner dropdowns gated by role.
- **R5.4** `WidgetGrid` component using `react-grid-layout`. Reads config, renders widgets, handles drag/resize in edit mode, persists on save.
- **R5.5** `WidgetFrame` shared shell — header (label + gear + drag handle + X), body slot, footer slot. Loading/error/empty states per `ui-design.md` Section 5.

**Acceptance:** managers can view the page with the default layout, see widget shells with skeleton loading states, toggle edit mode, drag widgets around, save the layout. No real data yet.

### R6 — Frontend widgets, all 12

One PR per widget is fine but not required — a single commit per logical batch is acceptable as long as each widget is fully wired (data fetching + visualization + config popover + states).

Suggested batching:

- **R6.1** KPI tiles 1–7 (they share the same `KPITile` base component — build that first).
- **R6.2** Bar charts 8–10 (they share `BarChartWidget` base — Recharts).
- **R6.3** List widgets 11–12 (they share `ListWidget` base — virtualized table, click row to navigate).

For widget 9 (`sales_leaderboard`), the magenta-on-leader rule: apply only when no other magenta moment is present on the page. Since the dashboard is widget-configurable, just always honor it within the widget — it’s the only magenta on the Reports page by default. (The page-level “max one magenta in light mode” rule is met as long as no other widget renders magenta. Audit at the end of R6.)

For widget 11 (`stale_deals`), the days-since column uses warning color at ≥ 60 days and danger at ≥ 90 — paired with an icon, not color-only.

For widget 12 (`companies_at_risk`), follow the existing salesperson-dashboard “Firmy blížící se uvolnění” pattern for color-coding the days-remaining badge.

**Acceptance:** every widget renders correctly with seeded data at 1280px and 390px. Per-widget config popovers work. Filters update all widgets. CSV export (R7) works against the rendered data.

### R7 — CSV export

- **R7.1** Backend: `POST /api/v1/reports/export-csv` accepting `{ widgets: [{ type, config }], globalFilters }`. Returns a CSV with one section per widget, separated by a blank row and a section header. UTF-8 with BOM (Excel Czech compatibility).
- **R7.2** Frontend: “Stáhnout CSV” button in the page header. Sends the current visible widget set + filters. Triggers download with filename `reporty-YYYY-MM-DD.csv`.

**Acceptance:** opens in Excel and Numbers without encoding garbage; numbers and dates formatted per org locale.

### R8 — Landing page interactive demo

A scaled-down, **fake-data** version of four widgets in the landing page’s feature tour (Section 10 of `MANAGER_TASK.md`).

- **R8.1** New section: “Sledujte přesně to, co potřebujete.” Shows a glassless mock of the Reports page with four widgets visible: `pipeline_value`, `sales_leaderboard`, `lost_reasons_breakdown`, `stale_deals`.
- **R8.2** A segmented control at the top cycles through 3 preset date ranges (Posledních 7 dní / Posledních 30 dní / Tento kvartál). Switching updates all four widgets with pre-baked fake data — no API calls. Numbers animate (count up/down) on transition. Use the same number-counter primitive from the salesperson dashboard.
- **R8.3** Subtle `prefers-reduced-motion` support — animations disabled, content swaps instantly.
- **R8.4** Mobile (< 768px): widgets stack vertically, segmented control becomes a horizontal scroll. Lighthouse mobile score must remain ≥ 90 — check before committing.

**Acceptance:** demo works without any backend connection; fake data is plausible (not all zeros, not absurd numbers); switching ranges feels instant; landing page Lighthouse mobile ≥ 90.

### R9 — Polish & a11y

- **R9.1** Every widget has loading, empty, and error states matching `ui-design.md` Section 5.
- **R9.2** Keyboard support: tab through widgets in edit mode; Enter activates drag handle; arrow keys nudge position; Escape exits edit mode.
- **R9.3** Screen-reader labels on every chart (Recharts `aria-label` per series; data table summary fallback rendered visually-hidden).
- **R9.4** Color-blind mode toggle (already shipped per the design brief) flips charts from green/red to blue/orange — verify all widgets honor it.
- **R9.5** Run axe on the page; zero critical violations.

-----

## 8. Testing requirements

Per `MANAGER_TASK.md` Section 12:

- Every widget endpoint has happy/validation/permission tests at minimum, plus a `test_<widget>_returns_correct_comparison` test for those that include a comparison object.
- Service-level unit tests for any non-trivial computation (sales cycle length median, win rate denominator-zero handling, lead-to-deal conversion edge cases).
- A Playwright E2E flow: log in as manager → open `/app/reports` → toggle edit mode → add a widget → resize → save → reload → verify layout persisted.
- Visual checks at 1280px, 768px, and 390px viewports for the page.
- Frontend types regenerated from OpenAPI; CI freshness check passes.

-----

## 9. Acceptance criteria for the whole feature

The feature is done when:

1. A manager visits `/app/reports`, sees the default 8-widget layout, all loading correctly with seeded data within 2 seconds.
1. They change the date range from the global filter and every widget refetches and updates.
1. They open a widget’s gear menu, change a config option, and the widget refetches with the new config.
1. They enter edit mode, drag a widget to a new position, resize another, add a third widget, save, reload — the new layout persists.
1. They reset to default and the original 8-widget layout returns.
1. A salesperson hitting `/app/reports` is redirected to their dashboard with no error.
1. CSV export downloads a file that opens cleanly in Excel with Czech characters intact.
1. The landing page demo cycles between 3 date ranges with animated number transitions, no API calls, Lighthouse mobile ≥ 90.
1. Zero critical axe violations on the Reports page.
1. All 12 widget endpoints have ≥ 3 tests each; coverage of `app/services/reports/` ≥ 80%.
1. The Reports page shows at most one magenta element at any time in light mode (the leader bar in `sales_leaderboard` if rendered, suppressed otherwise).
1. The page works at 390px width — widgets stack vertically, no horizontal scroll, no broken layouts.

-----

## 10. Out of scope (explicitly deferred to v1.1+)

- Multi-pipeline filter on widgets.
- Saved filter presets (“My Q3 view”, “Acme deals only”).
- Cross-org benchmarking (“how does my team compare to the platform average”).
- Alerting / threshold notifications.
- Embedding individual widgets elsewhere in the app.
- Sharing dashboards between users.
- Exporting individual widgets as images.

-----

**Begin by reading `WORK_LOG.md` and `RESUME.md` (if present). Then write a brief task plan in `.claude/tasks/REPORTS.md` listing R0 through R9 with your estimated effort per task, and start R0.1.**
