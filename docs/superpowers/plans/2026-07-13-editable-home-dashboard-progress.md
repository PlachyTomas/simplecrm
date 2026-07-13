# Editable home dashboard — implementation progress

**Branch:** `editable-dashboard` · **Spec:** `docs/superpowers/specs/2026-07-13-editable-home-dashboard-design.md` (approved)
**Verifier:** Playwright (owner chose). Login: eva@demo.cz per `.claude/skills/running-simplecrm/SKILL.md`.

## Done (committed)

- [x] `1c0e726` spec
- [x] `e02b181` backend: `users.home_dashboard_config` JSONB + migration `c7d8e9f0a1b2` (applied to dev DB), `app/schemas/home_dashboard.py` (union of 12 report configs + 10 home types; mobileOrder subset/dup validation), `app/services/home_dashboard.py` (role-aware default), `GET/PUT/DELETE /api/v1/users/me/home-dashboard`, `date_preset` on `WidgetConfigBase` (storage-only, serializes null on reports responses — expected), tests `test_home_dashboard.py`. Full backend suite after: **766 passed**.
- [x] `5a1ff17` shared FE module `frontend/src/components/widget-dashboard/`: WidgetGrid<W> (generalized `widgets` prop, structural types), useDashboardEditor<C> ({loaded,onSave,onReset,confirmReset} → {isEditMode,working,setDraft,enterEdit,cancel,save,reset}), **WidgetPicker** ({open,onClose,groups,onAdd}, items {type,label,description,icon,unique,added,disabled}, stays open after add), **MobileWidgetList** ({items:[{id,node}],order,onReorder,isEditMode}, long-press 250ms + 44px up/down) + `deriveMobileOrder`, WidgetFrame (ns → widgets), new `widgets` i18n ns (editor./picker./mobileList./widgetFrame.*), reports catalog `app/reports/dashboard/reportsWidgetCatalog.ts`, picker wired into ReportsPage. Full vitest 217 pass, tsc, i18n:check green.
- [x] `23ca69c` AddDealModal: always-visible "+ Nová firma" toggle (clears companyId on open — conflict fix), key `addDealModal.newCompanyToggle`.
- [x] `298fdca` regenerated `api.generated.ts` (home-dashboard endpoints, date_preset).

## In flight

- [ ] **Phase 2 agent (opus)**: DashboardPage rework per spec §3 — useHomeDashboard hook trio (key `["home","dashboard-config"]`), homeWidgetCatalog (gating: invite → admin/can_invite; velocity/leaderboard/team analytics → admin/manager/org-flag), HomeWidgetByType (kpi_* → KpiCard, action_* → QuickActionTile, invite wrapper, velocity port, report types → WidgetByType with synthesized `{dateRange:{preset: config.date_preset ?? 'last_30_days'}}`), quick-action flows (AddDealModal/AddCompanyModal/AddContactModal/EventFormModal), **EventFormModal gains searchable deal picker when no dealId**, per-widget date-preset config popover, mobile via MobileWidgetList persisting mobileOrder, i18n dashboard+deals ns, vitest. If the session died mid-agent: `git status` shows its uncommitted output; if absent/partial, relaunch one opus agent with spec §3 + the module API summary above.

## Remaining after phase 2

- [ ] Review phase-2 diff (orchestrator), full FE checks (npx vitest run, npx tsc -b --noEmit, pnpm i18n:check), commit.
- [ ] Playwright verification, ONE agent (shared browser): desktop edit cycle (picker add, drag, resize, remove, save, reload persists), 390px mobile (stack order, reorder, bottom-sheet picker), quick actions incl. EventFormModal deal picker, AddDealModal "+ Nová firma" (ARES + manual), both themes, console clean (React Router future-flag warnings + favicon 404 = known noise). Screenshots → scratchpad, never repo.
- [ ] Fix findings, re-verify, final summary. Merge decision is owner's (finishing-a-development-branch).

## Env notes

- Dev backend runs with --reload → already serving new endpoints; frontend dev server on :5173.
- Backend-importing commands need host-mode env prefix (see CLAUDE.md).
- mobileOrder may be `[]` on saved layouts → client derives from (y,x); only role-aware default populates it.
