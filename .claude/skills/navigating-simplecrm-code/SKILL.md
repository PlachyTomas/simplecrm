---
name: navigating-simplecrm-code
description: Use when starting any SimpleCRM coding task — locating where code lives, extending an existing system (widgets, modals, reports, i18n, API), or before exploring the repo with greps. Read this BEFORE scouting from scratch.
---

# Navigating SimpleCRM code

House map + patterns so sessions don't rediscover the repo. Boot/login/test commands → `running-simplecrm` skill. Visual rules → `ui-design` skill. Env gotchas → CLAUDE.md. Check `docs/superpowers/specs/` + `plans/` for prior design docs/trackers before re-deriving intent.

## Map

| What | Where |
|---|---|
| API routers | `backend/app/api/v1/<feature>.py`, mounted in `api/routes.py` (most behind `PROTECTED_DEPS`) |
| Pydantic schemas | `backend/app/schemas/` — reports widgets split per-type in `schemas/reports/widgets/*.py` (`_base.py` = `WidgetConfigBase`) |
| DB models | `backend/app/db/models/*.py` (one file per table) |
| Services | `backend/app/services/` — some are packages (`services/reports/__init__.py` + `default_layout.py`), not single files |
| Migrations | `backend/alembic/versions/YYYYMMDD_HHMM_slug_hash.py` |
| BE tests | `backend/tests/api/v1/test_<feature>.py` |
| FE features | `frontend/src/app/<feature>/` — page + `use<X>.ts` react-query hooks + modals co-located |
| Shared widget system | `frontend/src/components/widget-dashboard/` (WidgetGrid, WidgetFrame, WidgetPicker, MobileWidgetList, useDashboardEditor) |
| Shared UI / lib | `components/ui/` (KpiCard, empty-state); `lib/` (apiFetch, useModalDialog, toast, format, testids.ts, i18n) |
| i18n catalogs | `frontend/src/locales/{cs,en}/<ns>.json`; ns registered in `locales/cs/index.ts`; shared widget chrome = `widgets` ns |
| Generated API types | `frontend/src/types/api.generated.ts` → `components["schemas"][...]` |
| E2E | `frontend/tests/e2e/` (NOT `frontend/e2e/`), locale pinned cs-CZ |

## House patterns (mirror these, don't invent)

- **API flow:** Pydantic (camelCase via `Field(alias=...)`, `model_dump(by_alias=True, mode="json")`) → regen types with `BACKEND_OPENAPI_URL=http://localhost:8000/api/v1/openapi.json pnpm types:generate` (backend must run the new code; dev uvicorn has `--reload` when owner-started) → per-feature hook file using `apiFetch` + `accessToken`.
- **Per-user JSON prefs:** JSONB column on `User` (`reports_dashboard_config`, `home_dashboard_config`, `ui_state`) + GET/PUT/DELETE endpoint; GET swallows empty/invalid to a computed default. Copy `api/v1/home_dashboard.py`.
- **Widget type (new):** BE config class inheriting `WidgetConfigBase` (`type` Literal discriminator, `extra="forbid"`) → add to union (+ default layout/service) → FE renderer dispatched in `WidgetByType`/`HomeWidgetByType` → catalog entry (`reportsWidgetCatalog.ts` / `homeWidgetCatalog.ts`) → labels+descriptions cs & en.
- **Modals:** `useModalDialog` (focus trap/Escape/restore); **canonical copy source: `app/deals/AddDealModal.tsx`**; inline sub-forms like its new-company block; per-entity create modals exist: AddDealModal, AddCompanyModal, AddContactModal, EventFormModal.
- **Drag & drop:** `@dnd-kit` for lists (PipelinePage, MobileWidgetList — long-press 250ms on touch); `react-grid-layout` v2.2 for 2D grids (`useContainerWidth` hook, no `WidthProvider`; mobile <768px bypasses the lib with a plain stack).
- **Strings/ids:** every UI string → both catalogs + `pnpm i18n:check`; every interactive element used in tests → `lib/testids.ts`.

## Gotchas that cost real time

- `calendar_events.deal_id` is NOT NULL — no deal-less events; EventFormModal needs a deal (picker ships for unbound create).
- `GET /api/v1/deals` has **no search param** — pickers fetch a page (limit 100) and filter client-side.
- jsdom lacks `ResizeObserver` → react-grid-layout can't render in vitest; test the mobile (<768px) path instead.
- Run FE checks with `npx` (`npx vitest run`, `npx tsc -b --noEmit`) — `pnpm vitest`/`typecheck` intermittently die in deps-status-check.
- InviteTeammatesCard self-gates (admin/`can_invite`, hides when org full) — wrappers shouldn't re-implement its logic.
- Reports widget data endpoints `/reports/widgets/*` all take `from`/`to` (+ optional team/owner guarded by `assert_report_scope`); date presets resolve client-side (`resolvePreset`).
- Playwright MCP = ONE shared browser; never two browser agents in parallel.

## Before coding checklist

1. Grep for a sibling feature doing the same thing; mirror it.
2. Changing backend response/route? Regen types before FE work.
3. New strings in BOTH catalogs; new controls in testids.
4. Check MEMORY.md index + repo tracker docs for in-flight work on your surface.
