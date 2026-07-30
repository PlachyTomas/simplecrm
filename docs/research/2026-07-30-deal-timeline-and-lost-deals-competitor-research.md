# Deal timeline + lost-deal visibility — competitor research

Written 2026-07-30. Owner's ask, verbatim intent:

> "we need a way to show activities *per deal* — some kind of timeline so that
> when I look at the deal I see clearly what happened and where we are in the
> process. Also cancelled deals disappear, we probably need some kind of table
> of deals to search through."

This doc covers (1) what SimpleCRM already has — more than the ask assumes,
(2) how five competitors handle both problems, (3) the synthesized patterns and
the gap we'd actually need to close.

## 1. What SimpleCRM already has (checked 2026-07-30, main @ a28bcec)

The surprising part: **most of the plumbing for both asks already exists.**

### Deals table — exists, shipped, in the nav

`/app/deals` (`frontend/src/app/deals/DealsListPage.tsx`, sidebar item
`nav.deals`) already is the "table of deals to search through":

- full-text search (`q`, debounced, hits BE `search` param),
- filters: stage, owner, **status = open | won | lost**,
- sortable columns, pagination, CSV export.

So lost deals do NOT vanish from the app — they vanish **from the pipeline
board** (correct: Pipedrive does the same) and are findable at
`/app/deals?status=lost`. If the owner didn't know, that is a
**discoverability problem, not a missing feature**: nothing in the board says
where a lost deal went after `MarkLostDialog`.

### Activity infrastructure — exists; deal detail just never consumes it

- `activities` table: polymorphic (`entity_type` company/contact/deal/org +
  `entity_id`), denormalized `company_id` for fan-up queries, indexed.
- `ActivityType` already covers a real timeline: `deal_created`,
  `stage_change`, `deal_won`, `deal_lost`, `owner_change`, `deal_updated`,
  `note`, `call_logged`, `email_sent`, `email_received`, `event_created`.
- `GET /api/v1/activities?entity_type=deal&entity_id=…` works today.
- FE consumers already exist: Company detail "Aktivita" tab
  (`ActivityRow`, `activityLabels.ts`, `useActivities`) and the pipeline
  `DealCardPreview` (shows recent deal activities). Quick actions write
  notes + logged calls.

**The gap is one screen:** `DealDetail.tsx` shows note / events / email
history sections but has **no unified chronological timeline**. The data is
being written; the deal page just doesn't render it.

## 2. Competitor survey

### Pipedrive — the archetype for our segment

Deal detail = summary sidebar + a center column with:

- **Focus**: activities, email drafts and pinned notes that need attention to
  move the deal — i.e. *upcoming/next steps first, separate from history*.
- **History**: one feed with tabs filtering notes / activities / emails /
  files / documents / invoices.
- **Changelog**: field-level changes (stage, value, label, contacts, custom
  fields) sorted by date — separate from the human feed.
- **Deal progress bar** on top: current stage + **days spent in each stage**
  (stops updating once won).

Lost deals: lost is a **status, not a stage** — marking lost removes the deal
from the board and asks for a **lost reason** (free text or admin-predefined
list). Recovery path is the **list view** with a default shipped filter
"All Lost deals"; lost reason is a column you can add, filter and report on.
Deals can be reopened (win-rate implications are a known community topic).

### HubSpot — the opposite lost-deal model

- Timeline on the deal record: one feed, **Filter activity** dropdown by
  activity type + per-type quick tabs (Notes / Emails / Calls / Tasks /
  Meetings) + filter by user/team. Powerful but visibly heavier than
  Pipedrive.
- Lost = a **pipeline stage** ("Closed lost"), so lost deals stay visible as
  the right-most board column until you filter them out. Solves
  discoverability at the cost of a permanently cluttered board.

### Raynet — the Czech reference point

(support site 403s robots; from raynet.cz product pages + support search
snippets)

- Every aktivita/hovor/poznámka auto-saves to the customer history; the pitch
  is "tým hned vidí, v jaké fázi obchod je" — same job-to-be-done as the
  owner's ask, worded almost identically.
- **Časová osa** (timeline) sits on the detail card of obchodní případy,
  nabídky, objednávky and projekty.
- Activities can chain (follow-up aktivita) with a Historie tab per activity.

### Attio — timeline readability details worth stealing

- Activity entries are **plain language** ("who did what, what changed"), not
  raw field names.
- **Consolidation**: several field edits by the same person within ~10 min
  collapse into one entry — keeps the feed readable during active work on a
  deal. (Our `deal_updated` spam would benefit from exactly this.)

### Close — activity-feed-first

The deal/lead page *is* the feed; calls/emails/notes land there
automatically. Confirms the pattern but adds nothing new for us.

## 3. Synthesized patterns

Table stakes (every competitor has these):

1. **One chronological feed per deal** mixing system events (stage moves,
   won/lost) with human touchpoints (notes, calls, emails, meetings), newest
   first, actor + relative time on every row.
2. **Type filtering** of that feed (tabs or dropdown) once it grows.
3. **Lost reason captured at mark-lost time** and queryable later (column /
   filter / report).
4. **A list view that is the system of record** — the board shows open deals,
   the table shows everything, with a one-click lost filter.

Differentiators worth considering:

5. **Upcoming vs history split** (Pipedrive Focus): next planned event on top,
   past below — this is what answers "where are we in the process", not just
   "what happened".
6. **Days-per-stage progress bar** — the other half of "where are we".
   (We already compute rotting; same data family.)
7. **Edit consolidation** (Attio) so `deal_updated` noise doesn't drown the
   real story.
8. **Changelog separated from the human feed** (Pipedrive) — audit detail
   without polluting the narrative.

## 4. Gap analysis → smallest real feature

| Ask | Status | Gap |
|---|---|---|
| Timeline per deal | BE done, FE components exist | Render it on `DealDetail` (+ decide: merge with events/emails sections or keep tabs) |
| Lost deals findable | Shipped at `/app/deals?status=lost` | Discoverability: post-mark-lost toast/link, board-level entry point, maybe a "Prohrané" preset |
| Lost reason | `lost_reason` column exists, `MarkLostDialog` collects it | Expose as column/filter in the deals table if not already |
| "Where are we" | Stage + rotting badge on board | Consider days-in-stage on deal detail (differentiator, not step 1) |

## 5. Open questions for the owner

1. By "cancelled deals" do you mean **lost** (prohrané) — or actually
   *deleted*? Deleted deals are gone for real; lost ones are in the table.
2. Did you know about `/app/deals` (Obchody in the sidebar)? If yes and it
   still didn't do the job — what was missing when you looked there?
3. Timeline placement: one merged feed replacing the separate
   note/events/email sections (Pipedrive-style tabs), or a new section
   alongside them?
4. Should the pipeline board itself get a "recently lost" affordance, or is
   the table + a pointer after marking lost enough?

## Sources

- Pipedrive: [Deal detail view](https://support.pipedrive.com/en/article/deal-detail-view),
  [Activities](https://support.pipedrive.com/en/article/activities),
  [Lost reasons](https://support.pipedrive.com/en/article/lost-reasons),
  [Filtering won/lost/deleted deals](https://support.pipedrive.com/en/article/filtering-for-my-won-lost-or-deleted-deals),
  [Predefined lost reasons](https://support.pipedrive.com/en/article/how-can-i-enable-predefined-lost-reasons)
- HubSpot: [Filter activities on a record timeline](https://knowledge.hubspot.com/records/filter-activities-on-a-record-timeline),
  [Customize timeline activities](https://knowledge.hubspot.com/articles/kcs_article/contacts/customize-activities-on-a-contact-company-deal-ticket-record-timeline),
  [Pipeline visibility (community)](https://community.hubspot.com/t5/Tips-Tricks-Best-Practices/Visibility-deal-pipeline/m-p/709293)
- Raynet: [Produkt](https://raynet.cz/produkt/),
  [Jak na obchodní případy](https://raynet.cz/jak-zacit/jak-na-obchodni-pripady/),
  [Časová osa (support)](https://support.raynetcrm.com/hc/en-us/articles/202151178-Timeline) *(support articles 403 robots; read via search snippets)*
- Attio: [ClientSights Attio overview](https://www.clientsights.ai/articles/attio-overview),
  [Attio for sales-led growth](https://attio.com/help/reference/industry-guides/sales-led)
- Close: [Attio vs Close comparison](https://www.folk.app/articles/attio-vs-close-crm)
