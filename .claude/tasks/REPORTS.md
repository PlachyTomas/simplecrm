# Reports & Configurable Widgets — task plan

Driving prompt: `docs/prompts/REPORTS_TASK.md`. Replaces the existing
single static `/app/reports` (already shipped: kpi-summary,
leaderboard, loss-reasons, pipeline-velocity, team-leaderboard,
my-summary) with a configurable 12-widget dashboard.

The existing endpoints can either be deprecated or used as building
blocks for the new widget services. Each new widget gets its own
`GET /api/v1/reports/widgets/<name>` so OpenAPI types stay tight.

## Effort estimate per task

(Estimates assume the loop running with 5h cadence — `S` ≈ one focused
session of work; `M` ≈ two sessions; `L` ≈ three or more. The
estimates compound: R6 alone is ~3 sessions because every widget is
data-fetch + viz + config popover + states.)

| Task | Effort | Notes |
| ---  | ---    | --- |
| R0.1 | XS | Add `User.reports_dashboard_config` JSONB column + Alembic migration. |
| R0.2 | S  | 12 Pydantic widget-config schemas + discriminated union. |
| R0.3 | S  | `DashboardConfig` schema with overlap/bounds/max-widgets validation. |
| R0.4 | XS | Stub the `app/services/reports/` directory with one file per widget returning fake data. |
| R1   | S  | GET/PUT/DELETE `/dashboard-config` + tests (happy, validation, role 403). |
| R2   | M  | 4 widget endpoints (`pipeline_value`, `deals_won`, `win_rate`, `avg_deal_size`) + service-layer queries + comparison-period math + tests. |
| R3   | S  | 3 widget endpoints (`new_companies`, `sales_cycle_length`, `lead_to_deal_conversion`) + tests. |
| R4   | M  | 5 widget endpoints (`lost_reasons_breakdown`, `sales_leaderboard`, `rep_activity`, `stale_deals`, `companies_at_risk`) — includes pagination on the two list widgets. |
| R5   | M  | Frontend: ReportsPage shell, useDashboardConfig, global filter bar, WidgetGrid (react-grid-layout), WidgetFrame. ADR for the grid library choice. |
| R6.1 | M  | KPITile base + 7 KPI tile widgets fully wired (data + sparkline + comparison delta + config popovers + loading/empty/error). |
| R6.2 | M  | BarChartWidget base + 3 bar-chart widgets (Recharts). Magenta-leader rule audit. |
| R6.3 | S  | ListWidget base + 2 list widgets (`stale_deals`, `companies_at_risk`) — virtualized table, click-to-navigate, color-coded badges. |
| R7   | S  | CSV export endpoint + frontend download button. UTF-8 BOM. |
| R8   | M  | Landing demo: 4 widgets with pre-baked fake data, 3 date-range presets, animated number transitions, prefers-reduced-motion. Lighthouse ≥ 90 mobile. |
| R9   | S  | A11y polish: keyboard support in edit mode, screen-reader chart labels, color-blind mode honored, axe zero criticals. |

Total: ~10–12 sessions if everything is smooth, more realistically
12–15 with cleanup commits and surprise issues. Plan to deliver R0–R5
across the first 5–6 sessions, R6 across the next 3–4, and R7–R9 in
the final 3.

## Sequencing notes

- R0 and R1 are gated by the column migration — must land first.
- R2/R3/R4 are independent within themselves but share the
  `app/services/reports/` infra; build the comparison-period helper in
  R2 so R3/R4 reuse it.
- R5 lands the frontend shell with stub widgets; R6 fills in real
  widget components in three logical batches.
- R7 (CSV) and R8 (landing demo) are independent of each other; pick
  whichever fits the session better.
- R9 is the cleanup pass — keep it last.

## Backwards compatibility

The existing `/api/v1/reports/*` endpoints (`kpi-summary`,
`leaderboard`, etc.) are still consumed by the salesperson dashboard
(`useKpi.ts`) and tests. The new widget endpoints live under
`/api/v1/reports/widgets/`, parallel to the legacy ones. We keep the
legacy endpoints intact through the whole phase. After R6 we may
delete `ReportsPage.tsx`'s old internal state if the new component
fully replaces it; the salesperson dashboard's `kpi-summary`
endpoint stays untouched.

## Open questions for the user (none blocking R0)

- The brief specifies `react-grid-layout`; flagging that the package
  is unmaintained-but-stable. ADR will document the trade-off.
- The default-layout 8 widgets fit in 12 grid cols across 3 rows
  (h=2, h=4, h=4 = 10 row-units). Row height 64px = 640px tall
  before chrome — reasonable for desktop but pushes mobile-stack
  height notably. R5 will verify.

Now starting R0.1.
