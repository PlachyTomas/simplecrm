# Phase 9 — Auto-freeing job (9.1 + 9.2 + 9.4 shipped)

Backend service `app/services/freeing.py`:
- `free_expired_companies(session, organization_id=None, now=None)` — finds
  owned companies whose `ownership_expires_at < now`, clears
  `owner_user_id`, closes out the open `OwnershipHistory` row with
  `released_at`, writes an `Activity` row with
  `activity_type=company_freed` and reason `freed_timeout`.
- `free_single_company(...)` — admin/manager-triggered manual release.
- `reassign_company(company, new_owner_id, released_by)` — closes the
  current owner's history, appends a new row, sets `owner_user_id`.

Endpoints on the companies router (admin OR manager via require_role):
- `POST /api/v1/companies/:id/free`
- `POST /api/v1/companies/:id/reassign`

Deferred:
- 9.3 email notifications — wire once a transactional provider is picked.
- APScheduler registration for the 03:00 Europe/Prague daily sweep —
  service + history semantics are complete; the cron registration is
  a 10-line addition in a later task.
- 9.5 frontend countdown badges — Phase 4's company list already shows
  the ownership-expires date on the detail page; badge styling on the
  list is a short follow-up.

Tests: `tests/services/test_freeing_job.py` (3 service tests) +
four new endpoint tests in `tests/api/v1/test_companies.py`. Backend
suite 159 passing.
