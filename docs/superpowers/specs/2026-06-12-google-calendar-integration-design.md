# Google Calendar integration — design

Date: 2026-06-12
Status: approved (owner delegated design decisions: "figure out everything yourself")

## Goal

Let any SimpleCRM user — regardless of whether they signed up via Google OAuth or
email+password — connect their personal Google Calendar, schedule events for deals,
and optionally push those events into their Google Calendar. The app also gets its
own calendar page showing all events, since pushing to Google is optional.

## Approaches considered

1. **Per-user OAuth connection, local-first events, one-way push (chosen).**
   Events live in our DB as the source of truth. When the user opts in (per event),
   we mirror the event into their Google Calendar via the Calendar API and remember
   the `google_event_id` so later edits/deletes propagate. Works identically for
   Google-login and password users because the calendar connection is a separate
   OAuth grant from login.
2. Two-way sync with Google push notifications (watch channels). Rejected: requires
   a public HTTPS push endpoint, channel renewal bookkeeping, and conflict
   resolution — heavy for v1 and not required by the ask.
3. Service account with domain-wide delegation. Rejected: only works for Google
   Workspace domains, not personal Gmail users.

## Architecture

### Why login OAuth can't be reused

The existing Google login flow (`/api/v1/auth/google/login`) requests only
`openid email profile` and discards Google tokens after fetching the profile.
Calendar access needs the `https://www.googleapis.com/auth/calendar.events` scope
and a stored refresh token. So calendar connection is a **second, independent OAuth
flow** under `/api/v1/integrations/google-calendar/*`, reusing the same Google
client credentials (`google_client_id` / `google_client_secret`).

### Backend

**New models**

`GoogleCalendarConnection` (table `google_calendar_connections`) — one per user:
- `id` UUID PK; `user_id` FK users (unique, CASCADE); `organization_id` FK orgs (CASCADE)
- `google_email` — the Google account the calendar belongs to (may differ from CRM email)
- `refresh_token_encrypted`, `access_token_encrypted`, `access_token_expires_at` —
  tokens encrypted at rest with Fernet, key derived from `jwt_secret` (SHA-256 →
  urlsafe base64). `cryptography` is already a transitive dependency via python-jose.
- `sync_broken: bool` — set when Google returns `invalid_grant` (user revoked access);
  UI then prompts to reconnect.
- `created_at`, `updated_at`

`CalendarEvent` (table `calendar_events`):
- `id` UUID PK; `organization_id` FK orgs (CASCADE); `deal_id` FK deals (CASCADE);
  `owner_user_id` FK users (SET NULL) — the creator, whose Google Calendar is used
- `title` (200), `description` (text, nullable), `location` (200, nullable)
- `starts_at`, `ends_at` — `DateTime(timezone=True)`, stored UTC; `ends_at > starts_at` check
- `google_event_id` (nullable), `google_sync_status` enum: `not_synced | synced | error`
- `created_at`, `updated_at`
- Indexes: `(organization_id)`, `(deal_id)`, `(owner_user_id)`, `(starts_at)`

**New service** `app/services/google_calendar.py` (httpx, mirrors `comgate.py` style):
- OAuth: `build_authorize_url`, `exchange_code`, `refresh_access_token`, `revoke_token`
- Calendar API (`https://www.googleapis.com/calendar/v3`): `insert_event`,
  `patch_event`, `delete_event` against the user's `primary` calendar
- Token handling: a helper returns a valid access token for a connection — uses the
  cached one if >60s from expiry, otherwise refreshes and persists. `invalid_grant`
  raises `GoogleCalendarAuthError`; callers mark the connection `sync_broken`.
- Event payloads use RFC3339 UTC datetimes; Google renders them in the viewer's zone.
- Raises `GoogleCalendarError(message, http_status)` on API failure.

**New endpoints** `app/api/v1/google_calendar.py` (`/api/v1/integrations/google-calendar`):
- `GET /authorize-url` (auth required) → `{url}`. State = itsdangerous-signed
  `{nonce, user_id}` (salt `simplecrm.gcal.state`, 10-min TTL); nonce also set as an
  HttpOnly cookie (same double-check as the login flow). Scopes:
  `openid email https://www.googleapis.com/auth/calendar.events`, `access_type=offline`,
  `prompt=consent`. The frontend fetches this URL with its Bearer token, then does
  `window.location.assign(url)` — a plain redirect can't carry the Bearer token.
- `GET /callback` (no auth; identity comes from signed state + cookie) → exchanges
  code, reads the Google email from the ID token / userinfo, upserts the connection,
  redirects to `{frontend_origin}/app/settings?tab=integrations&gcal=connected`
  (or `…&gcal_error=<code>` on failure).
- `GET /` (auth) → `{connected, google_email, sync_broken, connected_at}`
- `DELETE /` (auth) → best-effort revoke at Google, delete the row. Local events
  keep their data; synced events simply stop propagating (status set back to
  `not_synced`, `google_event_id` cleared).

**Events CRUD** `app/api/v1/events.py` (`/api/v1/events`):
- `POST /` `{deal_id, title, description?, location?, starts_at, ends_at, add_to_google}` —
  validates the deal is in-org and visible; creates the event; if `add_to_google`
  and the caller has a working connection, pushes to Google. **Local-first:** a
  Google failure never loses the event — it is saved with `google_sync_status=error`
  and the response carries that status so the UI can warn.
- `GET /?from=&to=&deal_id=` — org events overlapping the range, owner-scoped with
  the same `scope_by_owner` visibility rules as deals (admin sees all, etc.).
- `PUT /{id}` — edit fields; propagates a PATCH to Google when synced. Also accepts
  `add_to_google` to push a not-yet-synced event later or (false) to remove the
  Google copy. Only the event owner or an admin may modify.
- `DELETE /{id}` — deletes locally; best-effort delete in Google when synced.
- Google propagation always uses the **event owner's** connection (only the owner
  can toggle `add_to_google`; admins editing someone else's event update the Google
  copy through the owner's connection).

**Config additions** (`app/core/config.py`):
- `google_calendar_redirect_uri` (default `http://localhost:8000/api/v1/integrations/google-calendar/callback`)

**Ops prerequisite (manual, for owner):** in Google Cloud Console, enable the
Calendar API for the existing OAuth client and add the new redirect URI to the
authorized redirect URIs (dev + prod).

### Frontend

- **Settings → Integrations:** replace the static placeholder card for Google
  Calendar: shows connect button (logo + "Propojit Google Kalendář"), or connected
  state with the Google email, a reconnect hint when `sync_broken`, and disconnect.
  Handles `?tab=integrations&gcal=…` query params from the OAuth redirect via toast.
- **Deal detail:** new "Události" section listing the deal's upcoming + past events
  (title, date/time, Google badge when synced), with edit/delete; a "Naplánovat
  událost" button opens `EventFormModal` — title (prefilled from deal name), date,
  start/end time (native inputs), description, location, and a "Přidat do Google
  kalendáře" checkbox (disabled with a settings link when not connected).
- **Calendar page** `/app/calendar`, nav item "Kalendář" (lucide `CalendarDays`)
  between Obchody and Reporty. Custom Tailwind month grid (no new dependency):
  Monday-first Czech headers, prev/today/next controls, events rendered as chips,
  day click opens a day list; event click opens the same `EventFormModal` in edit
  mode with a link to the deal. Mobile: the grid collapses to an agenda list.
- Data hooks `useEvents`, `useCreateEvent`, `useUpdateEvent`, `useDeleteEvent`,
  `useGoogleCalendarStatus`, `useDisconnectGoogleCalendar` follow the existing
  React Query patterns; types come from `pnpm types:generate`.

### Error handling

- OAuth callback failures → redirect with `gcal_error` code, toast in settings.
- Google API failure on create/update → event saved, `google_sync_status=error`,
  warning toast ("Událost uložena, synchronizace s Googlem selhala").
- `invalid_grant` (revoked) → connection marked `sync_broken`; status endpoint and
  settings UI prompt reconnect; event mutations skip Google quietly but report status.
- Deleting a deal cascades its events (DB-level); Google copies of those events are
  not cleaned up in v1 (documented limitation — acceptable: user's own calendar).

### Testing

- Backend: pytest API tests for events CRUD (visibility scoping, validation,
  deal-in-org checks) and the integration endpoints (authorize-url shape, callback
  state validation, status, disconnect) with the Google HTTP client mocked;
  unit tests for token encrypt/decrypt round-trip and access-token refresh logic.
- Frontend: vitest for the month-grid date math helper; manual Playwright
  verification with screenshots for the three UI surfaces.

## Out of scope (v1)

- Two-way sync (importing events created in Google), recurring events, all-day
  events, attendees/invites, choosing a non-primary calendar, reminders/notifications.
