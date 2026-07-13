# Editable home dashboard — design

**Date:** 2026-07-13 · **Status:** approved (owner, in-chat) · **Verifier:** Playwright

## Goal

Rework the home dashboard (`/`, `DashboardPage`) into an editable widget dashboard: users
pick which stats they see, add/remove/reorganize widgets, and get quick-action widgets
(new deal, company, contact, activity). Layout persists per user on the backend. Editing
works on touch/mobile, not just desktop.

Bonus fix (owner request): in AddDealModal ("Přidat obchod"), creating a new company is
only reachable when the search matches zero companies — make it always reachable.

## Decisions (owner Q&A)

- **Architecture:** shared infra, two dashboards. Extract the Reports widget system into a
  shared module; home gets its own config, endpoints, and catalog. Reports stays as-is
  (plus gains the new add-widget picker, which doesn't exist anywhere today).
- **Catalog:** home set (4 KPI tiles, invite card, leaderboard, velocity) + all 12 report
  widgets + 4 quick actions.
- **Quick actions:** individual small tiles — new deal, new company, new contact, new
  activity/event.
- **Filters:** no global filter bar on home; per-widget date preset (default last 30 days)
  via the existing config gear.
- **Default layout:** today's page + the new-deal quick tile (role-aware: invite card for
  admins/`can_invite`, leaderboard+velocity for managers/admins/org-flag).
- **Mobile:** full editing on touch — add/remove + reorder via a sortable vertical list;
  desktop keeps the 2D grid.

## 1. Shared widget-dashboard module (frontend)

Move from `frontend/src/app/reports/dashboard/` to `frontend/src/components/widget-dashboard/`:
`WidgetGrid`, `WidgetFrame`, `widget-grid.css`, `widgetId.ts`, plus new shared pieces:

- `useDashboardEditor` — the edit-mode draft state currently inlined in `ReportsPage`
  (draft init, Escape-cancels, save/cancel/reset handlers).
- `WidgetPicker` — **new**; house-pattern modal (bottom sheet on mobile). Generic: takes a
  catalog prop (`{type, label, description, icon, unique, added, disabled}` entries,
  grouped). Adding appends below the layout and to the end of `mobileOrder`. Unique
  widgets show an "added" state; analytics widgets are duplicable.
- `MobileWidgetList` — **new**; the <768px rendering + edit mode: ordered by
  `mobileOrder` (fallback: desktop `(y,x)`; ids missing from `mobileOrder` append in
  `(y,x)` order), dnd-kit sortable vertical list (long-press activation ~250ms so drag
  doesn't fight scroll) plus up/down buttons for accessibility. Touch targets ≥44px.
  Mobile reorder never mutates desktop positions, and vice versa.

Widget renderers stay domain-owned (`app/reports/dashboard/widgets/` keeps the 12; home
adds its own under `app/dashboard/widgets/`). Renderers keep using the `reports` i18n
namespace — namespaces aren't page-scoped. `ReportsPage` re-imports from the new module
and gets the picker button in edit mode; no other Reports behavior change.

## 2. Backend — layout persistence

Mirrors the reports pattern (`reports_dashboard_config`) exactly:

- **Column:** `users.home_dashboard_config` JSONB, NOT NULL, server_default `'{}'` +
  Alembic migration (naming: `20260713_HHMM_home_dashboard_config_<hash>.py`).
- **Schemas:** `backend/app/schemas/home_dashboard.py` — `HomeDashboardConfig`
  (`version: 1`, `widgets: list[HomeWidgetEntry]`, `mobile_order` serialized as
  `mobileOrder: list[str]`), `HomeWidgetEntry` (id ≤64 chars, position, config).
  `HomeWidgetConfig` = discriminated union (`type`) of the existing 12 report configs +
  new configs inheriting `WidgetConfigBase`: `kpi_open_deals`, `kpi_pipeline_value`,
  `kpi_won_month`, `kpi_revenue_month`, `action_new_deal`, `action_new_company`,
  `action_new_contact`, `action_new_activity`, `invite_teammates`, `velocity`.
  Validation identical to reports (12-col grid, no overlap, ≤20 widgets,
  `extra="forbid"`) plus: `mobileOrder` entries must be a subset of widget ids
  (unknown id → 422), no duplicates.
- **Per-widget date preset:** optional `date_preset` field on `WidgetConfigBase`
  (Literal of the non-custom presets; default None → client treats as last_30_days).
  Storage only — resolution to from/to stays client-side (`resolvePreset`). Reports UI
  ignores it (global bar wins there).
- **Endpoints:** `GET/PUT/DELETE /api/v1/users/me/home-dashboard` in new router
  `backend/app/api/v1/home_dashboard.py`, mounted with `PROTECTED_DEPS`. GET returns the
  role-aware default when the column is empty `{}` or fails validation (same
  swallow-and-default behavior as reports); DELETE resets to `{}` (204).
- **Default layout:** `backend/app/services/home_dashboard.py`, computed per-user at GET:
  - First row: the 4 KPI tiles (w=3, h=2 each, y=0).
  - Next row: `action_new_deal` (w=3, h=1, y=2).
  - `invite_teammates` (w=12, h=3) — only if admin or `can_invite`.
  - `sales_leaderboard` (w=6, h=4) + `velocity` (w=6, h=4) — only if admin/manager or
    `organization.show_leaderboard_to_salespeople`.
  - `mobileOrder` = that same sequence. Stable ids `default_<type>`.
- **No new data endpoints.** KPI tiles read `/api/v1/reports/kpi-summary` (React Query
  dedupes the four tiles into one request), velocity reads `/api/v1/reports/velocity`,
  analytics widgets read `/api/v1/reports/widgets/*` (existing scope guard applies).

## 3. Home page (frontend)

`DashboardPage` keeps the fixed welcome header (name + month line) above the grid — the
header is not a widget; the static KPI section, `InviteTeammatesCard` embed, and
`ManagerWidgets` are replaced by the grid. Edit-mode header identical to Reports:
*Upravit rozložení* → *Přidat widget / Obnovit výchozí / Zrušit / Uložit*, Escape cancels.

- **Hooks:** `useHomeDashboardConfig` / save / reset trio mirroring
  `useDashboardConfig.ts`, keyed `["home", "dashboard-config"]`.
- **`HomeWidgetByType`** maps: report types → existing report renderers with
  `globalFilters` synthesized from the widget's `date_preset` (default last_30_days), no
  team/owner scope; `kpi_*` → `KpiCard`-based tiles (labels/hints reuse existing
  `dashboard` ns keys; revenue tile keeps `accent="highlight"`); `action_*` →
  `QuickActionTile`; `invite_teammates` → wrapped `InviteTeammatesCard`; `velocity` →
  list renderer reusing `useVelocity` (respects `date_preset`).
- **Quick-action tiles:** `bg-surface` card, Lucide icon in `bg-accent-subtle` box +
  label; whole tile is a button; indigo only. Desktop 3×1; full-width row on mobile.
  Opens: `AddDealModal` / `AddCompanyModal` / `AddContactModal` / `EventFormModal`.
  `EventFormModal` gains an optional searchable deal picker, shown only in create mode
  without `dealId` (events are deal-bound, `deal_id NOT NULL` — no schema change).
- **Gating:** catalog hides ineligible widgets (invite → admin/`can_invite`; leaderboard
  + team analytics → admin/manager/org-flag). If a saved widget's data returns 403 (org
  toggled a flag later), render a quiet "Není dostupné" state; removable in edit mode.
- **Empty state:** grid-level empty state with an edit CTA (mirrors Reports).

## 4. AddDealModal fix

Replace the search-miss-only trigger: always-visible "+ Nová firma" ghost toggle under
the company field (hidden when `lockedCompany`), collapsed by default, opening the
existing inline subform (IČO→ARES autofill or manual entry). Typed search text carries
over as the company name. The search-miss inline prompt stays.

## 5. i18n

New `widgets` namespace (cs + en) for the shared module's chrome only: `widgetFrame.*`
(moved from `reports`), new `picker.*`, and the shared editor strings (`editLayout`,
`addWidget`, `resetLayout`, `resetConfirm`, `cancel`, `save`) — reports callsites update
to the moved keys. `widgetLabels.*` and `presets.*` stay in `reports` (used by both
pages via explicit ns). Home-specific widget labels, picker descriptions, quick-action
labels, and the "Není dostupné" state live in `dashboard`. All strings in both cs
(vykání) and en; `pnpm i18n:check` green. New interactive elements get `testids.ts`
entries.

## 6. Testing & verification

- **Backend:** tests mirroring the reports dashboard-config suite in
  `backend/tests/api/v1/` — validation (unknown type, overlap, >20 widgets, bad
  `mobileOrder`), role-aware defaults (salesperson vs admin vs manager), PUT/GET/DELETE
  roundtrip, `date_preset` accepted on report widget configs.
- **Frontend:** vitest for the config hooks, mobile order derivation + reorder logic,
  picker gating/uniqueness, `HomeWidgetByType` mapping; `tsc -b`; `i18n:check`.
- **Playwright (live):** desktop edit cycle (add via picker, drag, resize, remove, save,
  reload persists), 390px mobile (stack order, long-press/buttons reorder, add/remove,
  bottom-sheet picker), quick actions open their flows (deal picker in EventFormModal),
  AddDealModal "+ Nová firma" both paths (ARES + manual), both themes, console clean.
- Full suites green before done (host-mode env prefix per running-simplecrm skill).

## Out of scope

- Deal-less calendar events (schema change) — the deal picker in EventFormModal covers
  the quick action.
- Reports page changes beyond the shared-module re-imports and gaining the picker.
- Org-level/shared dashboards, dashboard templates, more widget types.
