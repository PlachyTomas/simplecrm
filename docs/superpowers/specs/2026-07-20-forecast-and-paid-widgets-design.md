# Forecast & won-vs-paid report widgets — design

**Date:** 2026-07-20
**Source:** `docs/superpowers/reviews/2026-07-20-crm-reports-research.md` (owner: "Add it, when it makes sense add a widget to display it as well (ie won vs paid, prediction etc)")
**Scope:** the three zero-schema-change widgets from the research build order. Goals/quota (new table), email digest (infra), stage funnel and pool/claim widgets are **not** in this spec — follow-ups.

## What ships

Three new widget types in the existing Reports widget catalog, available on both the Reports dashboard and the editable home dashboard (both catalogs derive from the same union — no extra home work beyond union membership):

### 1. `weighted_pipeline` — Vážená hodnota pipeline (KPI tile)

Sum of `Deal.value × p/100` over **open** deals **created in the global date window**, where `p = Deal.probability_override ?? Stage.default_probability`. Scoping (org currency only, team/owner filters, created_at window) mirrors `pipeline_value` exactly so the two tiles pair 1:1 and weighted ≤ unweighted always holds. Previous-period comparison like `pipeline_value`. No config beyond base; no sparkline.

Response: `{ value, currency, open_value (unweighted sum for the hint), comparison }`.

### 2. `sales_forecast` — Odhad prodeje (bar chart)

The Raynet-parity forecast: **all currently-open** deals (org currency, team/owner scope) bucketed by `expected_close_date`:

- `overdue` — expected close before today
- one bucket per month, current month → +5 (fixed 6-month horizon, YAGNI)
- `later` — beyond the horizon (so totals always reconcile)
- `no_date` — deal has no expected close date (doubles as a data-hygiene nudge)

**Deliberately ignores the global date range** — a forecast is forward-looking; the widget description says so ("z aktuálně otevřených obchodů"). Each bucket carries `count`, `value`, and `weighted_value` (same probability rule as widget 1); config `weighted: bool = false` picks which series the bars show. FE renders month buckets always (an empty month is information), hides `overdue`/`later`/`no_date` rows when zero. Bucket labels client-side via locale (month names; "Po termínu"/"Později"/"Bez termínu").

Response: `{ buckets: [{ kind: "overdue"|"month"|"later"|"no_date", year_month: str|null, count, value, weighted_value }], currency, total_value, total_weighted_value }`.

### 3. `won_vs_paid` — Vyhráno vs. zaplaceno (KPI tile)

Over deals **won in the window** (`stage_type=won`, `closed_at` in window — mirrors `deals_won` scoping, org currency): `won_value`, `paid_value` (`is_paid = true`), `unpaid_value`, `paid_pct` (null when nothing won), `won_count`, `paid_count`. Uses the owner-requested `is_paid` pipeline checkbox. No comparison (previous-period paid-share is ambiguous — deals get paid later), no sparkline, no config.

KPITile: primary = `paid_value` (money), secondary = `won_value`, hint = "{paid_count} z {won_count} obchodů zaplaceno". Empty state when `won_count == 0`.

## Integration points (the full checklist per widget)

Backend: config schema in `schemas/reports/widgets/<type>.py` → both unions (`schemas/reports/dashboard.py`, `schemas/home_dashboard.py`) + `WidgetType` literal + `__init__` exports → response models in `schemas/reports/responses.py` → service in `services/reports/<type>.py` → endpoint in `api/v1/reports_widgets.py` (same `require_role(manager)` + `_enforce_widget_scope` guard as every widget) → CSV branch + cs label in `services/reports/csv_export.py` → tests in `backend/tests/api/v1/test_reports.py` mirroring existing widget tests.

Frontend: regen `api.generated.ts` from the running server → `WidgetType` + `WIDGET_LABEL_KEY` in `reports/dashboard/types.ts` → renderers (2 in `kpi-widgets.tsx`, 1 in `chart-widgets.tsx`) → `WidgetByType` cases → catalog (`KPI_TYPES` += weighted_pipeline, won_vs_paid; `ANALYTICS_TYPES` += sales_forecast; icons Scale / CalendarClock / Wallet; description keys) → labels + descriptions + hints in `locales/{cs,en}/reports.json` (`pnpm i18n:check`) → vitest for the new renderers (mobile path — jsdom/ResizeObserver gotcha).

Home dashboard: works automatically — picker groups reuse `REPORTS_KPI_TYPES`/`REPORTS_ANALYTICS_TYPES`, `HomeReportWidget` delegates to `WidgetByType`, eligibility default-true matches the other non-team-scoped report widgets (salesperson 403 handling already exists via `HomeWidgetUnavailable`).

Default layout (`default_layout.py`): **unchanged** — the 8-widget starter set stays; new widgets are picker-only.

## Non-goals

Sparkline series for the new widgets; per-widget drilldowns; configurable forecast horizon; comparison on won_vs_paid; changes to the CSV export UI (new types just render sections when present); XLSX/PDF export; anything from research build-order items 4–7.

## Testing

- BE: per-endpoint tests — happy path with seeded deals (probability mix incl. override, expected dates across overdue/month/later/no-date, paid mix), window/scope filters, org-currency exclusion, manager-role gate, empty-org zeros/nulls.
- FE: vitest render tests per widget (loading/error/empty/data), catalog completeness test if one exists for existing types.
- Live: playwright — add all three on `/app/reports`, screenshot, zero console errors.
