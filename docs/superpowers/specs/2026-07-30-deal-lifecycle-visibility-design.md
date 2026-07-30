# Deal lifecycle visibility — design

Approved by owner 2026-07-30 (chat). Research behind it:
`docs/research/2026-07-30-deal-timeline-and-lost-deals-competitor-research.md`.

Owner's asks, condensed: a per-deal timeline ("see what happened and where we
are"), lost deals findable at a glance, drag-drop should *lose* not *delete*,
one delete route with the styled confirm, actions default-attached to the
company's open deal, readable hover preview, lost-reasons widget (exists),
and a more compact deal detail.

## Established facts (do not re-derive)

- Activities infra is complete: `activities` table, `GET
  /api/v1/activities?entity_type=deal&entity_id=…`, `ActivityType` covers
  deal_created / stage_change / deal_won / deal_lost / owner_change /
  deal_updated / note / call_logged / email_sent / email_received /
  event_created. FE consumers exist: company Aktivita tab (`ActivityRow`,
  `activityLabels.ts`, `useActivities`) and `DealCardPreview`.
- Losing without drag-drop already exists ×3: desktop card hover ✕, mobile
  card "Prohráno" button, deal-detail header button — all open
  `MarkLostDialog` (which collects the lost reason; predefined keys stored as
  cs reference labels).
- The board drop zone (`TrashDropZone`, id `"trash"`) currently **deletes**
  via the styled `DeleteConfirmDialog` (PipelinePage). Deal-detail delete and
  reopen use `window.confirm`.
- `lost_reasons_breakdown` widget already exists (Reports catalog + BE); NOT
  in the Home catalog.
- Quick-actions ⚡ e-mail/event open `EmailComposeModal`/`EventFormModal` in
  place — no redirect. Calls/notes/events can only be created deal-bound;
  the company Notes tab is a persistent `company.note` field, not an action
  log.
- `DealListItemOut` extends `DealOut` (has `lost_reason`); no status field.
- Deal detail info section: one `<dl>`, 11 full-width `Field` rows; Name and
  Value rows duplicate the header in view mode. Standalone sections:
  Poznámka, Události, E-maily.

## A. Deal detail: timeline + compaction

**Timeline ("Průběh")** — new section, first in the scroll area:

- Data: `useActivities({ entityType: "deal", entityId })`, newest first,
  paginated ("Načíst další" appends the next page).
- Rendering: reuse `ActivityRow` + `activityLabels` from the company tab —
  identical row look. No type filters in v1.
- Existing Události and E-maily sections stay (they serve editing/detail
  needs; the timeline is the narrative).

**Compaction** — the detail must fit a laptop viewport without scrolling in
the common case:

- Status chip moves into the header next to the deal name.
- View mode drops the Name and Value `<dl>` rows (the header shows both);
  edit mode keeps every field as today.
- The info `<dl>` becomes a two-column grid on ≥sm (one column mobile),
  tighter row padding; section paddings shrink one step (p-6 → p-4 family).
  Exact spacing per the ui-design skill at implementation.
- **Poznámka moves inline into the info section** as a final full-width row
  (same click-to-edit behavior as today's `DealNoteSection`); the standalone
  section is deleted.
- Události and E-maily get the same tightened paddings, no structural change.

## B. Drag-to-lose + one delete route

- Drop zone repurposed: drop → `MarkLostDialog` for that deal (reason
  required, same as every other lose path). Icon ✕ (not trash), danger
  styling and label updated ("Přetáhnout sem = prohraný" family).
- Board delete path removed (`useDeleteAnyDeal` usage, `deletingDealTarget`,
  the delete branch of the drop handler).
- `DeleteConfirmDialog` is extracted from PipelinePage into a shared
  `components/ui/ConfirmDialog.tsx` (title/body/confirm-label/danger props).
  Deal-detail **delete** (admin-only) and **reopen** switch from
  `window.confirm` to it. No other `window.confirm` in scope.
- Desktop card hover ✕: danger-tinted from the moment it appears
  (`text-danger` + danger-subtle surface on reveal), not only on
  button-hover. Tooltip unchanged.

## C. Obchody: status column

- BE: computed `status: Literal["open", "won", "lost"]` on
  `DealListItemOut`, derived exactly as the list endpoint's `status` filter
  derives it (single source: shared helper). Regenerate FE types.
- FE: new "Stav" column — chip: Otevřený (neutral/indigo), Vyhraný (brand
  accent), Prohraný (danger). Lost chip shows `lost_reason` in a tooltip on
  hover (and via aria). Column visible on mobile card layout too.
- No new sorting; the existing status *filter* stays as is.

## D. Default-attach to the company's open deal

Rule (owner-picked): **preselect the company's most recently updated open
deal** (`updated_at` approximates "newest activity"; no new endpoint).
User can switch deals or detach entirely.

- `EmailComposeModal` opened with `companyId` and no `dealId`: new
  "Připojit k obchodu" row — checkbox (default on when the company has ≥1
  open deal) + deal dropdown preselected per the rule. Unchecked → filed on
  company only. The chosen deal goes into `deal_id` on send, so the mail
  lands on the deal timeline and fans up to the company.
- Events need **no change**: every creation path is either deal-fixed (quick
  actions, deal events section) or unbound with no company context to derive
  a default from (calendar, dashboard). Verified against all
  `EventFormModal` call sites.
- Out of scope: logging calls/notes from the company page (no such entry
  point exists today; owner can request separately).

## E. Hover preview (`DealCardPreview`)

- New top row "Poslední akce": latest activity of any type (`items[0]` of
  the already-fetched activities query), one line via `activityLabels` +
  relative date. Events/notes sections unchanged below it.
- Readability: opaque elevated surface, stronger separation (border +
  ring/shadow one step up) so the panel reads against same-colored cards.
  Exact tokens per ui-design skill.

## F. Lost-reasons widget

Exists (`lost_reasons_breakdown`, Reports). **No work.** Optional follow-up
(not in this feature): expose it in the Home dashboard catalog — remember the
two-union gotcha if ever done.

## Cross-cutting

- i18n: every new string in `cs` **and** `en`; `pnpm i18n:check` green.
- New interactive elements → `lib/testids.ts`.
- Tests: vitest for status-chip derivation/rendering and the attach-default
  rule (most-recently-updated open deal, uncheck behavior); BE test for the
  `DealListItemOut.status` field. Existing pipeline tests updated for the
  lose-drop-zone rename.
- Types regenerated against a running backend (macOS glib gotcha).
- CI green locally before push (formatters first — per CLAUDE.md).

## Verification

Playwright MCP (owner didn't override the default): screenshot each touched
route — deal detail (timeline + compaction), pipeline (drop zone, hover ✕,
preview), Obchody (status chips), company → compose (attach row) — plus
console-error check. Screenshots stay outside the repo.

## Implementation slicing (lesson from the scroll-model attempts)

Land in independent slices, one commit each, so any report of breakage
reverts one slice: (1) shared ConfirmDialog + detail delete/reopen swap,
(2) drag-to-lose, (3) timeline section, (4) detail compaction, (5) status
column (BE→types→FE), (6) attach-default (compose+event), (7) hover preview.
Stage explicit paths only — parallel sessions drop files into this tree.
