# Editable home dashboard — implementation progress

**Branch:** `editable-dashboard` · **Spec:** `docs/superpowers/specs/2026-07-13-editable-home-dashboard-design.md` (approved)
**Verifier:** Playwright (owner chose). Login: eva@demo.cz per `.claude/skills/running-simplecrm/SKILL.md`.

## Done (committed)

- [x] `1c0e726` spec
- [x] `e02b181` backend: `users.home_dashboard_config` JSONB + migration `c7d8e9f0a1b2` (applied to dev DB), `app/schemas/home_dashboard.py` (union of 12 report configs + 10 home types; mobileOrder subset/dup validation), `app/services/home_dashboard.py` (role-aware default), `GET/PUT/DELETE /api/v1/users/me/home-dashboard`, `date_preset` on `WidgetConfigBase` (storage-only, serializes null on reports responses — expected), tests `test_home_dashboard.py`. Full backend suite after: **766 passed**.
- [x] `5a1ff17` shared FE module `frontend/src/components/widget-dashboard/`: WidgetGrid<W> (generalized `widgets` prop, structural types), useDashboardEditor<C> ({loaded,onSave,onReset,confirmReset} → {isEditMode,working,setDraft,enterEdit,cancel,save,reset}), **WidgetPicker** ({open,onClose,groups,onAdd}, items {type,label,description,icon,unique,added,disabled}, stays open after add), **MobileWidgetList** ({items:[{id,node}],order,onReorder,isEditMode}, long-press 250ms + 44px up/down) + `deriveMobileOrder`, WidgetFrame (ns → widgets), new `widgets` i18n ns (editor./picker./mobileList./widgetFrame.*), reports catalog `app/reports/dashboard/reportsWidgetCatalog.ts`, picker wired into ReportsPage. Full vitest 217 pass, tsc, i18n:check green.
- [x] `23ca69c` AddDealModal: always-visible "+ Nová firma" toggle (clears companyId on open — conflict fix), key `addDealModal.newCompanyToggle`.
- [x] `298fdca` regenerated `api.generated.ts` (home-dashboard endpoints, date_preset).

- [x] `6aae7ab` phase 2: DashboardPage rework (grid + picker + quick actions incl. EventFormModal deal picker for unbound create, per-widget date-preset popover, mobile reorder) + orchestrator cleanups (onConfigClick threaded through WidgetByType/renderers instead of the positional gear overlay; InviteTeammatesCard mt-8 dropped with the [&>section] hack). FE checks after: tsc OK, vitest 251 pass, i18n parity OK.

## In flight

- [ ] **Playwright verification agent** (opus, shared browser): desktop edit cycle, mobile 390px, quick actions, AddDealModal toggle, both themes, reports regression, console; instructed to reset eva's layout to default at the end. Screenshots in session scratchpad.

## Remaining

- [ ] Fix verification findings, re-verify, final summary. Merge decision is owner's (finishing-a-development-branch).

## Known accepted trade-offs (from phase-2 agent)

- EventFormModal deal picker searches the latest 100 deals client-side (GET /deals has no search param yet).
- Date-preset gear is edit-mode-only, saved with Uložit (no view-mode immediate PUT).

## Env notes

- Dev backend runs with --reload → already serving new endpoints; frontend dev server on :5173.
- Backend-importing commands need host-mode env prefix (see CLAUDE.md).
- mobileOrder may be `[]` on saved layouts → client derives from (y,x); only role-aware default populates it.
