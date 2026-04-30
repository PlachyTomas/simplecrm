# Manager statistics on `/app/reports` — task brief

**Date:** 2026-04-30
**Owner:** Claude
**Status:** ready to implement

## 1. Why

Managers in SimpleCRM oversee one or more teams (`Team.manager_user_id`, with a single user able to manage multiple teams). Today the Reporty page shows a per-salesperson leaderboard org-wide — there is no team-vs-team comparison and no way to drill into a single team. The leaderboard is also visible to every role unconditionally, which is the wrong default for teams with sensitive comp dynamics.

This work makes Reporty the primary stats surface for managers and admins:

- Adds a **team-vs-team** comparison block where the manager picks the metric.
- Adds **team drill-down** on the existing per-salesperson leaderboard.
- Adds a privacy toggle: **"Zobrazit obchodníkům žebříček"** in Settings → Oprávnění, defaulting to **OFF** for new orgs.
- When the toggle is off, salespeople still get value out of `/app/reports` via a new **"Moje výsledky"** personal-rollup section bound to the date range — including a **Nové firmy** count (companies the user added to the pipeline in the window).

The backend already has the right scoping primitives (`scope_by_owner`, `team_member_ids(user)`) — managers will automatically be scoped to their managed teams. The work is mostly *new aggregations* and *one new org setting*, not a rebuild.

## 2. Final UX (Reporty)

```
Reporty
[Od] [Do]                                  [Export CSV]

┌─ Žebříček týmů ────────────────────────────────────┐
│ Metric: [Hodnota vyhraných ▾]                       │
│ Bar chart: team_name vs metric                      │
│ Table: tým, manažer, počet členů, hodnota metriky   │
└─────────────────────────────────────────────────────┘
                                                  (admin: always; manager: their teams only; salesperson: hidden)

┌─ Žebříček obchodníků ──────────────────────────────┐
│ Tým: [Všechny týmy ▾]   ← drill-down filter         │
│ (existing per-user leaderboard)                     │
└─────────────────────────────────────────────────────┘
                                                  (admin: always; manager: scoped; salesperson: hidden when toggle OFF)

┌─ Moje výsledky ────────────────────────────────────┐  ← NEW, salesperson only
│ Nové firmy | Vyhrané obchody | Hodnota výhry        │
│ Konverze (won / closed) | Průměrný cyklus           │
└─────────────────────────────────────────────────────┘

┌─ Důvody prohry ─────────┐  ┌─ Rychlost pipeline ──┐
│ (existing)              │  │ (existing)            │
└─────────────────────────┘  └───────────────────────┘
```

Settings → **Oprávnění** tab gets a new admin-only toggle row above the existing read-only matrix:

> **Zobrazit obchodníkům žebříček** — když je vypnuto, obchodníci v Reportech vidí pouze své vlastní výsledky.

## 3. Definitions (shared with the API)

- **Lead / Nová firma** — a `Company` row whose `created_at` falls in the date window. Owner scope: for `my-summary` it's `Company.owner_user_id == current_user.id`; for any team rollup it's owner ∈ team members.
- **Vyhraný obchod** — `Deal` whose final stage is `stage_type = "won"` and `closed_at` falls in the window.
- **Konverze** — `won_count / (won_count + lost_count)` over deals closed in the window. Undefined if denominator is zero (return `null`).
- **Průměrný cyklus** — average `closed_at − created_at` in days for deals closed in the window.
- **Open pipeline value** — `SUM(value)` for deals where `closed_at IS NULL`, scoped to the window only by `created_at` (i.e. "still-open at end-of-window") for v1 simplicity.

## 4. Backend changes

### 4.1 Org-level setting

- New migration `phase4_org_show_leaderboard_to_salespeople`:
  - Add `organizations.show_leaderboard_to_salespeople BOOLEAN NOT NULL DEFAULT FALSE`.
  - Backfill existing rows to `FALSE`.
- `app/db/models/organization.py` — add the column.
- `app/schemas/organization.py` — add the field to `OrganizationOut`, `OrganizationSummary`, and `OrganizationUpdate`.
- `app/api/v1/organizations.py` — `PUT /organizations/current` already supports partial updates and is admin-gated; just add the field to the allowed update set.

### 4.2 Team leaderboard endpoint

`GET /api/v1/reports/team-leaderboard?from=&to=&metric=`

- `metric ∈ {won_value, won_count, open_pipeline_value, conversion_rate, avg_cycle_days}` (default `won_value`).
- Response: `{currency, from_date, to_date, metric, rows: [{team_id, team_name, manager_user_id, manager_name, member_count, won_count, won_value, open_pipeline_value, conversion_rate, avg_cycle_days}]}`.
- Returns all metrics in each row so the frontend can switch metrics without re-fetching.
- Aggregation: `GROUP BY team_id` over `Deal` joined to `User` on `Deal.owner_user_id`. Reuse the same closed/won/lost filters as `/leaderboard`.
- Apply `scope_by_owner` at the deal level (managers see only deals owned by users in their managed teams; admins see org-wide).
- Permission: gate with the new `require_leaderboard_visibility` (see §4.4).

### 4.3 Drill-down on existing user leaderboard

`GET /api/v1/reports/leaderboard` — add optional `team_id: UUID | None` query param.

- 404 (or 403) if the caller can't see that team — admins always pass; managers only for teams they manage; salespeople blocked at §4.4 anyway.
- Filters rows to `User.team_id == team_id`.

### 4.4 Visibility gate

New helper `require_leaderboard_visibility` in `app/core/deps.py`:

- Admin / manager → pass.
- Salesperson → pass iff `organization.show_leaderboard_to_salespeople is True`; else 403 with `{detail: "Leaderboard hidden by organization policy", code: "leaderboard_hidden"}`.

Apply to `/leaderboard` and `/team-leaderboard`. **Do not** apply to `/loss-reasons`, `/pipeline-velocity`, `/kpi-summary`, `/my-summary` — those stay accessible so a salesperson's `/app/reports` page still renders.

### 4.5 Personal rollup endpoint

`GET /api/v1/reports/my-summary?from=&to=`

Returns:

```json
{
  "currency": "CZK",
  "from_date": "...",
  "to_date": "...",
  "companies_added": 12,
  "deals_won_count": 4,
  "deals_won_value": 380000,
  "conversion_rate": 0.40,
  "avg_cycle_days": 17.5
}
```

- Scoped to `current_user.id` (`Company.owner_user_id`, `Deal.owner_user_id`).
- No role gate beyond `get_current_user` + the existing trial gate.

### 4.6 Tests

- `tests/api/v1/test_reports.py`:
  - Team-leaderboard: admin sees all teams, manager sees only their managed teams, salesperson 403 when toggle off / 200 when on.
  - User-leaderboard with `team_id`: manager allowed for their teams, 404 for others, filters correctly.
  - `my-summary`: scoped to caller; date range respected; `conversion_rate` is `null` when denominator is zero.
- `tests/services/test_permissions.py`:
  - `require_leaderboard_visibility` — admin/manager bypass; salesperson respects the org flag.

## 5. Frontend changes

### 5.1 Reporty page (`frontend/src/app/reports/ReportsPage.tsx`)

- New **`TeamLeaderboardSection`** above the existing user leaderboard. Metric `<select>` (Tailwind, same look as the existing date inputs). Bar chart reuses the leaderboard's existing horizontal-bar pattern — extract a shared `<RankedBars>` to avoid duplication.
- New **team filter** on the existing `LeaderboardSection`: "Všechny týmy" plus one option per team the caller can see (use the existing `useTeams()` hook from the Settings → Týmy tab). Selecting a team passes `team_id` to `useLeaderboard`.
- New **`MySummarySection`** rendered only when `currentUser.role === "salesperson"`. KPI tiles using the `KpiCard` component that we'll extract from `DashboardPage.tsx:34–56` to `frontend/src/components/ui/KpiCard.tsx`.
- Conditional rendering by role + org flag:
  - Team leaderboard: `role !== "salesperson"`.
  - User leaderboard: `role !== "salesperson" || org.show_leaderboard_to_salespeople`.
  - My results: `role === "salesperson"`.

### 5.2 Hooks (`frontend/src/app/reports/useReports.ts`)

- `useTeamLeaderboard({from, to, metric})`.
- `useMySummary({from, to})`.
- Extend `useLeaderboard` with optional `team_id`.

### 5.3 Settings → Oprávnění

In `frontend/src/app/settings/SettingsPage.tsx` `PermissionsSection`, add an admin-only toggle row at the top:

- Label: **"Zobrazit obchodníkům žebříček"**
- Helper: "Když je vypnuto, obchodníci v Reportech vidí pouze své vlastní výsledky."
- Wires to `PATCH /organizations/current` with `{show_leaderboard_to_salespeople: bool}`.

For non-admins, hide the toggle but keep the existing read-only matrix.

### 5.4 Dashboard widget

The condensed leaderboard widget in `DashboardPage.tsx` already hides for salespeople. Add the org-flag check so the behaviour is consistent with Reporty (admin/manager always; salesperson respects the toggle).

### 5.5 Generated types

Run `pnpm gen:api` after the backend is up so `frontend/src/lib/api.generated.ts` picks up the new fields and endpoints.

## 6. Critical files

**Backend**

- `backend/alembic/versions/<new>_phase4_org_show_leaderboard.py`
- `backend/app/db/models/organization.py`
- `backend/app/schemas/organization.py`
- `backend/app/schemas/reports.py`
- `backend/app/api/v1/reports.py`
- `backend/app/core/deps.py`
- `backend/tests/api/v1/test_reports.py`
- `backend/tests/services/test_permissions.py`

**Frontend**

- `frontend/src/app/reports/ReportsPage.tsx`
- `frontend/src/app/reports/useReports.ts`
- `frontend/src/components/ui/KpiCard.tsx` (extracted from `DashboardPage.tsx`)
- `frontend/src/app/DashboardPage.tsx`
- `frontend/src/app/settings/SettingsPage.tsx` (`PermissionsSection`)
- `frontend/src/lib/api.generated.ts` (regenerated)

**Reuse, don't reinvent**

- `scope_by_owner` / `team_member_ids` in `backend/app/core/scoping.py` — handles the manager-multi-team logic for free.
- `useTeams()` for the team-filter dropdown.
- The existing leaderboard bar-chart markup.

## 7. Verification

### Backend

- `cd backend && uv run alembic upgrade head` applies cleanly; flag defaults to `false`.
- `uv run pytest tests/api/v1/test_reports.py tests/services/test_permissions.py -v` is green.
- Manual curl as admin / manager / salesperson against `/team-leaderboard`, `/leaderboard?team_id=…`, `/my-summary`.

### Frontend (Playwright MCP)

1. Dev-login as **admin** of `QA Test Org`. Navigate `/app/reports`. Screenshot at 1280. Confirm Žebříček týmů + metric dropdown + Žebříček obchodníků (with team filter) + the existing two sections render.
2. Dev-login as a **manager** with two teams. Confirm only their two teams appear in Žebříček týmů, and the team filter on Žebříček obchodníků is limited to those two.
3. Dev-login as a **salesperson**. Confirm Žebříček týmů + Žebříček obchodníků are absent and Moje výsledky renders. Console clean.
4. As admin, go to Nastavení → Oprávnění, flip the toggle ON, log out, log back in as the same salesperson, confirm Žebříček obchodníků now renders.

Save screenshots to `qa-artifacts/2026-04-30/snapshots/` (e.g. `01-reports-admin-1280.png`, `02-reports-manager-1280.png`, `03-reports-salesperson-toggle-off-1280.png`, `04-settings-permissions-toggle-1280.png`).

## 8. Out of scope

- Trend over time / sparklines.
- Per-stage funnel breakdown per team.
- Stripe / billing wiring (QA-010).
- Invite flow (QA-011).
