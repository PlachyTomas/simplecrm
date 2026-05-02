# PAYGATE-B1 — Migrations & seed (Plan / Subscription / BillingSettings)

Source: `docs/prompts/PAYGATE_TASK.md` §5 B1.

## Scope

One Alembic migration that:

1. Extends `plans`:
   - Add `code` (String 32, unique, indexed), `display_name_cs` (String 120),
     `description_cs` (Text nullable), `billing_interval` (String 16, replacing
     existing `interval` enum), `price_per_user_minor` (Integer nullable,
     replacing existing `price_minor_units`), `is_public` (Boolean default
     false), `sort_order` (Integer default 0), `trial_days` (Integer nullable),
     `updated_at` (Timestamp w/ tz).
   - Drop existing `interval` enum column once values copied to the new
     `billing_interval` string column. Drop the `plan_interval` Postgres
     enum type at the end since nothing else uses it.
   - Drop `name` once values migrated to `code` + `display_name_cs`.
   - Drop `price_minor_units` once values migrated to `price_per_user_minor`.
   - Re-seed: idempotent INSERT … ON CONFLICT (code) DO UPDATE for the five
     plans (`trial`, `monthly`, `annual`, `enterprise`, `comp`) per the
     prompt's seed table.

2. Creates `subscriptions`:
   - PK `id` UUID.
   - FKs: `organization_id` (UUID, unique, NOT NULL, ON DELETE CASCADE) —
     unique because each org has at most one subscription at a time;
     `plan_id` (UUID, NOT NULL, ON DELETE RESTRICT).
   - `status` (String 32, NOT NULL, indexed) — values: `trialing`,
     `pending_activation`, `active`, `past_due`, `canceled`.
   - `started_at` (TZ datetime, NOT NULL, default now()).
   - `current_period_starts_at`, `current_period_ends_at`, `canceled_at`
     (TZ datetime, nullable).
   - `override_price_per_user_minor` (Integer nullable).
   - `is_comp` (Boolean default false, NOT NULL).
   - `comp_reason` (Text nullable), `notes` (Text nullable).
   - `created_at`, `updated_at` (TZ datetime, NOT NULL, server defaults).
   - Indexes: `(organization_id, status)`, `(current_period_ends_at)`.

3. Creates `billing_settings` (singleton):
   - `id` Integer PK with check constraint `id = 1` (singleton enforced).
   - `is_vat_payer` Boolean default false NOT NULL.
   - `vat_rate_percent` Numeric(5,2) default 21.00 NOT NULL.
   - `seller_iban` String(34) nullable.
   - `seller_ico` String(8) nullable.
   - `contact_email` String(120) NOT NULL default `podpora@simplecrm.cz`.
   - `updated_at` TZ datetime with server-side onupdate.
   - Seed one row.

4. Adds `users.is_super_admin` Boolean default false NOT NULL.

5. Backfill: every existing organization gets a `subscriptions` row with
   `plan_id = (the trial plan)`, `status = 'trialing'`,
   `current_period_ends_at = organizations.trial_ends_at`,
   `started_at = organizations.created_at`. Skip orgs that somehow already
   have a row (idempotency).

## Code changes outside the migration

- `backend/app/db/models/plan.py` — replace existing schema. Drop `name`,
  `price_minor_units`, `interval`. Add new columns. Keep currency/is_active.
  Drop the `PlanInterval` enum import; switch to a plain string column.
- `backend/app/db/models/subscription.py` — new file.
- `backend/app/db/models/billing_settings.py` — new file.
- `backend/app/db/models/user.py` — add `is_super_admin`.
- `backend/app/db/models/__init__.py` — re-export new models, drop
  `PlanInterval` from public API (and from `app.db.models.enums` once
  nothing references it).
- `backend/app/db/models/enums.py` — remove `PlanInterval` (no longer used).
- `backend/app/services/onboarding.py` — on org creation, create a
  Subscription row (`plan='trial'`, `status='trialing'`,
  `current_period_ends_at = organization.trial_ends_at`,
  `started_at = organization.created_at`).
- `backend/tests/db/test_models_phase1.py` — update plan-seed assertion to
  the new five-plan set.
- `backend/tests/services/test_onboarding.py` (or similar) — extend to
  assert the trialing Subscription is created.
- New `backend/tests/db/test_billing_models.py` covering: backfill creates
  a subscription per org, billing_settings singleton constraint, plan
  seed values, super_admin defaults to false.

## Acceptance for B1

- `alembic upgrade head` runs cleanly on the dev DB.
- `alembic downgrade -1` then `alembic upgrade head` is idempotent.
- `pytest backend/tests/db -q` passes.
- `ruff check app` and `mypy app` clean on touched files.
- Existing `test_default_plans_are_seeded` updated and passes.
- Plan seed: 5 rows with codes `trial / monthly / annual / enterprise / comp`;
  `is_public` true only for monthly + annual; prices in minor units match
  the prompt's table.
- Every existing org has a corresponding row in `subscriptions` with
  `status='trialing'` and `plan_id` matching the seeded `trial` plan.

## Commit

`feat(billing): add Plan/Subscription/BillingSettings models and seed`

(Single commit; no WIP commits during B1.)

## Out of scope (deferred to B2+)

- Service-layer logic (`BillingService`).
- API endpoints.
- Pay-gate dependency wiring.
- Any frontend work.
- Pruning the `plan_interval` enum type — handled inside the migration's
  upgrade/downgrade.
