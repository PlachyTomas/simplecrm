# Event fields expansion — reminders, all-day, attendees, Meet link

Date: 2026-08-17 · Status: approved (owner, in-chat) · Track: calendar/events

## Goal

Events currently carry title, deal link, start–end, location, description and
labels. This track adds the four fields the owner approved: **reminders**
(fired by Google Calendar), **all-day events**, **attendees** (contacts +
teammates, invited by Google), and an optional **Google Meet link**.

Out of scope, deliberately: recurrence, RSVP sync-back, free-email guests,
any in-app notification system (reminders are Google-only in v1).

## Current state (context for the implementer)

- `calendar_events` is local-first; Google holds a mirror copy when the
  owner opted in (`google_event_id`, `google_sync_status`). Sync is
  best-effort push: failures mark `error`, never fail the CRM write
  (`backend/app/api/v1/events.py`, `_sync_insert` / `_sync_patch`).
- The Google body is built by the pure function `event_payload(...)` in
  `backend/app/services/google_calendar.py`; `insert_event` returns only the
  created event id today.
- Labels are CRM-only and never pushed; every read path eager-loads
  relationships (async lazy-load raises `MissingGreenlet`).

## Data model (one additive migration)

`calendar_events` new columns:

| column | type | default | notes |
|---|---|---|---|
| `all_day` | boolean NOT NULL | `false` | |
| `reminders` | JSONB NOT NULL | `'[]'` | list of `{"method": "popup"\|"email", "minutes": int}`; max 5 entries; minutes 0–40320 (Google's bounds) |
| `meet_requested` | boolean NOT NULL | `false` | |
| `meet_url` | text NULL | | Google `hangoutLink`, stored after successful insert |

New table `calendar_event_attendees`:

- `id` PK, `event_id` FK → calendar_events ON DELETE CASCADE,
  `contact_id` FK → contacts ON DELETE CASCADE (nullable),
  `user_id` FK → users ON DELETE CASCADE (nullable).
- CHECK: exactly one of `contact_id` / `user_id` set.
- UNIQUE `(event_id, contact_id)` and `(event_id, user_id)`.
- **No email/name snapshots** — emails join live from contact/user rows, so
  contact deletion cascades cleanly and GDPR erasure has nothing extra to
  scrub. Attendees with no email at push time are skipped in the Google
  payload (they remain visible in the CRM).

All-day semantics: `starts_at`/`ends_at` are stored as **UTC midnights** and
interpreted as calendar dates, not instants (FE sends the chosen date at
00:00Z; BE derives Google's `start.date` via `starts_at.date()`). The
existing `ends_at > starts_at` check constraint holds (midnight → next
midnight).

## API

- `CalendarEventCreate`: add `all_day: bool = False`, `reminders:
  list[ReminderIn] = []` (validated: ≤5, minutes 0–40320), `meet_requested:
  bool = False`, `attendee_contact_ids: list[UUID] = []`,
  `attendee_user_ids: list[UUID] = []`. Ids outside the caller's org → 400,
  same as `label_ids`.
- `CalendarEventUpdate`: same fields, tri-state on `exclude_unset` like
  `label_ids` (absent = unchanged).
- `CalendarEventOut`: add `all_day`, `reminders`, `meet_url`, `attendees:
  list[AttendeeBrief]` (`id` = the contact/user id, `kind:
  "contact"|"user"`, `name`, `email`).
- Regen FE types via the running server (`BACKEND_OPENAPI_URL=... pnpm
  types:generate`).

## Google sync

`event_payload` grows optional inputs; behavior:

- **Reminders**: non-empty list → `"reminders": {"useDefault": false,
  "overrides": [...]}`; empty list → omit the key entirely (Google applies
  the user's calendar defaults).
- **All-day**: `start`/`end` use `{"date": "YYYY-MM-DD"}` with the end date
  **exclusive** (stored end midnight already is the exclusive boundary).
- **Attendees**: `[{"email", "displayName"}]` joined live; pass query param
  `sendUpdates=all` on insert and patch so Google emails real invites.
- **Meet**: on insert only, `conferenceData.createRequest` with
  `requestId=str(event.id)` and `conferenceSolutionKey {"type":
  "hangoutsMeet"}`, plus query param `conferenceDataVersion=1`. Store the
  response's `hangoutLink` into `meet_url`. Patches never send a
  `createRequest` (the existing conference is preserved).

Client interface change: `insert_event` returns the response **body** (dict)
instead of the id; both `insert_event` and `patch_event` accept optional
query `params`. All existing callers updated in the same change.

## Frontend

`EventFormModal`:

- **All-day** checkbox — hides both TimeSelects, submits date-at-00:00Z
  boundaries (end = day after the picked end date).
- **Reminders** repeater — preset offsets (at start, 5 min, 10 min, 30 min,
  1 h, 1 d) + custom minutes, popup/email method, max 5 rows; hint that
  notifications fire via Google Calendar (Google-only v1).
- **Attendees** picker — chips input listing teammates and contacts
  (deal's company contacts offered first; house fetch-100 + fold-matched
  client search); hint that invites are emailed only when Google is
  connected.
- **Meet** toggle — visible only when Google is connected and healthy
  (`googleAvailable`), copy says a Meet link will be generated.

Display: `DealEventsSection` rows show attendee count and a Meet link icon
when present; the CalendarPage event popover shows attendees and the Meet
link. All new strings in cs (reference, vykání) + en; interactive elements
in `lib/testids.ts`.

## Testing

- Backend: `event_payload` unit tests (reminder omit/override, all-day date
  boundaries, attendee mapping incl. no-email skip, Meet request shape);
  endpoint tests for validation bounds, org-scoping 400s, update tri-state,
  and attendee-row cascade on contact deletion; sync tests with the fake
  client asserting `params` (`sendUpdates`, `conferenceDataVersion`).
- Frontend: form tests for the all-day toggle (times hidden, midnight
  payload), reminder rows (add/remove/cap at 5), attendee chips
  (search, dedup); run under the mobile path where grid libs are involved.
- Live console check via playwright; owner verifies visuals manually.

## Rollout

Additive migration only; no backfill (existing rows default to
`all_day=false`, `reminders=[]`). Types regen after backend lands. No
Google OAuth scope change needed (`calendar.events` covers attendees,
reminders and conferenceData).
