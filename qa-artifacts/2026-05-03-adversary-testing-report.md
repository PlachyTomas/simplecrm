# SimpleCRM adversary-testing report

- **Date:** 2026-05-03
- **Tester:** Claude Code (assumed-evil end user with a normal account)
- **Target:** Backend `http://localhost:8000` (FastAPI), default dev compose
- **Scope:** paygate / seat enforcement, super-admin escalation, cross-org data
  exfiltration, and any other in-scope app-layer attack
- **Out of scope:** infra (Postgres, OS), DoS, network attacks, social engineering,
  Stripe/payments rail (none implemented), Google OAuth provider itself

## TL;DR

Two real, exploitable issues — both in the seat-cap enforcement layer — let an
ordinary org admin (the lowest-privileged user with billing power) inflate or
sustain seat capacity beyond what they're paying for. The "super-admin"
boundary, cross-org isolation, and JWT plumbing all held up under direct
attack. The most concerning finding (HIGH) is fully reproducible end-to-end.
The downsize-related findings (MEDIUM) are confirmed by code review but
require a populated multi-user org to lab-reproduce.

| # | Severity | Title | Status |
|---|---|---|---|
| 1 | HIGH | Org admin can self-bump `Subscription.seat_count` to 500 with no payment | Lab-confirmed |
| 2 | MEDIUM | Queued downsize is bypassable by hiring before super-admin activation | Code review |
| 3 | MEDIUM | `PATCH /users/{id}` re-activates without seat-cap check | Code review |
| 4 | LOW | Invitation seat-cap check is TOCTOU (unbounded race window) | Code review |
| 5 | LOW | Activities endpoint is org-scoped only, not visibility-scoped | Code review |
| 6 | LOW | `is_app_access_allowed` returns True forever for `past_due` + NULL `ends_at` | Code review |
| 7 | INFO | Choose-plan transitions trial → `pending_activation`, gating the user out | Lab-confirmed (UX footgun, not security) |

Verified-correct boundaries (attempted, defended): super-admin gate, JWT secret
override, cross-org IDOR on `/admin`, mass-assignment for `is_super_admin`,
invitation revocation cross-org, OAuth state CSRF, refresh-token rotation
allowlist.

---

## Finding 1 — HIGH — Org admin self-bumps seat_count to 500 with zero billing

### Where
- `backend/app/api/v1/subscription.py` — `update_seat_count` "Increase" branch
- `backend/app/schemas/billing.py:UpdateSeatCountIn` — `seat_count: int = Field(ge=1, le=500)`
- `backend/app/services/invitations.py:create_invitation` reads `sub.seat_count`
  as the cap on `active_users + open_invitations`

### What
`PUT /api/v1/organizations/current/subscription/seat-count` is `require_role(admin)`,
**not** super-admin, and accepts any value 1..500 from the org admin
themselves. When the new value is ≥ active user count, the endpoint applies
it immediately:

```python
# subscription.py
if new_count >= active_count:
    sub.seat_count = new_count
    sub.pending_seat_count = None
    sub.pending_user_deactivations = None
    await session.commit()
```

There is no check whatsoever that the org has *paid* for those seats. The
"contracted seat count" exists only as a self-declared field that the org
admin sets unilaterally; the only guardrail is the schema cap of 500.

### Reproduction (lab-confirmed)
```bash
# 1. Provision a brand-new org via dev-login (mints a JWT, default trial,
#    seat_count = 1, plan = "trial").
TOKEN=$(curl -s -X POST localhost:8000/api/v1/auth/dev-login \
  -H 'content-type: application/json' \
  -d '{"email":"attacker-evil@evil-corp.io"}' | jq -r .access_token)

# 2. Bump seat_count from 1 → 500 — no payment, no super-admin involvement.
curl -X PUT localhost:8000/api/v1/organizations/current/subscription/seat-count \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"seat_count":500,"deactivate_user_ids":[]}'
# → HTTP 200, {"seat_count": 500, "plan": {"code":"trial"}, "access_status":"trialing"}

# 3. Issue invitations up to 499 colleagues — all 201 Created.
for i in 1 2 3; do
  curl -X POST localhost:8000/api/v1/invitations \
    -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
    -d "{\"email\":\"victim$i@somewhere.cz\",\"role\":\"salesperson\"}"
done
# → 3× HTTP 201
```

### Impact
- During the 30-day trial: free 500-seat capacity for any newly-signed-up
  org. With the dev-login pathway also exposed (see "Configuration risks"
  below), a single attacker can spin up arbitrarily many such orgs.
- After the trial: the founder, on the super-admin "Aktivovat" screen, sees
  `seat_count = 500` and is *expected* to bill for it manually. The exploit
  window closes only if the founder notices. There is no UI hint that the
  customer self-set this number rather than negotiating it.
- Bill is computed `effective_price × user_count` (not × seat_count) in
  `subscription.py:get_current_billing_summary` — so post-activation the
  "loss" is bounded by however many people the admin actually invites, but
  the *capacity* to invite them is the bypass.

### Suggested fix
Treat `seat_count` as a contract field, not a customer-controlled setting.
Two options:
1. Move `update_seat_count` behind `require_super_admin`, and have org
   admins request seat increases via a new "request more seats" workflow
   that emails the founder.
2. Keep the self-serve endpoint but cap at the highest seat count the org
   has been activated for (track on `Subscription.contracted_seat_count`,
   distinct from the live cap). Reductions only ever reduce; increases
   require activation.

---

## Finding 2 — MEDIUM — Downsize-queue bypass via mid-period invitations

### Where
- `services/invitations.py:create_invitation` checks `active + open >= sub.seat_count`
- `services/billing.py:activate_subscription` only deactivates the IDs that
  were in `pending_user_deactivations` at the time of the queue, then drops
  `seat_count` to `pending_seat_count`

### What
After an admin queues a downsize (e.g. `seat_count=10`, `pending_seat_count=3`,
`pending_user_deactivations=[uA,uB]`), they can still invite new users up to
the *current* `seat_count=10` until super-admin activation. Activation:

1. Marks only `uA` and `uB` inactive (the originally-named victims).
2. Sets `seat_count=3`.
3. Leaves any new hires from step 0 fully active.

Result: the org ends a billing period contracted for 3 seats but with up to
5 active users (3 non-victims + 2 newly-hired). New invitations after
activation are blocked (cap is 3, active is 5), but the over-cap users
keep working indefinitely.

### Status
Not lab-reproduced — would require a populated multi-user org with the
super-admin "Aktivovat" flow, which isn't available without setting
`is_super_admin=true` via SQL. Confirmed by reading `activate_subscription`
(lines ~172–187 of `services/billing.py`) and the invitation seat check
(lines ~159–172 of `services/invitations.py`).

### Suggested fix
In `create_invitation`, gate against `min(sub.seat_count, sub.pending_seat_count or sub.seat_count)`.
Alternatively, in `activate_subscription`, if `active_count_after > pending_seat_count`,
deactivate the most recently activated users (or refuse to apply the queue
and surface to the super-admin).

---

## Finding 3 — MEDIUM — `PATCH /users/{id}` re-activates without seat-cap check

### Where
- `api/v1/users.py:update_user` (no seat check on `is_active=True`)

### What
`UserUpdate` accepts `is_active`, and the handler writes it directly:
```python
if "is_active" in data and data["is_active"] is not None:
    target.is_active = data["is_active"]
```
There is no comparison against `Subscription.seat_count`. So after a
downsize:
1. Org has 5 users, downsizes to 3, two are deactivated at activation.
2. Admin calls `PATCH /users/{victim_id}` with `{"is_active": true}`.
3. Now 4 active users on a 3-seat contract.
4. Repeat for the second victim → 5 active users on 3 seats.

Same family as finding 2 but doesn't even require timing the activation —
admin can do this whenever, including months later.

### Status
Not lab-reproduced — same multi-user constraint. Confirmed by reading
`api/v1/users.py:67–101`.

### Suggested fix
On `is_active=True` writes, count active users in the org and 422 if
the change would push past `Subscription.seat_count`. Mirror the message
format used by `SeatLimitReachedError` for consistency.

---

## Finding 4 — LOW — Invitation seat-cap check is TOCTOU

### Where
- `services/invitations.py:create_invitation`

### What
The seat-limit check is a non-locking read:
```python
active_count = (await session.execute(...)).scalar_one()
open_invite_count = (await session.execute(...)).scalar_one()
if active_count + open_invite_count >= sub.seat_count: raise ...
```

Two simultaneous `POST /invitations` requests can both pass the check and
both insert, giving the org one more open invitation than `seat_count`
allows. Limited blast radius (a handful of seats at most under realistic
contention), but adds up if scripted.

### Suggested fix
Take a `SELECT … FOR UPDATE` on the `Subscription` row at the start of the
handler, or use a Postgres advisory lock keyed on `organization_id`.

---

## Finding 5 — LOW — Activities endpoint is org-scoped, not visibility-scoped

### Where
- `api/v1/activities.py:list_activities`

### What
`GET /api/v1/activities?entity_type=deal&entity_id={uuid}` filters only on
`Activity.organization_id == user.organization_id` — not on the caller's
team-visibility scope. A salesperson who knows another team's deal UUID can
read its `stage_change`, `deal_won`, `deal_lost` activity rows, leaking
deal value, currency, and lost-reason free text from outside their
visibility scope.

### Status
Code-only finding. Lab repro requires a multi-user org with cross-team
deals; UUIDs are not enumerable, so practical exploitation requires
side-channel knowledge of a deal ID.

### Suggested fix
When `entity_type=deal` or `entity_type=company`, scope the underlying
table by the same `scope_by_owner` rule the `/deals` and `/companies`
endpoints use, then only emit activity rows for IDs the caller can see.

---

## Finding 6 — LOW — `past_due` + NULL `current_period_ends_at` returns access forever

### Where
- `services/billing.py:is_app_access_allowed`

### What
```python
if sub.status == "past_due":
    ends = sub.current_period_ends_at
    if ends is None:
        return True
    return moment - ends < PAST_DUE_GRACE
```
A `past_due` row whose `current_period_ends_at` is NULL is considered
in-grace forever. No current code path produces this state, but a future
scheduled-job that flips `active → past_due` without writing
`current_period_ends_at` would silently grant indefinite access.

### Suggested fix
Either return `False` when `past_due` + NULL ends, or treat the NULL as
`now()` so the 7-day grace starts ticking immediately.

---

## Finding 7 — INFO — Choose-plan ejects the trial admin from the app

### Where
- `services/billing.py:choose_plan` sets `status='pending_activation'`
- `services/billing.py:is_app_access_allowed` only allows `{trialing, active}`

### What
A trial admin who clicks "Choose plan" on the in-app pricing page
immediately drops to `pending_activation`, which fails the access check.
Until the founder manually activates, the entire org is gated out:
```bash
curl /auth/me                  # → HTTP 402 subscription_required
curl /companies                # → HTTP 402 subscription_required
```
This is a UX/self-DoS issue (the user has *less* access after agreeing to
pay than before), not an attacker primitive — but it's worth flagging
because a confused admin could panic-cancel.

### Suggested fix
In `choose_plan`, when `sub.status == 'trialing'` and the trial period is
still in the future, leave the status as `trialing` and store the picked
plan in `pending_plan_id` rather than promoting to `pending_activation`.

---

## Verified-correct (attacks attempted, defended)

These were probed during the test and held up:

- **Super-admin gate** — `GET /admin/organizations`, `GET /admin/organizations/{id}`,
  `POST /admin/.../extend-trial` from a non-super-admin token all returned
  HTTP 403 `Super-admin access required`. `require_super_admin` checks
  `User.is_super_admin` (DB-loaded, not JWT-claimed) so a forged JWT cannot
  fake it.
- **JWT secret** — runtime `jwt_secret` is a 64-char value, not the default
  `dev-secret-change-me-in-prod`. Forging a token with the default secret
  was rejected (HTTP 401 Invalid token).
- **Mass-assignment for `is_super_admin`** — `UserUpdate` schema has no
  `is_super_admin` field; an admin sending `{"is_super_admin": true}` to
  `PATCH /users/{id}` is silently ignored, and `/auth/me` confirms the
  flag stays `false`.
- **Cross-org IDOR on invitations** — `DELETE /invitations/{evil-org-id}`
  from a different org's admin returned HTTP 404 `Invitation not found`
  (revoke service checks `invitation.organization_id == actor.organization_id`).
- **Cross-org companies/deals/contacts** — every list/get filters by
  `organization_id == user.organization_id` at the query level, plus
  `scope_by_owner` for ownership-tracked tables.
- **Refresh-token rotation** — Refresh JWTs carry a `jti` that is matched
  against a server-side allowlist in `refresh_tokens`; rotation deletes
  the old row, so a leaked-then-rotated refresh becomes invalid even
  while still cryptographically valid (`api/v1/auth.py:refresh`).
- **OAuth state cookie** — signed via `itsdangerous.URLSafeTimedSerializer`
  with `secrets.compare_digest` against the cookie; bad/expired states
  rejected.
- **Invitation accept email match** — `accept_invitation_for_google_profile`
  rejects (`InvitationEmailMismatchError`) when the Google profile email
  doesn't match the invite recipient.
- **Cross-org user-already-in-org guard** — invitations to an email
  already attached to a different org return 409 `user_already_in_organization`,
  blocking the "invite a target user, then act through them" social-engineering
  primitive.
- **Schema bounds on seat_count** — both 0 and 600 cleanly 422'd
  (`{ge:1, le:500}`).

## Configuration risks (deployment hardening, not vulnerabilities)

These are not bugs in app code, but each becomes a critical issue if a
production deploy ships with the wrong setting:

- **`JWT_SECRET` default** is `dev-secret-change-me-in-prod`. If a prod
  deploy forgets to override, anyone can mint access tokens for any
  user_id they happen to know (and once you have any user's UUID via,
  say, the activities endpoint, you can mint admin tokens at will). The
  dev container under test has overridden it correctly.
- **`DEV_AUTH_ENABLED=true` + `APP_ENV=dev`** opens
  `POST /api/v1/auth/dev-login`, which mints a JWT for an arbitrary
  email and *auto-creates* an organization with that user as admin
  (`services/auth.py:upsert_dev_user`, `auto_create_org=True`). This is
  intentionally bound to dev mode (the endpoint 404s in any other
  combination), but a production deploy with these flags accidentally
  enabled is an instant full-tenancy compromise.
- **CORS** — `cors_origins` defaults to `["http://localhost:5173"]` with
  `allow_credentials=True`. Production deploys must set this to the
  real frontend origin; the default is dev-only. The `allow_credentials`
  + explicit-origin combination is not the wildcard footgun.
- **`Plans.public` endpoint** is unauthenticated and exposes the seller's
  `is_vat_payer`, `vat_rate_percent`, and `contact_email` from
  `BillingSettings`. By design, but worth noting if any future field
  added to that table is expected to stay private.

## Notes on test coverage

- Every issue marked "Code review" is reasoned from reading the source;
  none are speculative, but lab repro requires a multi-user org or
  super-admin role flag that the dev environment doesn't support
  without DB-level setup. Manual SQL would close that gap.
- The frontend was not exercised — these are all backend-direct curl
  attacks that bypass any UI guardrails.
- Test traffic was generated against the running dev backend on
  `localhost:8000`; dev container was not restarted, so issued
  invitations and the inflated seat count from finding 1 are still in
  the database under org `Evil-corp` (id `23a0d843-…`). Cleanup, if
  desired, is a single SQL `DELETE FROM organizations WHERE name='Evil-corp';`.
