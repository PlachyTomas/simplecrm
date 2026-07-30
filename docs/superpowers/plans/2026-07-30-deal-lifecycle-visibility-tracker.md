# Deal lifecycle visibility — implementation tracker

Spec: `docs/superpowers/specs/2026-07-30-deal-lifecycle-visibility-design.md`
(committed 00860d2). Budgeted ultracode run wf_e0bb103f, 2026-07-30 —
6 agents, ~646k subagent tokens, 0 agent errors, 9/10 verify checks passed.

| # | Slice | Agent (model) | Status |
|---|---|---|---|
| 1 | BE `DealListItemOut.status` + test | be-status (sonnet) | DONE |
| 2 | Shared ConfirmDialog + drag-to-lose + hover ✕ tint | board (opus) | DONE |
| 3 | Hover preview: last action + contrast | board (opus) | DONE |
| 4 | Compose attach-to-open-deal row | compose-attach (opus) | DONE |
| 5 | Deal detail: ConfirmDialog swap + timeline + compaction | detail (opus) | DONE |
| 6 | Obchody status chips (types regen first) | obchody-chip (sonnet) | DONE |
| 7 | Playwright verification, all surfaces | verify (opus) | DONE (9/10) |
| 8 | P1 fix: real reopen endpoint (found by verify) | orchestrator | DONE |

## Landed commits

- `23040c3` feat(deals-api): computed list status + a real reopen endpoint
- `7211191` feat(pipeline): drag-to-lose replaces drag-to-delete + preview upgrade
- `544cbb4` feat(deal-detail): activity timeline, compact layout, styled dialogs
- `f9aec06` feat(deals): Stav chips in Obchody + compose attaches to the open deal

CI local: backend ruff/format/mypy/alembic/pytest 1012 ✓ · frontend
eslint (2 pre-existing warnings)/tsc/prettier/vitest 377/build ✓ ·
api-types check ✓. Not pushed.

## Findings / deviations

- **P1 (pre-existing, FIXED here):** the detail's reopen PATCHed
  `{lost_reason: null}`, which can't clear `closed_at` — deal stayed lost,
  reason wiped, header chip flipped to a false "Vyhráno". Fixed with
  `POST /deals/{id}/reopen` (clears terminal stamp in place; won/lost-staged
  deals move to the first open stage; `is_paid` reset; new `deal_reopened`
  activity — enum + migration f7a8b9c0d1e2). The seeded deal the verify run
  mutated ("Datová analytika – Hradec Energy") was restored via the new
  endpoint.
- **P2 resolved by design:** the timeline's raw `lost_reason: … → —` entry
  came from that PATCH path, which no longer exists; the field label map
  already covers `lost_reason` for genuine edits.
- Deal detail improved but does NOT fully fit 1280×800 (~190px over for a
  typical deal — Události/E-maily below the fold). Follow-up candidate if
  the owner wants a stricter no-scroll layout.
- Compose attach row intentionally NOT part of the dismiss-guard `dirty`
  state (default-on checkbox would mark a fresh modal dirty).
- `lost_reasons_breakdown` widget already existed in Reports — no work; not
  in the Home catalog (20-min follow-up if wanted, mind the two-union
  gotcha).
