# CRM reports — market research & gap analysis

**Date:** 2026-07-20
**Status:** research complete — no implementation started
**Question:** what kinds of reports should SimpleCRM be able to generate?
**Method:** internal audit of the shipped reporting surface + data model, plus one web-research pass over Pipedrive, HubSpot, Zoho, Freshsales, monday CRM and the Czech players Raynet and eWay-CRM, plus practitioner sources on which reports SMB teams actually use.

---

## 1. Where SimpleCRM stands today

Shipped on `/app/reports`: an editable widget dashboard (12 widgets: pipeline value, deals won, win rate, avg deal size, sales cycle length, lead→deal conversion, new companies, stale deals, companies at risk, lost reasons breakdown, rep activity, sales leaderboard), team-vs-team leaderboard, the salesperson "Moje výsledky" rollup, global date/team/owner filters, CSV export. The v1 brief (`docs/prompts/REPORTS_TASK.md`) explicitly cut forecasting, goals, scheduled reports, custom builders, drilldowns and sharing.

**Parity verdict:** strong. Of the market's five high-priority report categories (pipeline/deal performance, win-loss analysis, rep & team performance, activity, forecasting), SimpleCRM fully covers the first four. Against Raynet's five core "Analýzy", SimpleCRM matches three (deal counts, pipeline, sales by rep) and lacks two: **Odhad prodeje** (revenue forecast) and **Prodej podle produktů** (sales by product — blocked on a products model we don't have).

## 2. The gaps, ranked by market priority × feasibility

### 2.1 Revenue forecast — the one true high-priority gap

Every researched product ships a forecast; even Raynet has "Odhad prodeje". The v1 cut is no longer defensible at Czech-market parity. Two SMB-friendly forms, both feasible **with zero schema changes**:

- **Weighted pipeline** — `Deal.value × (probability_override ?? Stage.default_probability)`. The probability columns already exist and are unused by any report.
- **Close-date forecast** — open-deal value bucketed by `expected_close_date` month. The v1 brief called this field unreliable; mitigate with an explicit "bez termínu" bucket, which doubles as a data-hygiene nudge.

Premium versions elsewhere (forecast categories, rep commit/best-case, AI scoring) are not worth chasing — process overhead for small teams.

### 2.2 Goals / quota attainment

Offered by every competitor, and practitioner sources are unanimous that quota-vs-actual is the report both reps and managers actually open weekly. Needs a new small model (target per rep/team/period, admin-set) — the only recommended item requiring new capture. Renders as progress meters in "Moje výsledky" and a manager widget. Also unlocks **pipeline coverage** (open pipeline ÷ quota, the ~3–4× rule managers watch as a leading indicator).

### 2.3 Stage funnel: per-stage conversion + time-in-stage

The dashboard shows point-in-time totals but can't tell the drop-off story (Pipedrive's Deal Conversion / Deal Duration). Stage transitions are already logged as `ActivityType.stage_change` with a JSONB payload, so both widgets are aggregation-only: stage→stage conversion %, and avg days-in-stage (bottleneck finder). If JSONB queries get heavy, a dedicated `deal_stage_transitions` table can come later — the data exists either way.

### 2.4 Campaign performance report

`EmailCampaign` already stores total/sent/failed/skipped and per-recipient rows — no report reads them. A campaign-list report (delivery breakdown, per-recipient drill) is the cheapest item on this list. Opens/clicks would need tracking-pixel infra — defer; delivery-only reporting is a legitimate v1.

### 2.5 Won vs. paid (cash view)

`Deal.is_paid`/`paid_at` came from owner feedback (the pipeline checkbox) and no report uses them. "Vyhráno vs. skutečně zaplaceno" per period/rep is a real SMB pain point no competitor covers at this simplicity. Zero schema changes.

### 2.6 Pool & claim reports — the differentiator

No competitor has SimpleCRM's shared-pool/claim model, so no competitor can ship: claimed vs. unclaimed pool coverage, locks expiring this week, companies freed/reassigned per period (`ownership_history` has assigned/released/reason), claim→deal conversion. ARES data (industry, city, legal form) additionally enables firmographic segmentation widgets for free. Uniquely defensible reporting.

## 3. Delivery mechanisms (how reports reach people)

| Mechanism | Market status | Recommendation |
|---|---|---|
| Editable widget dashboard | Universal table stakes | ✅ shipped |
| CSV export | Universal table stakes | ✅ shipped; add **XLSX** (small lift, commonly expected) |
| **Scheduled email digest** | Common, usually paid-tier | **Build.** Weekly Monday summary to managers/reps. SMTP infra exists; practitioner finding: adoption comes from operating rhythm, not features — a pushed digest creates the rhythm. Competitors tier-gate this, so it reads premium at our price. |
| PDF export of dashboard | Common | Cheap for us — WeasyPrint is already in the stack for invoicing. Nice-to-have after the digest. |
| Saved filter sets | Czech-market expectation (Raynet's saveable analyses) | Light version: named saved filter combinations on the reports page. Far cheaper than a report builder. |
| Custom report builder | Common but tier-gated everywhere | ❌ keep cut — fixed catalog + filters is the right SMB shape |
| BI embedding / share links | Enterprise & eWay pattern | ❌ keep cut |

## 4. Keep cut (market evidence supports the v1 decisions)

- **Custom metrics / formula builders, SQL** — tier-gated power-user features; wrong audience.
- **AI predictive scoring / deal health** — premium AI elsewhere (Freddy, monday AI); don't build before basic forecasting exists.
- **Historical pipeline snapshots / trend-over-snapshot reports** — advanced, premium-gated; date-range filters cover SMB needs.
- **Product revenue reports** — blocked on a products/line-items model. Revisit only if the payments track adds one (then "Prodej podle produktů" closes the last Raynet parity gap).
- **Public dashboard sharing** — no SMB pull found.

## 5. Design guardrails from practitioner sources

- Default layouts should stay at **~7 metrics** — 40-widget walls stop being read.
- Put **leading indicators** (new pipeline created, early-stage conversion, pipeline coverage) visually above **lagging** ones (win rate, revenue) — win rate drops only after the deals are already lost.
- Persona split is right already: reps live in pipeline + personal quota + today's tasks ("Moje výsledky"), managers in team attainment + at-risk deals + rep trends.
- A metric earns a slot only if it triggers a specific action; raw activity counts alone are vanity.

## 6. Suggested build order

1. **Forecast widgets** (weighted pipeline + close-date buckets) — highest market priority, zero schema change, closes the Raynet gap.
2. **Campaign performance report** — cheapest, data already captured.
3. **Won vs. paid widget** — zero schema change, uses owner-requested field.
4. **Goals + pipeline coverage** — one new table, biggest weekly-usage payoff.
5. **Stage funnel + time-in-stage** — aggregation over existing activity log.
6. **Scheduled email digest** — delivery-side differentiator on existing SMTP.
7. **Pool/claim + ARES segmentation widgets** — the moat nobody can copy.

## 7. Competitor snapshot (reference)

| Product | Notable | Gating |
|---|---|---|
| Pipedrive Insights | Deal conversion/duration/products, revenue forecast, goals | Forecast Premium+; Campaigns paid add-on |
| HubSpot | Sales analytics suite, forecast tool, quota attainment | Forecast & multi-goals Pro+ |
| Zoho CRM | Summary/matrix reports, funnel, **scheduled email reports** | Counts & Analytics scale with tier |
| Freshsales | Widget report builder, Freddy AI deal health | Advanced analytics higher tiers |
| monday CRM | 30+ widgets, weighted forecast, AI win-likelihood | Widgets/AI scale Pro+ |
| Raynet (CZ) | Počet OP, Pipeline, Prodej podle produktů/obchodníků, **Odhad prodeje**, saveable filtered analyses | Reporting core, not upsold |
| eWay-CRM (CZ) | Outlook-embedded reports + free Power BI dashboards | Depth delegated to Power BI |

Full source list (21 URLs: product docs + practitioner guides) available in the research transcript; key ones — Pipedrive KB insights articles, HubSpot knowledge base (sales analytics, forecast, goals), Zoho report-scheduling docs, raynet.cz/know-how analyses page, eWay Power BI KB, Improvado/Sybill/rework dashboard guides.
