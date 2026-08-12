# Manual deal timeline + decluttered company activity — design

Date: 2026-08-12
Status: approved (owner, brainstorming session)
Branch: `worktree-deal-manual-timeline`

## Problem

The deal detail's **Průběh** timeline is a machine transcript. It renders every
row the audit log holds — `deal_created`, per-field `deal_updated` diffs,
`stage_change`, `deal_won/lost/reopened`, `note`, `call_logged`,
`email_sent/received`, `event_created`, `owner_change`. What it does *not*
contain is the thing a salesperson actually wants to record: **what I did**.
Logging a call is possible (pipeline quick actions write `call_logged`), but the
entry is stamped with server time, cannot be corrected afterwards, and drowns in
field-edit noise.

The company detail's **Aktivita** tab has the same problem an order of magnitude
worse: it fans up every activity of the company *and* all its deals, events and
emails into one undifferentiated feed.

## Goals

1. A deal's timeline is primarily **user-authored**: the user records actions
   they carried out, at a time they choose (prefilled with now, freely editable).
2. Entries are **backwards editable, inline, with no Save button**.
3. The only events the system adds by itself are **pipeline movements**.
4. The company Aktivita tab shows **only deal created / won / lost**, with won
   vs lost distinguishable **by color alone**.
5. The action "kind" vocabulary is **shared with calendar event labels** — the
   same org-owned list users already extend from the event form.

## Non-goals

- No change to the *Události* (calendar) or *E-maily* sections of the deal
  detail. They keep their own data and UI.
- No change to what the audit log **stores**. This is a display + authoring
  change; every automatic activity keeps being written (see Constraints).
- No new reporting widget, no timeline on contacts, no per-user filtering.

## Constraints discovered in the code

- `backend/app/services/reports/companies_at_risk.py` reads
  `max(Activity.created_at)` over **all** activity types for a company, and
  `stale_deals` keys off `stage_change` rows. Ceasing to write automatic
  activities would silently break both widgets. **Therefore: keep writing
  everything, filter at read time.**
- `activities.created_at` is `server_default=func.now()` and is the audit
  stamp. A user-settable time needs its own column.
- `event_labels` is already org-shared, case-insensitively unique per org,
  admin-only for rename/delete, member-creatable inline
  (`frontend/src/app/events/LabelPicker.tsx`), and seeded with
  Hovor / Schůzka / Follow-up (`services/event_labels.py`).
- `--color-win` is an alias of `--color-brand-accent` (magenta `#EC4899`).
  Won = magenta, **not** green. Lost = `--color-danger` (`#DC2626`).

## Data model

One Alembic migration, three changes to `activities`:

| Change | Definition | Notes |
|---|---|---|
| `occurred_at` | `TIMESTAMP WITH TIME ZONE NOT NULL` | When the action *happened*. Backfill `occurred_at = created_at` for every existing row, then set `NOT NULL`. `created_at` remains the immutable write stamp. |
| `label_id` | `UUID NULL REFERENCES event_labels(id) ON DELETE SET NULL` | The action kind, from the shared calendar-label vocabulary. One label per entry. Deleting a label leaves entries intact but unlabelled. |
| `ActivityType.manual_action` | new native-enum value | `ALTER TYPE activity_type ADD VALUE 'manual_action'`. The value is **not used** elsewhere in the same migration, so it is transaction-safe (same precedent as `deal_reopened`, migration `f7a8b9c0d1e2`). |

Index: `ix_activities_entity_occurred` on `(entity_type, entity_id, occurred_at DESC)`
to serve the deal timeline's ordering; keep the existing indexes.

**Why one label, not many.** Calendar events use a `calendar_event_labels` join
table because a meeting can legitimately be several things at once. A logged
action is one thing ("Hovor"), and the timeline row must stay one line tall, so
a nullable FK is the right shape. Accepted asymmetry with the events side.

### Editable set

```python
MANUAL_ACTIVITY_TYPES = frozenset({
    ActivityType.manual_action,
    ActivityType.note,
    ActivityType.call_logged,
})
```

Defined once (in `app/services/activity_log.py`) and imported by the API layer.
Existing `note` / `call_logged` rows — written by the pipeline quick actions and
`POST /deals/{id}/notes` — are user-authored and therefore become editable
retroactively. No data migration required.

### Timeline type sets

```python
DEAL_TIMELINE_TYPES = MANUAL_ACTIVITY_TYPES | {
    ActivityType.stage_change,
    ActivityType.deal_won,
    ActivityType.deal_lost,
    ActivityType.deal_reopened,
}
COMPANY_TIMELINE_TYPES = {
    ActivityType.deal_created,
    ActivityType.deal_won,
    ActivityType.deal_lost,
}
```

These live on the **frontend** as the query it sends (the backend just honors an
`activity_types` filter), so a future surface can pick a different set without a
backend change. The Python constants above exist only for tests and docs.

Both omissions below are deliberate and must not be "fixed" during
implementation:

- `deal_created` is in the **company** set but **not** the deal set. On the
  deal's own page the creation row says nothing the header does not; on the
  company page it is the whole point of the row.
- `owner_change`, `deal_updated`, `company_updated`, `email_sent`,
  `email_received` and `event_created` appear in **neither**. Emails and
  calendar entries already have dedicated sections on the deal detail, and
  field-level edits are audit data, not narrative.

## API

All routes stay under the existing routers; no new module.

### `POST /deals/{deal_id}/actions` → 201 `ActivityOut`

Body (`DealActionCreate`):

```
label_id:    UUID | null     # must belong to the caller's org → 422 if not
body:        str  | null     # trimmed; max 2000 chars
occurred_at: datetime | null # defaults to now(UTC)
```

At least one of `label_id` / `body` must be present after trimming — a wholly
empty action is a 422, mirroring the frontend's "empty draft never saves" rule.

Scope: same as `POST /deals/{id}/notes` — `_get_scoped` + `can_write_row`, 403
otherwise. Writes `manual_action` with `company_id` set to the deal's company so
the fan-up stays correct.

### `PATCH /activities/{activity_id}` → 200 `ActivityOut`

Partial body; every field optional, `None` meaning "clear" for `label_id` and
`body`, and omitted meaning "leave alone" (distinguish with
`model_fields_set`). `occurred_at` may not be cleared.

Guard, in order:
1. Row must exist in the caller's organization → 404.
2. `activity_type` must be in `MANUAL_ACTIVITY_TYPES` → 403
   (`"Only manually logged actions can be edited"`).
3. Caller must be the author (`activity.user_id == user.id`) **or** an org admin
   → 403. Deleted-author rows (`user_id IS NULL`) are admin-only.

Editing a `note` / `call_logged` row does **not** migrate its type — the label
and body just become editable on the row as-is.

### `DELETE /activities/{activity_id}` → 204

Same three guards as PATCH.

### `GET /activities` — two additions

- `activity_types: list[ActivityType] | None` (repeatable query param,
  `?activity_types=note&activity_types=stage_change`). `None` = no filter, so
  every existing caller is unaffected.
- Ordering changes from `created_at DESC` to `occurred_at DESC, created_at DESC`.
  For every pre-existing row the two are equal, so nothing visibly reorders
  until a user backdates something.

### `ActivityOut` additions

```
occurred_at: datetime
label:       EventLabelBrief | None   # id, name, color — reuses the events schema
can_edit:    bool                     # manual type AND (author OR admin)
```

`can_edit` is computed server-side so the role rule lives in exactly one place.
`list_activities` must `selectinload(Activity.label)` alongside the existing
actor load, or the list view N+1s.

## Frontend — deal detail *Průběh*

`frontend/src/app/deals/DealTimelineSection.tsx` grows into a small folder-free
set of siblings (keep files focused, mirror the house pattern):

- `DealTimelineSection.tsx` — section shell, query, paging, empty/error states.
- `TimelineDraftRow.tsx` — the "add action" composer.
- `TimelineEntryRow.tsx` — an editable manual entry.
- `ActivityKindPicker.tsx` — single-select label combobox with inline create.
- `useTimelineActions.ts` — create / patch / delete mutations.

`ActivityRow.tsx` keeps rendering the read-only automatic rows unchanged.

### Layout

```
┌ Přidat akci ─────────────────────────────────────────┐
│ [⌄ Hovor]   Co jste udělali?        12. 8. 2026 14:32 │
└──────────────────────────────────────────────────────┘
● Schůzka    Prošli jsme rozpočet, chtějí variantu B
  10. 8. 2026 9:00 · Jan Novák                        ✕
● Posun      Nabídka → Jednání
  8. 8. 2026 11:04 · Jan Novák
```

The query asks for `DEAL_TIMELINE_TYPES` only. Rows are ordered by
`occurred_at DESC` — so a backdated entry drops into place immediately.

### Draft row (create)

- Pinned above the list, always present, never scrolls away with the feed.
- Three controls: kind picker (optional), text input (`Co jste udělali?`),
  date-time input prefilled with **now**, recomputed each time the draft resets.
- **Commits on blur of the whole draft** (`onBlur` with a `relatedTarget`
  containment check so moving between the draft's own fields does not fire) or
  on ⌘/Ctrl+Enter. Escape clears the draft.
- Commit is skipped when both label and trimmed text are empty — an untouched
  draft can never create a row.
- On success the draft resets to blank with a fresh "now"; the new entry
  appears at the top via query invalidation of the `["activities"]` prefix.
- On failure: error toast, draft content preserved so nothing is lost.

### Entry row (edit)

Rendered for rows with `can_edit === true`. Every field edits in place:

- **Text** — a textarea that grows to content. Saves on blur, and on a 800 ms
  debounce while typing. No Save button anywhere.
- **Kind** — the label chip is a button; clicking opens the same
  `ActivityKindPicker` inline. Selecting saves immediately.
- **Time** — the timestamp is a button; clicking swaps it for a
  `datetime-local` input. Saves on blur/change.
- **Delete** — a `✕` that appears on hover/focus, behind the shared
  `components/ui/ConfirmDialog.tsx`.

Save semantics: optimistic update of the cached page, a quiet `Uloženo` that
fades from the meta line after ~2 s, and on error a toast plus revert to the
server value. A row currently in flight shows `Ukládám…` in the same slot.
Rows with `can_edit === false` render through the existing read-only path.

Accessibility: each inline control is a real focusable `button`/`input` with an
`aria-label`; the timestamp button announces the full formatted date; the
picker keeps the `role="combobox"` + `role="listbox"` wiring `LabelPicker`
already uses.

### Kind picker

A single-select sibling of `LabelPicker` — the multi-select chip behavior does
not fit a one-label field, but the pieces it should copy verbatim are: fetching
via `useEventLabels`, diacritic-folded filtering via `matches` from `@/lib/fold`,
diacritic-**sensitive** duplicate detection before offering "create", inline
create with `nextEventLabelColor(all.length)`, and the `labelTint` chip styling
(the sanctioned data-driven inline-style exception).

Creating a label here adds it to the org's calendar vocabulary too. That is the
intent, and the picker copy should not imply otherwise.

### Card hover preview

`frontend/src/app/pipeline/DealCardPreview.tsx` requests the same
`DEAL_TIMELINE_TYPES` set so "Poslední akce" agrees with the timeline instead of
surfacing a field edit the timeline no longer shows.

## Frontend — company *Aktivita* tab

`ActivityTab` in `frontend/src/app/companies/CompanyDetailPage.tsx` queries
`company_id` + `COMPANY_TIMELINE_TYPES` and renders its own compact row (it no
longer shares `ActivityRow`, whose job is the deal-level detail view):

| Row | Dot | Row background | Label |
|---|---|---|---|
| `deal_created` | `bg-accent` | none | `Nový obchod` |
| `deal_won` | `bg-win` (magenta) | `bg-win-subtle` | `Vyhráno` |
| `deal_lost` | `bg-danger` | `bg-danger-subtle` | `Prohráno` |

Each row shows the deal name as a link to the deal detail, the deal value
formatted via `@/lib/format` with `useLocale()`, the date, and the actor. Won
and lost also keep their text label, so color is never the sole signal
(a11y §10) even though the requirement is that color alone suffices.

**Deliberate rule-break:** the design skill caps magenta at ~1 instance per
screen in light mode. A company with several won deals will show several magenta
rows. Accepted — this is the literal win surface, and at 12 % alpha
(`--color-win-subtle`) the wash stays quiet. No other magenta appears on the tab.

## i18n

New keys land in **both** `cs` and `en` and must pass `pnpm i18n:check`.

- `deals` ns: `dealDetail.timeline.draft.*` (kind/body/time labels, placeholder
  `Co jste udělali?`, hint), `dealDetail.timeline.entry.*` (edit affordance
  aria-labels, `Uloženo`, `Ukládám…`, delete confirm copy), and the kind-picker
  strings (reuse the `eventFormModal.labelPicker.*` wording where it fits, but
  give the timeline its own keys rather than reaching across namespaces).
- `companies` ns: `companyDetail.activityTab.dealCreated | dealWon | dealLost`
  and a reworded empty state ("Zatím žádné obchody." — the tab no longer shows
  general activity).
- `common` ns: `activities.types.manual_action`.

Czech is the reference, vykání throughout.

## Test ids

Add to `frontend/src/lib/testids.ts` under `deals.detail`:
`timelineDraftKind`, `timelineDraftBody`, `timelineDraftTime`,
`timelineEntry(id)`, `timelineEntryBody(id)`, `timelineEntryKind(id)`,
`timelineEntryTime(id)`, `timelineEntryDelete(id)`;
and under `companies`: `activityRow(id)`.

## Testing

**Backend** (`backend/tests/api/v1/`):

- `test_deals.py` — `POST /deals/{id}/actions`: happy path with all three
  fields; defaults `occurred_at` to ~now when omitted; 422 on an entirely empty
  body; 422 on a `label_id` from another org; 403 outside the write scope.
- `test_activities.py` — `PATCH`: author edits body/label/time; admin edits
  another user's row; non-author non-admin gets 403; automatic type
  (`stage_change`) gets 403; cross-org id gets 404; clearing `label_id` with an
  explicit `null` works while an omitted field is left alone; `DELETE` mirrors
  all of it. Plus: `activity_types` filter returns exactly the requested types,
  ordering follows `occurred_at` (backdated row sorts below a newer one written
  earlier), and `can_edit` is `false` for automatic rows.
- Migration: `alembic upgrade head` on a DB with existing activities leaves
  `occurred_at == created_at` for every row.

**Frontend** (vitest):

- Draft row: typing then blurring POSTs once; blurring an untouched draft never
  POSTs; ⌘/Ctrl+Enter commits; the draft resets after success.
- Entry row: editing the body PATCHes on blur; a failed PATCH reverts the text
  and toasts; `can_edit === false` renders no editing affordances.
- Company tab: only the three deal row kinds render; won carries the win
  classes, lost the danger classes.

## Rollout / risk

- The migration is additive and backfills; no destructive step, safe to run
  ahead of the frontend.
- Old clients keep working: `activity_types` is optional and `ActivityOut`
  only gains fields.
- The reports that read the activity table are untouched because nothing stops
  being written. `companies_at_risk` continues to key off `created_at`
  (recording time), which is the correct semantic for "when did we last touch
  this account" — a backdated entry should not make an account look fresher
  than it is.
