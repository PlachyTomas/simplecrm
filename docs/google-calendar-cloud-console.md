# Google Cloud Console — enable in-app calendar → Google Calendar sync

Owner runbook for the Google side of the calendar integration. The app code is done
(merged 2026-07-22, `1a72785`): it requests scopes `openid email
https://www.googleapis.com/auth/calendar.events` with `access_type=offline` +
`prompt=consent`, and degrades gracefully when the connection is broken. What remains is
console configuration + a reconnect. Root-cause context:
`docs/superpowers/plans/2026-07-22-calendar-and-google-sync-plan.md` (Task 3).

> Console note: Google reshuffled this UI in 2024/25. The old **APIs & Services → OAuth
> consent screen** is now **Google Auth Platform** in the left nav, split into
> **Branding / Audience / Clients / Data Access**. Both paths are given below.

## Part 1 — Verify the base setup (~3 min, likely already correct)

Sync worked before it started 400ing, so these should already be in place — verify, don't
re-create.

1. Open <https://console.cloud.google.com> and select the SimpleCRM project — the one
   whose OAuth client ID matches `GOOGLE_CLIENT_ID` in Coolify's env.
2. **Enable the Calendar API**: APIs & Services → Library → search "Google Calendar API"
   → it should say *API enabled*. If not, click **Enable**.
3. **Redirect URIs**: APIs & Services → Credentials (or Google Auth Platform → Clients)
   → open the OAuth 2.0 client. **Authorized redirect URIs** must contain BOTH backend
   callbacks (login and calendar use the same client but different callbacks):
   - `https://api.simplecrm.cz/api/v1/auth/google/callback`
   - `https://api.simplecrm.cz/api/v1/integrations/google-calendar/callback`
   - dev equivalents if missing: `http://localhost:8000/api/v1/auth/google/callback`,
     `http://localhost:8000/api/v1/integrations/google-calendar/callback`
4. **Scopes on record**: Google Auth Platform → Data Access (old UI: OAuth consent
   screen → Scopes) → **Add or remove scopes** → make sure
   `https://www.googleapis.com/auth/calendar.events` (listed under Google Calendar API,
   marked *sensitive*) plus `openid` and `.../auth/userinfo.email` are listed. This list
   drives the verification flow; the app requests them at runtime regardless.

## Part 2 — The actual fix: publishing status (~2 min)

This is the HIGH-likelihood root cause of prod sync dying weekly: **apps in "Testing"
status get every refresh token expired 7 days after consent**
(support.google.com/cloud/answer/15549945). Connect works, then ~a week later every
refresh gets `invalid_grant` → `sync_broken` → the old 400s.

5. Google Auth Platform → **Audience** (old UI: OAuth consent screen). Check
   **Publishing status**.
6. If it says **Testing** → click **Publish app** → confirm. Done — this alone removes
   the 7-day expiry.
7. A dialog may say the app **requires verification** because `calendar.events` is a
   sensitive scope. Publish anyway:
   - Unverified-but-published is a legitimate state: tokens no longer expire in 7 days.
   - Users connecting see Google's "unverified app" warning once and click
     *Advanced → Go to simplecrm.cz (unsafe)* — acceptable while user count is small.
   - The unverified cap is 100 total grant users for sensitive scopes; submit for
     verification (Branding page → prepare privacy-policy URL + domain verification +
     scope justification) only when approaching that or to remove the warning screen.
   - Note whatever the dialog actually says — if it blocks publishing outright, that's
     new behavior worth revisiting.

## Part 3 — Reconnect in the app (~1 min)

Publishing does NOT resurrect already-expired tokens — a fresh grant is required, issued
under Production rules.

8. In the prod app (`app.simplecrm.cz`): **Settings → Integrace → Znovu připojit**, click
   through the Google consent (incl. the unverified-app warning if shown). The existing
   connection row is reused, so event-ID mappings survive.
9. Verify end-to-end: create an event in the in-app calendar with *Přidat do Google*
   checked → it appears in the connected Google Calendar within moments.
10. Anyone who reconnected *before* step 6 must reconnect once more *after* it — their
    grant was still issued under Testing rules.

## Ongoing expectations

- After Phase-1 hardening (weekly keep-alive, rotated-token persistence), a healthy
  Production connection should survive indefinitely; the remaining break causes are
  user-side revocation (Google security page, password change) — surfaced in-app via the
  calendar banner + modal reconnect, and diagnosable via the structured `invalid_grant`
  log line (user id + google_email + connection age).
