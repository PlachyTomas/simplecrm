# Review-and-fix pass — deal-details-and-mails branch — TRACKER

Date started: 2026-07-08 · Session: ultracode review+fix of Opus's implementation
Status: **IN PROGRESS** — update the checklist below as steps complete; a fresh session
must be able to resume from this file alone.

## Mission

Opus implemented `docs/superpowers/specs/2026-07-08-deal-detail-mailing-activity-design.md`
(all 4 workstreams). Owner (Tomáš) is unhappy with the result. Review everything the branch
touched, fix all confirmed findings + the 5 named issues + approved new scope. Work fully
autonomously; verify with Playwright screenshots (CLAUDE.md rule).

## Owner's 5 named issues (must all be fixed)

1. **Detail dialogs not centered** (DealDetailDialog and possibly others).
2. **Disabled "Poslat e-mail" button has no explanation** — spec AC-3.1 required a tooltip
   ("Nejprve nastavte a ověřte SMTP v Nastavení → Integrace" + link). Verify it exists/works.
3. **Cannot add a deal from Firma detail** (Obchody tab has no "Přidat obchod") — NEW scope,
   not in the spec. Add it (reuse pipeline's AddDealModal with company preset).
4. **Activity feed confusing** — every row must clearly say WHAT happened and in WHICH deal
   ("Obchod „Acme": fáze Nabídka → Vyhráno"), who did it. NEW scope beyond spec: field-level
   **old→new diffs for deal edits and company edits** (rename = „Staré" → „Nové"), collapsible
   detail when many fields changed. Events/emails keep title/subject rows. Old activity rows
   keep their old payloads (no backfill of diffs).
5. **App logo ≠ landing logo** — sync `frontend/src/components/Logo.tsx` + `frontend/public/favicon.svg`
   to exactly match the landing logo in `frontend/src/marketing/LandingPage.tsx`.
   (App-brand redesign track stays ON HOLD.)

## Approved decisions (owner Q&A this session — do not re-ask)

- **Git:** baseline commit `614fc19` = Opus's work as-is. Fix in incremental commits on
  `deal-details-and-mails`. Branch had 0 commits ahead of main before that.
- **Activity depth:** old→new for deal + company edits (option a). Row context per issue 4.
- **Logo:** sync app to current landing logo; on-hold redesign track untouched.
- **Scope:** everything the branch touched — deal dialog, obchody table, mailing, activity
  feed + the screens they live on (pipeline, company detail, deals list). Spec compliance
  (all ACs) included. NOT a whole-app sweep.
- **Agents:** ultracode Workflow tool; subagents Opus max (never Fable), token-efficient,
  few agents. Main session orchestrates + dedups findings itself.

## Environment (verified this session)

- Postgres: **host Homebrew postgresql@16**, not Docker (no docker CLI on this machine).
  DB `simplecrm`, role `simplecrm`/`simplecrm`, already migrated to head `b8d2e1f3a4c5`.
- Backend: `cd backend && DATABASE_URL=postgresql+asyncpg://simplecrm:simplecrm@localhost:5432/simplecrm POSTGRES_HOST=localhost DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run uvicorn app.main:app --port 8000`
  (DYLD path is REQUIRED — WeasyPrint needs Homebrew glib; plain start crashes on libgobject).
- Frontend: `cd frontend && pnpm dev` → http://localhost:5173.
- DB has test data: 148 companies, 60 deals, 107 activities, 1 sent_email; existing users are
  `u-*@ex.cz` with unknown passwords → seed a fresh known-password user (see checklist).
- Playwright MCP available; invoke "use playwright mcp" explicitly on first call.

## Checklist (update as you go)

- [x] Baseline commit `614fc19`
- [x] Servers running (backend 8000, frontend 5173), migrations at head
- [x] Seed known-password user: **eva@demo.cz / ClaudeReview2026!** (demo org admin,
      12 companies / 38 deals; password+verified set directly in DB, login 200 confirmed)
- [x] Review workflow DONE (3 Opus agents, wf_461bb896-e6a): pytest 702 pass, vitest 151
      pass, tsc clean, 0 console errors — but 16 findings incl. all 5 owner complaints
- [x] Findings consolidated → `docs/superpowers/plans/2026-07-08-deal-detail-review-findings.md`
      (16 findings P1–P3 + payload contract; update statuses there as fixes land)
- [x] Fixes implemented for all 16 findings (4 parallel agents, wf_6f5e6116-166): backend
      payload contract + email fixes; ActivityRow rich rendering; UX batch (centering,
      tooltip+link, Přidat obchod w/ lockedCompany AddDealModal, Akce mail column, E-maily
      tab, attachment validation); logo synced to landing Sparkles mark + favicon redrawn.
      NOT yet committed (commit after live verify, in per-batch commits).
- [x] Full suites green post-fix: pytest 711 passed, vitest 168 passed, tsc clean;
      api.generated.ts regenerated (BACKEND_OPENAPI_URL=http://localhost:8000/api/v1/openapi.json
      pnpm types:generate — direct mode hits the WeasyPrint/DYLD issue, use the URL mode)
- [x] Live Playwright verify: ALL 10 checks PASS (centering measured 45px/45px, tooltip
      link click-through works, add-deal locked-company flow creates+refreshes, rich
      activity rows verified on fresh data incl. old→new + stage names, E-maily tab,
      logo identical app/landing, deep-link redirect, 0 persistent console errors).
      Decimal display nit (50000.00 vs 50000) fixed post-verify in activity_log.py.
- [x] Fixes committed: 45dfd9d backend, f02175d activity-ui, 176a6df ux, b40475a brand
      (on top of baseline 614fc19). All 16 findings FIXED in the findings doc.
- [x] Final summary to owner with screenshots — DONE 2026-07-09. **PASS COMPLETE.**
      Not done (owner's call): merge/push, branch cleanup, SMTP-verified live send test.

## Findings file

Review findings land in `docs/superpowers/plans/2026-07-08-deal-detail-review-findings.md`
(created by the review phase; P0–P3 priorities; mark each FIXED/SKIPPED as fixes land).
