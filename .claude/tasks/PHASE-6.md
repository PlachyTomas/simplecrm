# Phase 6 (tasks 6.1 + 6.2 + 6.4) — KPI endpoint + dashboard

Backend `GET /api/v1/reports/kpi-summary` returns four numbers scoped to
the caller's visibility:
- `open_deal_count` / `open_pipeline_value` (sum of open deals in the org
  currency; cross-currency deals contribute to count but not value).
- `won_this_month_count` / `won_this_month_value` (deals with
  `closed_at >= start-of-UTC-month` in a `stage_type=won` stage).

Frontend replaces the old AppHome stub with `DashboardPage` at `/app`:
- 4 KPI cards; money formatted via `Intl.NumberFormat` with the org's
  currency.
- One card uses the neon-lime highlight for the won-deals accent per
  ui-design §4.2.

Manager-specific view (6.3: leaderboard / velocity charts) is deferred;
this minimal dashboard serves every role and satisfies the Phase 6 exit
criterion of a real dashboard rendering KPIs.
