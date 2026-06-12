# Google Calendar Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-user Google Calendar connection + deal events with optional one-way push to Google, plus an in-app calendar page.

**Architecture:** Local-first `calendar_events` table (source of truth) tied to deals; a separate OAuth flow (scope `calendar.events`) stores per-user encrypted refresh tokens in `google_calendar_connections`; pushes mirror events to the owner's primary Google calendar and remember `google_event_id` for later edit/delete propagation. Spec: `docs/superpowers/specs/2026-06-12-google-calendar-integration-design.md`.

**Tech Stack:** FastAPI + SQLAlchemy async + Alembic, httpx for Google REST, Fernet (via `cryptography`, already transitive) for token encryption, React + TanStack Query + Tailwind custom month grid (no new frontend deps).

---

### Task 1: Backend models + migration

**Files:**
- Create: `backend/app/db/models/calendar_event.py`
- Create: `backend/app/db/models/google_calendar_connection.py`
- Modify: `backend/app/db/models/enums.py` (add `GoogleSyncStatus`)
- Modify: `backend/app/db/models/__init__.py` (register both models + enum)
- Create: `backend/alembic/versions/20260612_*_calendar_events_google_connections_*.py` (autogenerate)

**Model `GoogleCalendarConnection`** (table `google_calendar_connections`):
- `id` UUID PK default uuid4
- `user_id` FK `users.id` ondelete CASCADE, `unique=True`, not null
- `organization_id` FK `organizations.id` ondelete CASCADE, not null, indexed
- `google_email: str` String(320) not null
- `refresh_token_encrypted: str` Text not null
- `access_token_encrypted: str | None` Text
- `access_token_expires_at: datetime | None` DateTime(timezone=True)
- `sync_broken: bool` default False server_default "false"
- `created_at` / `updated_at` like Deal

**Model `CalendarEvent`** (table `calendar_events`):
- `id` UUID PK default uuid4
- `organization_id` FK orgs CASCADE not null
- `deal_id` FK `deals.id` CASCADE not null
- `owner_user_id` FK `users.id` SET NULL nullable
- `title` String(200) not null; `description` Text nullable; `location` String(200) nullable
- `starts_at` / `ends_at` DateTime(timezone=True) not null, CheckConstraint `ends_at > starts_at` name `ck_calendar_events_ends_after_starts`
- `google_event_id` String(1024) nullable
- `google_sync_status` Enum(GoogleSyncStatus) not null default `not_synced` (enum values: `not_synced`, `synced`, `error`)
- `created_at` / `updated_at`
- Indexes: organization_id, deal_id, owner_user_id, starts_at
- Relationships: organization, deal, owner

- [x] Step 1: Write models, register in `__init__`
- [x] Step 2: `uv run alembic revision --autogenerate -m "calendar events + google connections"`, review the diff (stripped unrelated drift noise from autogen)
- [x] Step 3: `uv run alembic upgrade head` against dev DB
- [x] Step 4: Commit `feat(db): calendar events + google calendar connections` (89121ca)

### Task 2: Token crypto + Google Calendar service

**Files:**
- Create: `backend/app/core/token_crypto.py` — Fernet encrypt/decrypt, key = `base64.urlsafe_b64encode(sha256(settings.jwt_secret).digest())`
- Create: `backend/app/services/google_calendar.py`
- Modify: `backend/app/core/config.py` — add `google_calendar_redirect_uri`
- Test: `backend/tests/services/test_google_calendar.py`, `backend/tests/core/test_token_crypto.py` (or fold into services test dir per existing layout)

`google_calendar.py` surface (httpx, mirrors comgate.py “pure transport” style):
- `GCAL_SCOPES = ("openid", "email", "https://www.googleapis.com/auth/calendar.events")`
- `class GoogleCalendarError(Exception)` with `message`, `http_status`
- `class GoogleCalendarAuthError(GoogleCalendarError)` — invalid_grant / revoked
- `build_authorize_url(state) -> str` (same Google authorize endpoint, `access_type=offline`, `prompt=consent`, `include_granted_scopes=false`)
- `exchange_code(code) -> GoogleTokenBundle` (dataclass: access_token, refresh_token, expires_in, email — email parsed from id_token claims without verification is NOT ok; fetch userinfo with access token like login flow does)
- `refresh_access_token(refresh_token) -> (access_token, expires_in)`; raises `GoogleCalendarAuthError` on `invalid_grant`
- `revoke_token(token) -> None` best-effort POST `https://oauth2.googleapis.com/revoke`
- `insert_event(access_token, payload) -> str` (returns Google event id), `patch_event(access_token, event_id, payload)`, `delete_event(access_token, event_id)` against `https://www.googleapis.com/calendar/v3/calendars/primary/events`; 401 raises `GoogleCalendarAuthError`, 404 on delete/patch tolerated by callers
- `event_payload(title, description, location, starts_at, ends_at) -> dict` — RFC3339 UTC
- `get_valid_access_token(session, connection) -> str` — cached if >60s left, else refresh + persist; marks `sync_broken=True` + raises on auth error
- Protocol + `get_google_calendar_client()` dependency for test stubbing (like `GoogleOAuthClient`)

- [x] Steps: TDD crypto round-trip; service tests with httpx.MockTransport; commit `feat(gcal): google calendar client service + token crypto` (eda2020) — 13 tests passing

### Task 3: Integration endpoints

**Files:**
- Create: `backend/app/api/v1/google_calendar.py` (router prefix `/integrations/google-calendar`, tag `integrations`)
- Create: `backend/app/schemas/google_calendar.py` — `GoogleCalendarStatusOut {connected, google_email|None, sync_broken, connected_at|None}`, `AuthorizeUrlOut {url}`
- Modify: `backend/app/api/v1/__init__.py` — mount. Auth’d routes under PROTECTED_DEPS? No: mount WITHOUT global deps; per-route deps because `/callback` must be public (browser redirect, no Bearer). Status/authorize-url/disconnect use `Depends(require_org_membership)` + trial gate not needed (integration mgmt is fine to allow; keep consistent: use PROTECTED_DEPS semantics per-route via `require_org_membership` + `require_active_trial_or_subscription`).
- Modify: `backend/app/core/security.py` — add `GCAL_STATE_SALT = "simplecrm.gcal.state"` + `sign_gcal_state` / `verify_gcal_state` (mirror oauth helpers)
- Test: `backend/tests/api/v1/test_google_calendar.py`

Routes:
- `GET /authorize-url` (auth) → signs `{nonce, user_id}`, returns `{url}`; sets `simplecrm_gcal_state` HttpOnly cookie (path `/api/v1/integrations/google-calendar`, 600s)
- `GET /callback?code&state` (+ `error` param when user denies) → verify cookie matches state (compare_digest), verify signature/TTL, load user from `state.user_id`; exchange code; upsert connection (per user_id); redirect `{frontend_origin}/app/settings?tab=integrations&gcal=connected` or `...&gcal_error={denied|invalid_state|exchange_failed}`; always delete state cookie
- `GET /` (auth) → status from connection row
- `DELETE /` (auth) → best-effort revoke refresh token, delete row, clear `google_event_id`/set `not_synced` on the user's events? NO — keep google_event_id? Spec says: status back to not_synced + clear google_event_id. 204.

- [x] Steps: TDD with stub client; commit `feat(gcal): connect/disconnect endpoints + status` (b010351) — 11 tests passing

### Task 4: Events CRUD + Google propagation

**Files:**
- Create: `backend/app/api/v1/events.py` (prefix `/events`, tag `events`)
- Create: `backend/app/schemas/calendar_event.py`:
  - `CalendarEventCreate {deal_id, title(1..200), description?, location?(..200), starts_at, ends_at, add_to_google: bool=False}` + validator ends_at > starts_at
  - `CalendarEventUpdate {title?, description?, location?, starts_at?, ends_at?, add_to_google?: bool}`
  - `CalendarEventOut {id, organization_id, deal_id, deal_name, owner_user_id, title, description, location, starts_at, ends_at, google_event_id?, google_sync_status, created_at, updated_at}`
  - List: `Page[CalendarEventOut]` reuse pagination schema; query `from`/`to` (`datetime`), `deal_id`
- Modify: `backend/app/api/v1/__init__.py` — mount with PROTECTED_DEPS
- Test: `backend/tests/api/v1/test_events.py`

Rules:
- create: deal must exist in caller’s org + be visible (scope_by_owner on Deal.owner_user_id); owner_user_id = caller
- list: overlap filter `starts_at < to AND ends_at > from`; scope_by_owner on CalendarEvent.owner_user_id; order starts_at asc; limit/offset
- update/delete: owner or admin only (manager not, keep simple per spec "owner or admin")
- Google: only the OWNER's connection is used. add_to_google=True on create/update → push (insert or patch); update of synced event → patch; add_to_google=False on update of synced event → delete google copy + clear; delete of synced event → best-effort google delete. All Google failures: keep local change, set status `error` (auth errors also set sync_broken on connection). Caller without connection + add_to_google → 400 `{"code": "google_calendar_not_connected"}`.

- [ ] Steps: TDD CRUD + visibility + validation with stubbed client; commit `feat(events): deal events CRUD with optional google sync`

**⏸ RESUME HERE (session paused 2026-06-12, mid-Task 4):**
- DONE (committed as WIP): `app/schemas/calendar_event.py`, `app/api/v1/events.py`, router mounted in `app/api/v1/__init__.py`. Code written but **NOT yet tested/linted** — no test file exists yet.
- NEXT: write `backend/tests/api/v1/test_events.py` (reuse FakeGoogleCalendarClient + seeding helpers from `tests/api/v1/test_google_calendar.py`; deal seeding via `create_default_pipeline` like `tests/api/v1/test_deals.py`). Planned coverage: create happy path (not_synced); add_to_google without connection → 400 `google_calendar_not_connected`; add_to_google with connection → synced + google_event_id; google failure → 201 with status `error` (local-first); deal from another org → 400; ends<=starts → 422; list overlap window (`from`/`to` aliases) + deal_id filter; scoping (salesperson vs admin); update by owner (patches google); update add_to_google=false (removes google copy → not_synced); update by other salesperson → 403; delete by owner/admin (best-effort google delete); 404 patch → re-insert path.
- THEN: `uv run ruff check . && uv run ruff format . && uv run mypy app` + run new tests with `DATABASE_URL=postgresql+asyncpg://simplecrm:simplecrm@localhost:5432/simplecrm uv run pytest tests/api/v1/test_events.py` (postgres via `docker compose -f docker-compose.dev.yml up -d postgres`; it IS currently running). Then amend/commit as `feat(events): deal events CRUD with optional google sync`.
- THEN continue Tasks 5–8 (frontend) per plan below. Design doc: `docs/superpowers/specs/2026-06-12-google-calendar-integration-design.md`.

### Task 5: Frontend types + integrations settings UI

- [ ] Backend running, `pnpm types:generate`, `pnpm types:check`
- [ ] `frontend/src/app/settings/useGoogleCalendar.ts` — `useGoogleCalendarStatus`, `useGoogleCalendarConnect` (fetch authorize-url → `window.location.assign`), `useGoogleCalendarDisconnect`
- [ ] Replace Google Calendar placeholder in `IntegrationsSection` (SettingsPage.tsx): connected state shows google_email + "Odpojit"; disconnected shows "Propojit"; `sync_broken` shows warning + reconnect; read `gcal`/`gcal_error` query params → toast + clean URL (SettingsPage already reads `tab` param)
- [ ] Commit `feat(settings): google calendar connect/disconnect UI`

### Task 6: Deal detail events section + event modal

- [ ] `frontend/src/app/events/useEvents.ts` — useEvents({from,to,dealId}), useCreateEvent, useUpdateEvent, useDeleteEvent (+ invalidation)
- [ ] `frontend/src/app/events/EventFormModal.tsx` — create/edit; fields title, date, start/end time (native inputs), description, location, checkbox "Přidat do Google kalendáře" (disabled + link to settings when not connected; checked default when connected); edit of synced event keeps checkbox checked; uncheck removes from Google
- [ ] `frontend/src/app/deals/DealDetailPage.tsx` — "Události" card under the details card: upcoming first, then past (muted); each row: title, formatted date/time, Google badge (synced) / warning (error), edit + delete buttons; "Naplánovat událost" button opens modal with deal prefill
- [ ] Commit `feat(deals): events section + event form modal`

### Task 7: Calendar page + nav

- [ ] `frontend/src/app/calendar/calendarMath.ts` — `monthGridDays(year, month)` Monday-first 6×7 grid + helpers; vitest `calendarMath.test.ts`
- [ ] `frontend/src/app/calendar/CalendarPage.tsx` — month view: header (month name + rok, prev/Dnes/next), 7-col grid, event chips (truncate, +N více), today highlighted, other-month days muted; click event → EventFormModal edit; click day → opens day detail list (side panel on desktop); mobile (<md): agenda list of events for the month
- [ ] Route `/app/calendar` in `App.tsx` + Sidebar item "Kalendář" (CalendarDays icon) + MobileTabBar if it lists same items
- [ ] Commit `feat(calendar): in-app calendar page`

### Task 8: Verification

- [ ] Backend: `uv run pytest` clean; `uv run ruff check`, `uv run mypy` (45 passed; ruff+mypy+black clean)
- [ ] Frontend: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm types:check && pnpm test && pnpm build` (all green)
- [ ] Playwright manual pass: settings integrations card, deal detail event create (Google checkbox visible+disabled when not connected), calendar page render; screenshots; close browser (screenshots in docs/screenshots/gcal-*.png)
- [ ] Final commit + update this plan checkboxes
