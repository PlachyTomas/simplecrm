# Calendar improvements + Google Calendar sync repair — plan (2026-07-22)

Owner request: (1) create events directly from the calendar, (2) fix the calendar's vertical
scroll / add week–month zoom / clarify the prev–Dnes–next controls, (3) diagnose and fix the
production `google_calendar_not_connected` 400 — silent renewal preferred.

Status: **DECIDED 2026-07-22** — T1: A+B · T2: Layout B (master-detail) + zoom toggle +
nav (a) · T3: degrade to save+flag; Phase 0 walkthrough delivered to owner. Implementation
not started.

---

## Task 1 — Create events directly from the calendar

### Findings

- `CalendarPage.tsx` has **no create path at all**: `EventFormModal` is mounted only with
  `event` (edit) — [CalendarPage.tsx:337-341](../../../frontend/src/app/calendar/CalendarPage.tsx#L337-L341).
- Create paths elsewhere: deal detail ("Naplánovat událost") and the dashboard quick action
  (unbound create with the deal picker — events are deal-bound, `deal_id NOT NULL`).
- `EventFormModal` prefills date/time via `defaultStart()` (next slot from *now*); it has no
  "start on this specific day" input. A small optional `initialDate` prop is needed for any
  calendar-driven create.

### Options

**A. "Nová událost" header button** — primary button in the calendar header; opens the
unbound-create modal (deal picker) prefilled with the *selected* day.
＋ Most discoverable; mirrors every other page's header CTA; trivial.
− Not contextual to a specific cell.

**B. Selected-day panel CTA** — "＋ Naplánovat" in the day-panel header plus the empty-state
("Zatím žádné události — naplánujte první."); prefilled with that day.
＋ Contextual — you're looking at the day you're scheduling; upgrades the dead empty state.
− Alone, it's below the fold of intent (user must select a day first).

**C. Hover "＋" on each day cell** — small plus appears in a cell's corner on hover
(desktop); click → create prefilled with that cell's date.
＋ Fastest calendar-app-like path.
− Hover-only affordance is invisible until discovered; needs a touch answer on mobile;
extra interaction surface inside cells that already have chips + selection.

**D. Double-click / drag a cell** — rejected: conflicts with click-to-select, no time axis
in a month grid, poor accessibility.

### Decision: A + B ✔

**A + B together** (header button for discoverability, panel/empty-state CTA for context);
**C later** if desired once the new layout settles. Both open the same modal; one new
`initialDate?: string` prop on `EventFormModal` (start 9:00 on that day, today → next slot).
Mobile agenda gets the header button only.

---

## Task 2 — Layout (no page scroll), week/month zoom, clearer navigation

### Findings

- `monthGrid` **always renders 42 cells (6 fixed weeks)** — comment says it "keeps the
  layout from jumping between months" ([calendarMath.ts:28-48](../../../frontend/src/app/calendar/calendarMath.ts#L28-L48)).
  For a 5-week month the entire 6th row is next-month days at `opacity-50`. Cells are
  `min-h-24` (96 px) → grid ≈ 600 px + day panel below (`mt-6`, unbounded, no own scroll)
  → the page scrolls ([CalendarPage.tsx:183](../../../frontend/src/app/calendar/CalendarPage.tsx#L183), [:292-307](../../../frontend/src/app/calendar/CalendarPage.tsx#L292-L307)).
- Header: `[‹] [Dnes] [›]` — "Dnes" literally sits between the month arrows
  ([CalendarPage.tsx:236-260](../../../frontend/src/app/calendar/CalendarPage.tsx#L236-L260)); the month name is the page h1, far left.
- No zoom; mobile has a separate agenda list (unaffected by all of this).

### Options

**Layout A — viewport-fit column (recommended).** The desktop calendar becomes a
`h-[calc(100vh-…)] flex flex-col`: the grid renders **only weeks containing ≥1 current-month
day** (5, occasionally 4 or 6) with slightly shorter cells; the day panel becomes
`flex-1 min-h-0 overflow-y-auto` — it absorbs all remaining height and scrolls internally.
＋ Directly answers "more vertical space for a scrollable day overview"; no page scroll ever.
− The grid height varies by ±1 row between months (the original fixed-42 rationale) — an
acceptable trade; the day panel absorbs the difference so the page doesn't jump.

**Layout B — master-detail split.** Grid left (~2/3), day panel right (full height,
scrollable) — the Kontakty pattern.
＋ Day panel always tall; no vertical competition at all.
− Bigger rewrite; grid cells get narrow on 13″ laptops; diverges from the current mental
model for modest gain.

**Layout C — compress only.** Keep 6 fixed weeks, shrink cells (`min-h-16`, chips → dots),
cap the panel height with internal scroll.
＋ Smallest diff.
− Cells lose the event-title chips; still renders a full ghost week; feels like a patch.

**Zoom control.** Segmented Týden | Měsíc toggle (the house radiogroup pattern used for
Karty | Tabulka). Week view: one 7-day row (taller cells, more visible chips), day panel
gets nearly the whole viewport; arrows page by week; period label becomes "14.–20. 7. 2026".
Zoom is session state for v1 (persisting to the user's `ui_state` JSONB is a cheap follow-up
if you want it sticky).

**Navigation clarity.**
- (a) *(recommended)* Page h1 becomes static "Kalendář"; the control cluster reads
  `[‹] [červenec 2026] [›]` — the thing between the arrows is now **the period being
  paged**, which is what makes arrows self-explanatory — with `[Dnes]` as a separate button
  after a visible gap, and the zoom toggle at the far right.
- (b) Keep month-as-h1, move Dnes out of the arrow pair with a divider. Cheapest, but the
  arrows still page "something written far away on the left".
- (c) Tooltips only — rejected, doesn't fix the reading order.

### Decision: Layout B (master-detail) + segmented zoom + nav (a) ✔

Owner chose the **split layout**: month/week grid left (~2/3 width), the selected-day panel
as a full-height, internally-scrolling column on the right (Kontakty pattern). Same header
row as proposed: `Kalendář · [‹] červenec 2026 [›] · [Dnes] ·· [Týden|Měsíc] · [Nová událost]`.
Implementation notes for B: adaptive weeks still apply (a 6-week ghost row would push the
grid past the viewport on 13″ laptops even in the split — trim weeks with no in-month days
and shorten cells slightly so the grid always fits); the right panel is `overflow-y-auto
min-h-0` with the day heading sticky; `calendarMath` gains `weekGrid()` + adaptive
`monthGrid()` (pure, unit-tested); `gridRange` unchanged; mobile agenda keeps its layout.

---

## Task 3 (MAJOR) — Google Calendar sync: root cause + repair

### How it works today (verified, file:line)

- One `GoogleCalendarConnection` row per user: Fernet-encrypted refresh token, cached
  access token (~1 h), `sync_broken` flag.
- On any event push, `get_valid_access_token` serves the cached access token; once expired
  it calls Google's token endpoint with the stored refresh token
  ([google_calendar.py:291-320](../../../backend/app/services/google_calendar.py#L291-L320)).
- **`invalid_grant` from that refresh is the only thing that sets `sync_broken=True`**
  ([google_calendar.py:312](../../../backend/app/services/google_calendar.py#L312)). Transient network/5xx errors do *not* flip it (correct).
- **The only recovery is a manual re-OAuth** via Settings → Integrace
  ([api/v1/google_calendar.py:144](../../../backend/app/api/v1/google_calendar.py#L144)). No scheduler touches connections; a broken
  connection stays broken forever unless the user finds that screen.
- With `sync_broken=True`, creating an event with `add_to_google` **hard-400s**
  (`_require_connection`, [events.py:202-216](../../../backend/app/api/v1/events.py#L202-L216)) — the exact error you hit. The frontend
  never surfaces this code (generic toast), and the event-form checkbox is gated by a
  status query with 30 s staleness and no refocus refetch, so a long-lived tab happily
  submits `add_to_google=true` after the flag flips.

### Root cause (ranked)

1. **HIGH — OAuth consent screen in "Testing" publishing status.** Google *always* expires
   refresh tokens 7 days after consent for Testing-status apps (official:
   support.google.com/cloud/answer/15549945). Fits perfectly: connect works, ~a week later
   every push refresh gets `invalid_grant` → `sync_broken=True` → permanent 400s.
2. MEDIUM — grant revoked Google-side (user security page, password change with Gmail
   scopes, 100-tokens-per-client cap, 6-month inactivity).
3. Contributing either way: no automatic recovery, and the only reconnect prompt hides in
   Settings → Integrace, so the broken state persists and presents as this 400.

Google returns the **same `invalid_grant` body for every cause** — they are not
distinguishable from the API response.

### The hard truth about "automatic silent renewal"

Once Google invalidates a refresh token, **no server-side action can renew it silently** —
a new grant requires the user to click through Google's consent screen (OAuth's security
model; `prompt=consent` + `access_type=offline` merely guarantee the *re-auth* yields a
fresh refresh token). What we *can* do silently is (a) remove the main expiry cause,
(b) prevent the inactivity cause, and (c) make the one unavoidable click instant and
impossible to miss. That's the plan:

### Proposed fix, in phases

**Phase 0 — unblock production (no code, ~10 min, owner action):**
1. Settings → Integrace → *Znovu připojit* — restores sync immediately.
2. Google Cloud Console → OAuth consent screen: if publishing status is **Testing, switch
   to In production** (this alone removes the 7-day expiry — the probable permanent fix).
   Calendar scope may prompt for verification; note what it says.
3. While there: confirm the connect flow requests `access_type=offline` (code does) and
   whether `prompt=consent` is set (to be verified in implementation either way).

**Phase 1 — silent-resilience (backend):**
- **Keep-alive scheduler**: weekly job (house scheduler pattern in `main.py`) refreshing
  every connection's access token. Resets Google's 6-month inactivity clock, heals
  transient failures, and *detects* revocation within a week instead of at the moment you
  create an event.
- **Persist rotated refresh tokens**: `refresh_access_token` currently ignores any
  `refresh_token` in Google's response ([google_calendar.py:224-231](../../../backend/app/services/google_calendar.py#L224-L231)); save it when present.
- **One bounded retry** on `invalid_grant` before flipping `sync_broken` (per Google's own
  error guidance; never retry it in a loop).
- **Stop failing event writes on Google state** *(DECIDED ✔)*: `add_to_google` on a broken
  connection degrades — save the CRM event, mark `google_sync_status=error`, return 2xx —
  instead of 400ing the whole request. Google is a mirror; the CRM record is never hostage
  to it.
- Structured log line on every `invalid_grant` (user id + google_email + connection age)
  so prod recurrence is diagnosable from logs.

**Phase 2 — make the one click unmissable (frontend):**
- Map the `google_calendar_not_connected` code in `lib/api` to a specific message with a
  reconnect link (today: generic toast).
- `EventFormModal`: refetch status on open; when broken, replace the disabled checkbox
  with an inline "Google kalendář odpojen — Znovu připojit" action that launches the OAuth
  flow directly (returns to where you were).
- Calendar page banner while `sync_broken` — the calendar is where the user actually
  lives, not Settings.
- Reconnect keeps the same connection row (event-ID mappings survive).

**Phase 3 — deferred (YAGNI for now):** e-mail nudge after N days broken; Google RISC
(revocation webhooks); admin-visible last-sync health.

### Effort estimate

Phase 1 ≈ half a day incl. backend tests (scheduler test, retry test, degrade test);
Phase 2 ≈ half a day incl. vitest + Playwright pass; Tasks 1+2 together ≈ a day incl.
calendarMath unit tests and Playwright verification at 1280/768/390.

---

## Decisions (recorded 2026-07-22)

1. Task 1: **A+B** — header button + day-panel CTA. ✔
2. Task 2: **Layout B** (master-detail split) + zoom toggle + nav (a). ✔
3. Task 3: **degrade to save + sync-error + reconnect CTA**. ✔
4. Task 3 Phase 0: owner runs it with a step-by-step walkthrough (delivered in chat;
   summary: reconnect in Settings → Integrace, then Google Cloud Console → OAuth consent
   screen/Audience → if publishing status is Testing, Publish app, then reconnect once more
   so the new grant is issued under Production rules).
