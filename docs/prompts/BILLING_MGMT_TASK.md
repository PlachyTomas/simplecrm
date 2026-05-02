# Billing management — driving spec

User asked for end-to-end seat-based billing management on top of the
existing paygate (B1–B4 + F1–F6).

## Acceptance criteria

1. **Onboarding (CreateOrgPage) is multi-step:**
   1. Org name (existing field stays).
   2. Number of salesmen (`seat_count`, integer ≥ 1).
   3. Plan picker showing 30-day trial info + monthly/yearly toggle. Both
      cards show **per-user cost** AND **overall cost** (`seat_count × price`).
      Monthly is preselected.
   4. Confirm → org created with the chosen seat_count and intended plan.
2. **Seat count is a hard limit on user creation.** New invitations / new
   users beyond `seat_count` get rejected at the API edge with a
   422 + clear message. Active count = `users WHERE is_active = true AND
   organization_id = org.id`.
3. **Settings → Organizace** (new tab) lets the org admin:
   - View current seat count, current plan, current period end.
   - Increase seat count immediately (no extra approval).
   - Decrease seat count: prompts the admin to pick which user(s) lose
     access. Selected users get `is_active=false` immediately. The next
     billing period reflects the reduced count.
   - Switch billing interval (monthly ↔ yearly). Change is queued —
     stored as `pending_plan_id` — and takes effect when the current
     period ends (trial expiry or paid period rollover).
4. The Účtování card in Settings → Fakturace already shows
   `users × price = total`. After this work it must read from
   `Subscription.seat_count`, not the live user count, so the
   contracted seats drive the bill rather than the actual headcount
   (so a seat reduction that takes effect next period still bills
   the contracted amount this period).

## Schema

Add to `Subscription`:
- `seat_count: int` (default 1, NOT NULL, server_default 1)
- `pending_plan_id: uuid | None` FK plans
- `pending_seat_count: int | None` (when admin pre-commits a reduction
  for next period, store it here; the activation/period-rollover service
  applies it.)

Backfill: existing orgs get `seat_count = 1` (the founding admin).
Future orgs receive whatever the onboarding form submits.

## Endpoints

- Update onboarding signature `POST /onboarding/organization` to accept
  `seat_count` + `intended_plan_code` (`monthly` or `annual`).
- New `PUT /api/v1/organizations/current/subscription/seat-count`:
  body `{seat_count, deactivate_user_ids?}`. When the new count is
  below current active users, `deactivate_user_ids` is required and
  must pick exactly `(active - new)` users.
- New `POST /api/v1/organizations/current/subscription/change-interval`:
  body `{plan_code: 'monthly'|'annual'}`. Stores into
  `pending_plan_id`. The activation/rollover service (and the existing
  super-admin Aktivovat) applies it on period end.

## Frontend

- Multi-step CreateOrgPage with three forward/back-able steps + a
  confirmation summary.
- New `OrganizationSection` in SettingsPage's tab list.
- Reuse F4/F5 chooser components where their shape fits; otherwise
  copy and customize inline (avoid premature extraction).

## Tests

- Backend: schema migration applies; onboarding stores seat_count +
  intended plan; user-creation cap rejects at 422 when at limit;
  seat-count update rejects when downsize without `deactivate_user_ids`;
  change-interval queues `pending_plan_id` without touching `plan_id`.
- Frontend: CreateOrgPage step transitions; cap-exceeded user-creation
  shows the error copy; OrganizationSection seat-count edit + downsize
  picker + interval switch.

## Verification

Playwright: full create-org happy path → settings tab → bump seat,
reduce with picker, switch interval. DB confirms `pending_plan_id`
populated.

## Out of scope

- Stripe integration (still no real payments).
- Pro-rating mid-period changes (seat increases bill at next period;
  seat decreases bill at next period).
- Multi-currency.
