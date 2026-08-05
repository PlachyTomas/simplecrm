# Calendar events: deal/company links, Google-style times, labels

Approved 2026-08-05 (owner picked all four recommended options in AskUserQuestion:
colored labels / org-shared / combobox times / company via deal only).

## Goals

1. Events shown on the calendar page link to their deal AND the deal's company.
2. Time editing works like Google Calendar: comboboxes with 15-minute suggestions,
   changing start preserves duration by shifting end, changing end never moves start.
3. Events carry 0..n org-shared colored labels; defaults seeded (call / meeting /
   follow-up), users create their own inline from the picker.

## Non-goals (explicitly out)

- Filtering the calendar by label.
- Pushing labels into the Google Calendar payload (labels are CRM-only; the
  one-way sync in `backend/app/api/v1/events.py` stays byte-identical).
- Direct company FK on events (company is always derived via the deal).
- Multi-day events (the form keeps its single date field).

## Data model

New table `event_labels` (mirrors `stages` conventions):

- `id` UUID PK, `organization_id` UUID FK organizations CASCADE (indexed),
  `name` String(50) NOT NULL, `color` String(9) NOT NULL, `created_at`.
- Uniqueness: functional unique index on `(organization_id, lower(name))`.

Join table `calendar_event_labels`:

- `event_id` FK calendar_events CASCADE + `label_id` FK event_labels CASCADE,
  composite PK, index on `label_id`.

### Color palette (single source of truth, validated server-side)

`#6366F1` indigo · `#0EA5E9` sky · `#10B981` emerald · `#F59E0B` amber ·
`#EF4444` red · `#EC4899` pink · `#8B5CF6` violet · `#64748B` slate

### Seeding

`backend/app/services/event_labels.py::create_default_event_labels(session,
organization_id, locale)` — names by locale prefix (`cs*` → Hovor `#0EA5E9`,
Schůzka `#6366F1`, Follow-up `#F59E0B`; otherwise Call / Meeting / Follow-up,
same colors). Called from `services/onboarding.py` after `create_default_pipeline`.
The migration backfills the same three rows for every existing org using
`organizations.locale`. Defaults are ordinary rows — renamable, deletable, no flag.

## API

New router `backend/app/api/v1/event_labels.py`, prefix `/event-labels`, mounted in
`api/routes.py` behind `PROTECTED_DEPS`:

- `GET /event-labels` → `list[EventLabelOut]` ordered by name (no pagination — org
  vocabularies are small). `EventLabelOut = {id, organization_id, name, color,
  usage_count}` (usage_count = COUNT of join rows, single grouped query).
- `POST /event-labels` `{name, color}` → 201 EventLabelOut. Any role. 409 on
  case-insensitive duplicate name; 422 on color outside the palette or empty/
  >50-char name (trimmed).
- `PUT /event-labels/{id}` `{name?, color?}` → EventLabelOut. Admin only (403).
  Same validations.
- `DELETE /event-labels/{id}` → 204. Admin only. Join rows cascade; events keep
  their other labels.

Events API changes (`backend/app/api/v1/events.py`, `schemas/calendar_event.py`):

- `CalendarEventCreate.label_ids: list[UUID] = []`,
  `CalendarEventUpdate.label_ids: list[UUID] | None = None` — exclude_unset
  semantics: omitted = unchanged, `[]` = clear all. Unknown/foreign-org ids → 400
  (same style as the deal_id check).
- `CalendarEventOut` gains `labels: list[EventLabelBrief]` (`{id, name, color}`,
  name-ordered) and `company_id: UUID | None` + `company_name: str | None` derived
  from `deal.company`. Loading via selectinload chains; keep the existing
  "pass values before commit" style — `_event_out` already documents the
  MissingGreenlet trap.
- Field naming stays snake_case like the rest of this router.

## Frontend

### Event form (`frontend/src/app/events/EventFormModal.tsx`)

- **TimeSelect** (`app/events/TimeSelect.tsx`): combobox replacing both native
  time inputs. Free typing with loose parse (`9` → 09:00, `9:30`, `14.15` →
  14:15), dropdown of 15-min steps; the end field's list starts at start+15 min
  and appends localized duration hints ("(30 min)", "(1 h)", "(1,5 h)").
  Times render via `Intl` with the active locale. Start change shifts end to
  preserve duration (clamped to 23:59 same-day); end change never moves start.
  Pure logic in `app/events/timeOptions.ts` (options, parse, shift/clamp,
  duration format) with unit tests.
- **LabelPicker** (`app/events/LabelPicker.tsx`) + `useEventLabels.ts`
  (react-query hooks for the new endpoints): selected labels as colored chips
  (bg = color at 16% alpha via inline style, text = color — the stage-color
  data-driven exception), input filters org labels, no exact match → a
  "create 'X'" row that POSTs inline with a round-robin palette color.
- The header deal line gains the company link next to the deal link.
- New strings: `deals.json` (cs + en) only. Testids are pre-added in
  `lib/testids.ts` — do not edit that file.

### Calendar page (`frontend/src/app/calendar/CalendarPage.tsx`)

- Grid chips: tinted by the event's FIRST label (array order = name order):
  inline style bg color@16%, text color. No labels → current indigo classes.
  `google_sync_status === "error"` warning styling still wins.
- Day panel rows (`DayEventsList`): small label chips after the title; the
  second line becomes deal link + " · " + company link (`/app/companies/{id}`).
  Deal-less events keep the current "no deal" text.
- Strings in `calendar.json` (cs + en).

### Settings → Štítky událostí

- `settingsNav.ts`: new key `event-labels`, group `sales`, `sharedRead: true`,
  icon `Tags`; section component `sections/EventLabelsSection.tsx` registered in
  `SettingsSectionPage.tsx` (mirror SalesGoalsSection's structure).
- List rows: inline rename, 8-swatch palette recolor, delete with a confirm
  showing "used on N events" (from `usage_count`). Non-admins see read-only rows
  (backend 403s writes anyway). Strings in `settings.json` (cs + en).

## Testing

- BE (`tests/api/v1/test_event_labels.py` + extend `test_events.py`): CRUD +
  role gates + duplicate-name 409 + palette validation; label_ids round-trip
  (create, update-replace, update-omit, update-clear, cross-org 400);
  company_id/name derivation; seeding (new org gets 3, idempotent).
- FE: `timeOptions` unit tests (parse, end-options window, duration hints,
  shift-preserving-duration incl. 23:59 clamp); EventFormModal test extended for
  the shift behavior; LabelPicker create-inline flow.
- Both i18n catalogs for every new string; `pnpm i18n:check` green.
