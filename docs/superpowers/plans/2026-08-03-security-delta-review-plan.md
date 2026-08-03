# Security-delta review — plan/tracker (2026-08-03)

The July 4 security review (R1: auth/tenancy/IDOR, adversarially
verified) predates ~8 700 backend lines. This sweep covers everything
security-relevant that landed since 98f83e0 (July 9). Findings →
`docs/superpowers/reviews/2026-08-03-security-delta-review.md`
(append-only, per batch). Same process as the 2026-08-01 money review.

Ground rules

- Line-by-line on public/unauthenticated surfaces and secret handling;
  tenancy/authz sweep on all new+changed routers; report-only per batch,
  fixes triaged at the end. Verify findings by reading the full code
  path (or a failing test) before writing them down.
- Finding format: `[P0–P3] file:line — summary — failure scenario — fix`.

Surface delta (since 98f83e0)

- NEW routers: inbound_email (PUBLIC Smart-BCC), tracking (PUBLIC
  pixel/click), user_smtp (credential storage), bulk_email,
  email_templates, sales_goals, search, events (calendar), tutorials in
  user_preferences; big changes: emails.py (mail page + link), deals.py
  (timeline/reopen/next-step), reports_widgets, auth.py, users.py,
  organizations.py, subscription.py.
- NEW models: sent_email, email_campaign, email_template, sales_goal,
  calendar_event, user_smtp_settings, import_run(+undo), google-calendar
  connection; changed: user, organization, company, contact, deal.
- NEW services: email sender/tracking/bulk, google_calendar, imports
  pipeline, home_dashboard, deal_staleness, sales_goals.

Batches

- [x] R0 recon: surface delta enumerated (above)
- [x] R1 public surfaces line-by-line: api/v1/inbound_email.py +
      services/inbound_email.py (org routing, secret check, MIME
      parsing, size caps), api/v1/tracking.py + services/email_tracking
      (token guessability, open-redirect, cross-org injection)
- [x] R2 tenancy/authz sweep over new+changed authed routers: emails,
      bulk_email, email_templates, user_smtp, events, search,
      sales_goals, reports_widgets, deals/pipelines/companies/contacts
      deltas, user_preferences, users/organizations deltas
- [x] R3 secrets & tokens: user_smtp_settings storage, google-calendar
      refresh tokens (token_crypto usage), INBOUND_SHARED_SECRET
      comparison, tracking token signing, auth.py delta
- [x] R4 data lifecycle: org_erasure + data_export completeness vs the
      new tables; import-run undo scoping
- [x] R5 test/coverage gaps (regression tests written with the fixes) for all of the above
- [x] R6 synthesis + fix pass (P0/P1 immediately, P2/P3 triaged)
