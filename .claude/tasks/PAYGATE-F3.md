# PAYGATE-F3 — Trial countdown UI updates

Source: `docs/prompts/PAYGATE_TASK.md` §6 F3 + `RESUME.md`.

## Scope

The header badge in `AppShell.tsx` already changes color along the
`tertiary → warning → danger` ladder as the trial winds down (lines
43–44). What's missing is the **upgrade CTA** and a way to **hide the
badge entirely for non-trialing orgs** (paid / comp / canceled).

This task is small. Don't rewrite the badge — extend it.

## Files touched

- `frontend/src/components/billing/useCurrentSubscription.ts` — new.
  TanStack Query hook for `GET /api/v1/organizations/current/subscription`.
  Caches 60s. Returns `undefined` on error/loading so callers can fall
  back to default behavior.
- `frontend/src/app/AppShell.tsx` — extend the existing badge:
  - Add a small `Vybrat plán →` link (renders only when ≤ 7 days,
    bolder when ≤ 3 days).
  - Hide the entire badge when subscription resolves and
    `access_status !== 'trialing'`.
  - Wire the CTA's `to` to `/app/settings` per RESUME ("F5 builds the
    real `/app/nastaveni/predplatne` route — for F3 land on settings").
- `frontend/src/__tests__/App.test.tsx`,
  `frontend/src/__tests__/shell.test.tsx`, and any other test that
  uses `mockImplementation` with a throw-on-unexpected for
  `/api/v1/auth/me` — extend the mock to accept the new
  `/api/v1/organizations/current/subscription` call returning a 4xx
  or simply throwing (caller treats as no-data and falls back). The
  hook swallows ApiError so a 404/500 is fine.

No backend changes.

## Behaviour

| State | Color | Copy | CTA |
| --- | --- | --- | --- |
| `> 7d` left | `text-text-tertiary` | existing copy | none |
| `≤ 7d` left | `text-warning` | existing copy | `Vybrat plán →` (small, regular weight) |
| `≤ 3d` left | `text-danger` | existing copy | `Vybrat plán →` (small, semibold) |
| `access_status ≠ 'trialing'` | hidden | — | — |

Wording stays the existing `Zkušební doba do {date} · {N} {csNoun(N, "den")} {zbývá|zbývají}`. The brief's literal "dní" hardcode is wrong for `1` ("den") and `2-4` ("dny") — keep the existing `csNoun` correctness.

## Subscription fetch — defensive

The hook returns `undefined` on:

- Loading
- 401 / 403 / 404 / 5xx (any `ApiError`)
- Network error

Caller treats `undefined` as "we don't know — don't gate on it." So
the badge still renders for trial orgs even if the subscription fetch
hasn't completed. We only **hide** when we positively know
`access_status` is something other than `'trialing'`.

This is forward-looking: today every org is `trialing` by B1's
backfill, so the gate is effectively a no-op until F4/F5 add the
choose-plan flow that flips orgs to `pending_activation`/`active`.

## Verification

Per CLAUDE.md, use Playwright MCP:

1. Start backend + frontend.
2. Log in as a real user (or use the dev login flow).
3. With existing org's `trial_ends_at` 45+ days out: verify badge
   tertiary, no CTA. Screenshot.
4. Adjust `trial_ends_at` via psql to 5 days from now: verify
   warning + small CTA. Screenshot.
5. Adjust to 2 days from now: verify danger + bolder CTA. Screenshot.
6. Click `Vybrat plán →` → lands on `/app/settings`.
7. Manually flip the org's subscription `status` to `'active'`:
   verify the badge disappears.
8. Reset DB state.

If the dev-login flow is too cumbersome for the four states, set
`trial_ends_at` directly via SQL on `simplecrm-postgres-1` between
screenshots.

## Acceptance for F3

- The badge color/copy ladder is unchanged for existing >7d behavior.
- A `Vybrat plán →` link appears at ≤7d (warning) and ≤3d (danger,
  bolder) and routes to `/app/settings`.
- When the subscription read returns a non-trialing
  `access_status`, the badge is hidden.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` all green.
- All existing shell-rendering tests still pass (mocks extended for
  the new fetch where they `throw on unexpected`).

## Commit

`feat(billing): trial countdown with upgrade CTA`

## Out of scope

- F4 trial-expired pay gate (full-screen takeover).
- F5 `/app/nastaveni/predplatne` route (this F3 lands the CTA on
  `/app/settings`; F5 wires the deep link).
- Adjusting `TrialBanner.tsx` (separate surface, different
  ≤3-day ribbon — leave alone).
- Backend changes — `/subscription` already exists.
