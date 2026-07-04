# Full-app code review — plan & progress tracker

Status: DONE (2026-07-04). All batches R0–R9 complete; findings in
`docs/superpowers/reviews/2026-07-04-full-app-review.md` (exec summary at top).
Result: 1 P0, 4 P1, 12 P2, ~11 P3. Report-only — fixes not applied (triage
next). Backend tests now runnable locally (664/664 pass).
Context: entire app was written AI-assisted (Opus); user wants an in-depth
audit. Report-only — NO code changes during review; fixes are triaged
afterwards in separate batches.

## Ground rules

- Findings go to `docs/superpowers/reviews/2026-07-04-full-app-review.md`,
  appended per batch (survives session death), each finding:
  `[P0–P3] file:line — summary — concrete failure scenario — suggested fix`.
- Criticality: **P0** security/data-loss/tenant-leak · **P1** correctness bug
  · **P2** performance/reliability · **P3** maintainability/quality.
- Verify before reporting: read the actual code path end to end; no
  pattern-matched guesses. Each batch ends with a checkbox update here.
- Depth: line-by-line on auth/tenancy/payments/data-lifecycle; standard on
  domain logic and API; lighter on presentational UI.
- Do NOT review the SUTNAR redesign work (separate track, see
  2026-07-04-sutnar-fullapp-redesign-plan.md).

## Known hot spots (front-load)

- `6144a30` "FE filter - missing code review" — the company filters frontend
  landed UNREVIEWED by explicit admission. Review first.
- `26eda7a` filter-options endpoint + owner/industry/city filter queries.
- Recent import fixes (`3e58861`, `0278d69`) — contacts/companies matching.
- Comgate payment return flow + billing state.
- 365-day pool release automation (scheduled job? transaction safety?).

## Batches

- [x] R0 Recon & baselines: repo inventory, run `pytest`, `vitest`, `tsc`,
      linters, `pip-audit`/`pnpm audit`; record versions + failing/skipped
      tests as findings; map routers/pages/models into the report header.
- [x] R1 Security core: DONE — 1 P0 (invite account-takeover), 2 P1, 3 P2,
      3 P3, 1 uncertain. See report.
- [ ] R1 (orig text) Security core: auth flows (login/Google OAuth, sessions/JWT, invite
      accept, password reset), RBAC (admin/manager/rep), **tenant isolation —
      audit EVERY query/endpoint for org scoping**, IDOR probes by code read.
- [x] R2 Payments & billing: DONE — 3 P1 (seat-upgrade money loss; initial
      double-charge; VAT overstatement), 3 P2, 3 P3 unverified, 1 uncertain,
      2 refuted. Verifiers hit session limit; billing P3s need triage. Report.
- [ ] R2 (orig) Payments & billing: Comgate create/return/webhook, idempotency,
      amount/currency integrity, subscription state machine, invoicing docs.
- [x] R3 Data lifecycle: DONE — 2 P2 (CSV formula injection; GDPR erasure
      misses google_calendar_connections/user_smtp_settings/email_campaigns).
      ARES clean, import limits sound. See report.
- [ ] R3 (orig) Data lifecycle: imports (matching logic, dedupe, encoding, limits),
      CSV export (tenant scope! formula injection), GDPR 30-day purge, ARES
      client (timeouts, retries, input validation, SSRF).
- [x] R4 Domain logic: DONE — 1 P2 (reassign doesn't reset ownership clock),
      2 P3. Freeing wired & win-reset correct; no double-charge. See report.
      NOTE: firmy filters correctness deferred to R6 (frontend hot spot).
- [ ] R4 (orig) Domain logic: 365-day pool release (job scheduling, races, TZ),
      pipeline transitions, win-reset of ownership clock, firmy filters +
      filter-options + bulk recipient selection correctness.
- [ ] R5 API surface: request validation, error handling/leakage, N+1 queries,
      pagination, rate limiting, CORS, security headers.
- [x] R6 Frontend correctness: DONE — 1 P2 (unguarded localStorage = root
      cause of 12 red tests + storage-restricted crash), 1 P3 (no URL sync).
      Pagination reset OK; access token in-memory-only (XSS-safe). See report.
- [ ] R6 (orig) Frontend correctness: firmy filter UI state/URL sync (hot spot),
      race conditions, stale caches, forms/validation, error boundaries,
      auth token handling in client.
- [x] R7 Frontend quality: DONE — eslint clean, a11y ok, Czech-only
      consistent. 1 P3 (pnpm field). See report.
- [x] R8 Infra: DONE — 2 P2 (JWT_SECRET empty-string; workers×schedulers,
      both cross-refs), 1 P3 (email in logs). Backups/migrations/secrets solid.
- [ ] R7 (orig) Frontend quality: a11y, cs/i18n consistency, dead code, bundle size,
      test coverage gaps (landing.test, App.test, __tests__ inventory).
- [x] R8 Infra: DONE (see above).
- [ ] R8 (orig) Infra: docker-compose/dev container, scripts/dev.sh, migrations
      (alembic heads, destructive ops), env/secret handling, logging PII,
      backups/runbook accuracy.
- [ ] R9 Synthesis: dedupe findings, final criticality pass, executive
      summary table (counts per P-level), proposed fix-batch ordering
      (P0 first), update this tracker to DONE.

## Fix progress (branch `fix/review-p0-p1-security-payments`)

- [x] **P0 invite account-takeover** — FIXED (create-side member block +
      accept-side password verify). 3 regression tests. Suite 667/667.
- [x] **P1 invite→admin privilege escalation** — FIXED (role-authority
      ceiling in `create_invitation`). Same commit as P0.
- [x] P1 R2 seat-upgrade money-loss — FIXED (commit charge before billing;
      mark failed on reject; comgate raises on missing transId). Test added.
- [x] P1 R2 initial-charge double-charge — FIXED (active-guard + paid-charge
      guard + idempotent settlement). Residual: simultaneous-tabs double-
      capture needs pending-charge dedup (product call). Test added.
- [x] P1 R2 VAT overstatement — FIXED (back-calculate net+VAT from gross in
      `_build_lines_for_charge`). Regression test asserts total == gross.
- [x] **P2 R6 localStorage crash** — FIXED (guarded CompaniesListPage,
      PipelinePage ×2, theme.ts; the bug recurred in pipeline/theme). Frontend
      suite now 140/140 (was 128). Both CI suites green.
- [x] **R5 schedulers-in-workers** — FIXED (Postgres advisory locks, one key
      per sweep). Decision #3(b). Test added.
- [x] **R2 choose-plan lockout** — FIXED (pending_activation keeps trial
      access; pay-immediately stacks paid period after trial). Decision #1.
- [x] **R2 two-tabs double-capture** — FIXED (15-min pending-charge guard).
      Decision #2(c).
- [x] Decision #4 — filter URL-sync (useSearchParams) — FIXED.
- [x] jwt_secret startup guard (R1/R8) — FIXED.
- [x] CSV formula injection (R3) — FIXED (SafeCsvWriter, both exporters).
- [x] comp-cancel access guard (R2) — FIXED.
- [x] reassign ownership clock (R4) — FIXED.
- [x] GDPR erasure gaps (R3) — FIXED (3 tables now deleted).

ALL decided + autonomous fixes DONE. Backend 682/682, frontend 140/140, both
lint-clean, across 11 commits on `fix/review-p0-p1-security-payments`.

## Second fix batch (branch `fix/review-p2-reports-scoping`)
- [x] Manager cross-team report leak (R1 P2) — FIXED (assert_report_scope on
      widgets router + export-csv). Residual: no-filter org-wide aggregate for
      managers still needs a scope threaded through the 12 compute fns.
- [x] Team-annex (R1 P2) — FIXED (manager can't pull another team's members).
- [x] `_add_months` 360-day annual overcharge (R2 P3) — FIXED (calendar math).
- [x] Security headers (R5 P3) — FIXED (middleware).
- [x] pnpm field (R7 P3) — resolved (pnpm-workspace.yaml committed).

## Still open (lower value / need verification or decisions)
- GDPR: revoke Google tokens at Google (best-effort network call) — our stored
  copies are deleted; revocation-at-source is a follow-up.
- Unverified R2 billing P3s: deferred-cancel gates immediately; dunning
  lockout-flap — re-verify then fix.
- P3 tail: activity-type label on reassign (R4), PII (email) in scheduler logs
  (R8), unauth charge-status oracle (R1).

## User decisions (locked 2026-07-04)

- Scope: FULL R0–R9 (infra/CI in).
- Ultracode adversarial multi-agent: R1 (security) + R2 (payments) ONLY;
  all other batches single-pass deep review (token budget).
- Pacing: run continuously until done or budget dry; findings appended
  per batch so a cutoff loses nothing.
- Fixes: NO — report only, triage afterwards.
- Reusable process skill: `.claude/skills/reviewing-in-batches/SKILL.md`.
