# Task 1.3 — Auth dependencies

## Goal
Complete the FastAPI dependency chain so Phase 2+ route handlers can require
authentication, specific roles, and an active trial or paid subscription —
all via `Depends(...)`.

## Design notes
- `get_current_user` already exists (Task 1.2). Keep it; layer on top.
- `require_role(*allowed: UserRole)` — factory returning a dependency that
  raises 403 if `current_user.role` is not in `allowed`. Admin short-circuits
  all checks; any role set that contains `admin` is a no-op for admins.
- `require_active_trial_or_subscription` — rejects 402 (Payment Required)
  when `organization.trial_ends_at < now()` AND the org has no active
  subscription. For MVP, "active subscription" = `stripe_customer_id IS NOT
  NULL` (no real integration yet, but the field is the gate). The brief is
  explicit: after 30 days, the app blocks usage with a subscribe prompt.
- Expose helpful schemas in `app/schemas/errors.py` for the "trial expired"
  payload so the frontend can render the gate component.

## Files in scope
- `backend/app/core/deps.py` — extend with `require_role`, `require_roles`
  (accept iterable), `require_active_trial_or_subscription`.
- `backend/app/schemas/errors.py` — `TrialExpiredError` payload schema.
- `backend/tests/services/test_permissions.py` — unit-test the role matcher
  and the trial gate.
- `backend/tests/api/v1/test_auth.py` — add two small integration tests that
  exercise the new deps against a probe route mounted at test time.

## Acceptance criteria
1. `require_role(UserRole.admin)` rejects a salesperson with 403 and accepts
   an admin.
2. `require_role(UserRole.manager, UserRole.admin)` rejects a salesperson;
   manager and admin both pass.
3. `require_active_trial_or_subscription` rejects when `trial_ends_at` is in
   the past AND `stripe_customer_id` is null; accepts otherwise. 402 with a
   payload that carries `trial_ends_at`.
4. Existing tests stay green; new ones all pass.
5. Ruff / format / mypy / pytest all green.
6. `types:check` regenerates cleanly; error schema shows up in OpenAPI.
7. One commit: `feat(auth): role + trial-gate dependencies — Task 1.3`.

## Non-goals
- Org-scoping row-level filters (that's Phase 2 task 2.6).
- Real Stripe integration.
- Frontend consumption of the 402 payload — Task 1.4.
