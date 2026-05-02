# RESUME — paygate build, after B1

## Where we are

Driving prompt: `docs/prompts/PAYGATE_TASK.md`. Auto-loop wrapper
(`scripts/claude-loop.sh`) is running and will keep relaunching Claude
sessions every 5h until this file is **absent**. Do **not** start a
second loop instance — check `.claude-loop.pid` first.

Last completed commit: **`0cf89cc`** — `feat(billing): add Plan /
Subscription / BillingSettings models and seed`. Migration
`b3a5d27e1c84` is applied; the dev DB has 5 plans, 1 billing-settings
row, and 164 backfilled trialing subscriptions.

Read in order before doing anything: `docs/work-log.md` (Session 5
section is the latest), `.claude/tasks/PAYGATE-B1.md` (B1 spec —
done), `docs/prompts/PAYGATE_TASK.md` §5 B2 onwards (everything still
to do), `.claude/skills/ui-design.md` (before any UI work).

## Next task — B2: `BillingService`

Create `backend/app/services/billing.py` with the methods listed in
the prompt §5 B2:

- `get_current_subscription(org_id) -> Subscription`
- `get_effective_price_per_user_minor(sub) -> int | None`
- `compute_savings(user_count) -> dict`
- `compute_with_vat(base_minor) -> dict`
- `choose_plan(org_id, plan_code, requested_by_user_id) -> Subscription`
- `activate_subscription(org_id, plan_code, override_price=None,
  period_months=None, by_admin_id) -> Subscription`
- `set_comp(org_id, reason, ends_at=None, by_admin_id) -> Subscription`
- `set_enterprise(org_id, override_price_per_user_minor, period_months,
  notes, by_admin_id) -> Subscription`
- `cancel(org_id, by_admin_id, effective_at=None) -> Subscription`
- `extend_trial(org_id, days, by_admin_id) -> Subscription`
- `is_app_access_allowed(sub, now=None) -> bool`

Notes:

- Every state transition writes an `Activity` record
  (`entity_type='organization'`, actor `by_admin_id` /
  `requested_by_user_id`). The `Activity` model already exists; check
  its enum values in `app/db/models/enums.py` and pick the closest
  match or extend the enum (separate migration if so — but try to
  reuse).
- `choose_plan` is idempotent — if a `pending_activation` already
  exists for the same plan, return it. Email goes through
  `app.services.email` (current stub logs to console).
- `is_app_access_allowed` rules: `is_comp=True` → always allow;
  `status in {trialing, active}` and `current_period_ends_at >= now`
  → allow; `status == past_due` and grace window (7 days from
  `current_period_ends_at`) → allow; otherwise deny.
- Mock the email send in tests. There is **no** real Stripe / payment
  integration in this scope (see prompt §9).

Spec the work first at `.claude/tasks/PAYGATE-B2.md` (mirror the B1
spec format). Then implement, test, commit as
`feat(billing): add BillingService with subscription lifecycle`.

## After B2

Continue down the §10 commit plan in `docs/prompts/PAYGATE_TASK.md`.
Order: B3 (endpoints) → B4 (pay-gate dep) → F1 (PriceDisplay) → F2
(/cenik) → F3 (trial countdown) → F4 (gate) → F5 (settings) → F6
(/admin) → integration tests → final WORK_LOG/README polish.

## When everything is done

- Verify every acceptance criterion in §8 of the prompt.
- Ensure all tests / lint / typecheck green on both stacks.
- **Delete `RESUME.md`** — its absence is the loop's "work complete"
  signal. The loop will exit on its next wake.

## House rules (compressed)

- Never go more than 30 minutes between commits.
- Update `docs/work-log.md` after each commit.
- The dev container is **not** running here; backend / frontend run
  on the host. Postgres is in `simplecrm-postgres-1`.
- Push permissions are **not** granted; commits stay local.
