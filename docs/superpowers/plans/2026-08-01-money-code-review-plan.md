# Money-code review — plan/tracker (2026-08-01)

Second sweep of everything that touches money, ordered by blast radius.
Owner's brief: "no skeletons; money code should be the most test-covered
part of the app." Findings → `docs/superpowers/reviews/2026-08-01-money-code-review.md`
(append-only, one section per batch).

Ground rules

- Line-by-line on charge lifecycle, billing state machine, invoicing
  issuance/numbering; standard depth elsewhere. Report-only during the
  sweep; fixes triaged in R7.
- July review context: R2 payments was already line-by-line + adversarial,
  BUT its billing.py P3s (deferred-cancel, dunning-flap, `_add_months`)
  were never verified, and renderer/exporter/mailer/storage + test quality
  were LIGHT. Post-review money churn: i18n error codes (2f150fd),
  localized PDF + QR/ISDOC CZK guard (070be73), annual pricing (3afeb2d),
  renewal idempotency + MissingGreenlet (22cb1ea).
- Finding format: `[P0–P3] file:line — summary — failure scenario — fix`.

Batches

- [x] R0 recon: inventory, churn since 2026-07-04, coverage baseline
- [x] R1 charge lifecycle: api/v1/payments.py (init/webhook/return),
      services/comgate.py, webhook idempotency, Charge states
- [x] R2 subscription state machine: services/billing.py — activation,
      proration/seat math, plan swap, deferred cancel, dunning,
      `_add_months`, comp/trial paths; re-verify July's unverified P3s
- [x] R3 money sweeps in services/scheduler.py: renewal-draft, overdue,
      billing-info (recurring just hardened — regression-only glance)
- [x] R4 invoicing: service.py, numbering.py, integrity.py, storage.py,
      renderer.py, exporter.py, mailer.py (+ ISDOC), snapshot correctness
- [x] R5 admin money surfaces: admin_invoices.py, admin.py billing
      endpoints, invoices.py customer router; authz on every money route
- [x] R6 test quality + coverage gaps; add the missing-scenario list
- [x] R7 synthesis: adversarial verify P0/P1 candidates, fix triage

R0 recon results (2026-08-01)

- Surface: billing.py 980 L, payments.py 779 L, scheduler.py 770 L,
  invoicing/ 1 748 L (service 748, renderer 436, exporter 264, integrity
  229, storage 207, mailer 144, numbering 66), comgate.py 440 L,
  admin_invoices.py 513 L; models charge/subscription/plan/invoice/
  payment_method/billing_settings/billing_audit_log/webhook_event.
- Tests: 1023 backend green. Money test files: test_payments.py,
  test_admin_invoices.py, test_invoices.py, test_admin_billing.py,
  test_initial_payment_billing_guard.py, test_billing*.py (4 files),
  test_comgate.py, test_invoicing_* (7 files), test_scheduler.py,
  test_overdue_invoice_sweep.py, integration/test_invoicing_happy_path.py.
- Coverage baseline (line %, full suite): billing.py 87 %, comgate.py
  90 %, scheduler.py 79 %, invoicing/ 91 % (integrity 82 %, storage 84 %,
  numbering 85 %, exporter 89 %, mailer 87 %, renderer 97 %, service 96 %).
  API money routers unmeasurable — coverage instrumentation of
  app.api.v1.* segfaults asyncpg under BOTH tracer cores (tooling issue,
  noted, not chased); assess qualitatively in R6.
- Known-open by design (not findings): invite_url raw token (July
  follow-up), ComGate go-live audit opens in docs/TODO.md (Q2 UI gap, Q7
  ISDOC attach, Q10 refunds), prod env checklist unticked.
