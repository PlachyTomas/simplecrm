# PAYGATE-B2 — `BillingService` (subscription lifecycle)

Source: `docs/prompts/PAYGATE_TASK.md` §5 B2.

## Scope

Pure-Python service module `backend/app/services/billing.py` exposing:

| Method | Returns | Caller |
| --- | --- | --- |
| `get_current_subscription(session, org_id)` | `Subscription` | any |
| `get_effective_price_per_user_minor(sub)` | `int \| None` | any |
| `compute_savings(user_count)` | dict | any |
| `compute_with_vat(session, base_minor)` | dict | any |
| `choose_plan(session, org_id, plan_code, requested_by_user_id)` | `Subscription` | org admin |
| `activate_subscription(session, org_id, plan_code, override_price_minor, period_months, by_admin_id)` | `Subscription` | super-admin |
| `set_comp(session, org_id, reason, ends_at, by_admin_id)` | `Subscription` | super-admin |
| `set_enterprise(session, org_id, override_price_minor, period_months, notes, by_admin_id)` | `Subscription` | super-admin |
| `cancel(session, org_id, by_admin_id, effective_at)` | `Subscription` | super-admin |
| `extend_trial(session, org_id, days, by_admin_id)` | `Subscription` | super-admin |
| `is_app_access_allowed(sub, now=None)` | `bool` | pay-gate dep |

### Logic notes

- `compute_savings(N)` =
  `monthly_total = 12 × 9900 × N`,
  `annual_total = 99900 × N`,
  `savings = monthly_total − annual_total = 18 900 × N`,
  `savings_percent = round(savings / monthly_total × 100, 1)`.
- `compute_with_vat(base)` reads `BillingSettings.is_vat_payer` /
  `vat_rate_percent`. Returns
  `{base_minor, with_vat_minor, vat_amount_minor}`. When
  `is_vat_payer=False`, `with_vat_minor = base_minor` and
  `vat_amount_minor = 0`.
- `choose_plan` is idempotent: if there is already a
  `pending_activation` subscription for the same plan, return it
  unchanged (no second email).
- `activate_subscription`: status → `active`,
  `current_period_starts_at = now`,
  `current_period_ends_at = now + period_months` (default by plan:
  monthly = 1, annual = 12, custom = require period_months).
- `set_comp`: `is_comp = true`, plan → `comp`, status → `active`,
  `current_period_ends_at = ends_at` (may be NULL = indefinite).
- `set_enterprise`: plan → `enterprise`, status → `active`,
  override price required, `current_period_ends_at = now + period_months`.
  Clears `is_comp`.
- `cancel`: status → `canceled`, `canceled_at = effective_at or now`.
  Frontend treats canceled identically to gated; pay-gate denies.
- `extend_trial`: only valid when status = `trialing`. Adds `days` to
  `Organization.trial_ends_at` AND `Subscription.current_period_ends_at`.
- `is_app_access_allowed`:
  - `is_comp=True` → allow.
  - `status in {trialing, active}` and
    `current_period_ends_at >= now` (or NULL) → allow.
  - `status == past_due` and
    `now - current_period_ends_at < 7 days` → allow.
  - otherwise → deny.

### Activity audit

Every mutating method writes an `Activity` row:

- `entity_type = 'organization'` (new enum value).
- `entity_id = organization_id`.
- `user_id` = the actor.
- `activity_type = 'subscription_change'` (new enum value).
- `payload` = a dict with `action` (`choose / activate / set_comp /
  set_enterprise / cancel / extend_trial`), plus the relevant
  parameters (plan_code, status_after, override_price_minor,
  period_months, days_added, etc.).

Adds two new enum values, which means a small Alembic migration:
`ALTER TYPE activity_entity_type ADD VALUE 'organization'`,
`ALTER TYPE activity_type ADD VALUE 'subscription_change'`. Postgres
allows in-place enum-value adds. The migration runs before the
service file picks them up.

### Email

Emit an internal-to-the-founder email through `app.services.email`
when a customer `choose_plan`s. Stub-only for now (logs at INFO).
Build a `build_subscription_pending_email` helper inside `email.py`
so the message body is testable as a pure function.

## Files touched

- `backend/alembic/versions/20260502_xxxx_paygate_b2_activity_subscription.py`
  — adds the two enum values + a Postgres COMMIT-with-DDL trick (since
  ALTER TYPE … ADD VALUE can't run inside a transaction in PG < 15;
  the migration uses `op.execute(...)` after detaching).
- `backend/app/db/models/enums.py` — adds `organization` to
  `ActivityEntityType` and `subscription_change` to `ActivityType`.
- `backend/app/services/billing.py` — new.
- `backend/app/services/email.py` — adds
  `build_subscription_pending_email`.
- `backend/tests/services/test_billing.py` — covers every method
  and the access-allowed truth table.

## Acceptance for B2

- `alembic upgrade head` clean; downgrade re-applies the prior enum
  shape (PG enum-value removal is a copy-and-rename dance — handle
  via a `DROP TYPE; CREATE TYPE; ALTER COLUMN`).
- All BillingService methods covered by 1-2 happy-path tests each
  plus 1 validation/permission-edge case (e.g. extend_trial fails
  when status≠trialing). Mock email send.
- `is_app_access_allowed` tested at every truth-table boundary:
  trialing-future, trialing-past, active-current, active-expired,
  past_due-within-grace, past_due-past-grace, canceled, comp.
- ruff + mypy clean on the new files; full pytest passes (modulo the
  pre-existing dev-login-config failure).

## Commit

`feat(billing): add BillingService with subscription lifecycle`
