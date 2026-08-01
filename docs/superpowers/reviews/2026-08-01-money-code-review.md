# Money-code review — findings (2026-08-01)

Format: `[P0–P3] file:line — summary — failure scenario — suggested fix`.
P0 security/data-loss/tenant-leak · P1 correctness · P2 perf/reliability ·
P3 maintainability. Tracker:
`docs/superpowers/plans/2026-08-01-money-code-review-plan.md`.

Baseline: main @ b2800c8, 1023 backend tests green. Coverage: billing 87 %,
comgate 90 %, scheduler 79 %, invoicing 91 % (per-file in tracker).

> **FIX STATUS (same day):** all four P1s are **FIXED** on main with
> 7 regression tests (suite 1030 green). Each P1 was first REPRODUCED by
> a failing test (verification-by-test, no agent panel needed):
> (1+2) renewal sweep + renewal draft now price the next period from
> `pending_plan`/`pending_seat_count` via the new
> `billing.next_period_plan_and_seats` + `get_effective_price_for_plan`
> helpers; (3) the `already_paid` 409 in initial-payment-init is scoped
> to non-lapsed states so canceled/past_due orgs can check out again
> (which is also the only card-replacement rail); (4) seat-change-init
> rejects a second pending upgrade inside 10 min (409
> `payment_in_progress`) so a double-click can't double-capture.
> R6's headline gap is closed too: `apply_renewal_success` and the
> renewal dunning ladder now have end-to-end webhook tests.
> **OPEN (triaged, not fixed):** the P2s — draft-pipeline-has-no-exit
> (worst of them), mark_paid row-lock race, initial-init
> commit-before-ComGate ordering, two-pending-initials >15 min, DIČ
> field for VAT-payer mode, credit-note sum cap, S3 storage-path test
> coverage — and all P3s. Fix order suggestion: draft pipeline →
> mark_paid lock → commit-before-create trio, then the P3 cleanups
> opportunistically.

## R0 — recon

- Tooling note (not a code finding): coverage instrumentation of
  `app.api.v1.*` segfaults asyncpg (both trace cores, macOS). Coverage of
  the money routers therefore has no line-% baseline.

## R1 — charge lifecycle (payments.py, comgate.py, webhook)

Read line-by-line: api/v1/payments.py (780 L), services/comgate.py (440 L),
db/models/webhook_event.py, schemas/payments.py. The webhook design is
sound: transId re-query as authentication, WebhookEvent unique-insert as
idempotency (correct even under concurrent duplicate delivery — the loser
blocks on the unique index, then IntegrityError→204; if the winner rolls
back, the loser's flush succeeds and processes), terminal-status guard on
the Charge as belt-and-suspenders. Input schemas are bounded (demo seats
≤ 25, seat_count ≤ 500). Demo flow hardcodes `test=True`.

- [P1] api/v1/payments.py:292-408 — **seat-change-init has no
  pending-charge guard → double-click double-captures the card.**
  `create_recurring_payment` captures server-side immediately (no hosted
  page, no user confirmation). Two rapid POSTs (double-click, network
  retry, two tabs) both pass the `seat_count > contracted_seat_count`
  check, both create a Charge, both call ComGate → customer pays the
  prorated amount twice. The webhook then applies the same
  `contracted_seat_count` twice (idempotent), so the double-payment is
  invisible except in the charge list. The initial-payment flow got
  exactly this guard in the July fixes (409 `payment_in_progress`,
  15-min window); seat upgrades did not. Fix: reject when a pending
  `seat_upgrade` charge exists for the org (short window, e.g. 10 min),
  mirroring the initial-payment guard.
- [P2] api/v1/payments.py:193-222 — **initial-init calls ComGate before
  committing the Charge.** The charge is only flushed when
  `create_initial_payment` runs; the commit happens after. If that
  commit fails (connection blip, pod kill), ComGate has a live hosted
  page whose refId points at a rolled-back Charge — a customer who pays
  it hits the webhook's "unknown charge → ACK and ignore" path: money
  taken, nothing recorded. seat-change-init commits first for exactly
  this reason (its July-fix comment explains it). Fix: commit the
  pending charge before calling ComGate; on ComGateError mark it
  `failed` + commit (a failed charge doesn't trip the 15-min 409 guard,
  so retry UX is unchanged).
- [P2] api/v1/payments.py:139-176 + _dispatch_success — **two pending
  initial charges can both be paid.** The 15-min window treats an older
  pending initial charge as abandoned and allows a second checkout, but
  ComGate hosted pages outlive 15 minutes. Customer A opens checkout,
  waits >15 min, opens a second one, pays both tabs → two PAID webhooks
  for two different charges; the second `apply_initial_payment_success`
  re-extends the period (verify in R2) and a second invoice is issued.
  Card is double-charged either way (manual refund — Q10 gap). Fix
  candidates: on initial-charge success, void/ignore sibling pending
  initial charges (mark `superseded`), and in `_dispatch_success` treat
  kind=initial on an already-active sub as a duplicate payment: log
  ERROR + skip re-activation + skip invoice, leave charge paid for the
  refund trail.
- [P3] api/v1/payments.py:506-616 — the public webhook has no rate limit
  and parses an unbounded body; each garbage transId also costs us one
  authenticated GET to ComGate (amplification). Low stakes behind the
  re-query check; add the shared RateLimiter + a body-size cap when
  convenient.
- [P3] services/comgate.py:165-206 — a new `httpx.AsyncClient` is built
  and torn down per call in production (`self._http is None` path). Fine
  at current volume; switch to a long-lived client (or share one per
  ComGateClient) when traffic warrants connection reuse.
- [P3] api/v1/payments.py:686-761 — invoice render + SMTP send run
  inside the webhook's DB transaction; a slow SMTP server holds the DB
  connection and delays the 204 (ComGate may time out and re-deliver —
  harmless thanks to dedup, but noisy). Consider moving the mail step
  after commit.

## R2 — subscription state machine (billing.py, subscription.py router)

Read line-by-line: services/billing.py (980 L), api/v1/subscription.py
(seat-count/change-interval/cancel/reactivate/choose-plan). July's three
unverified P3s re-verified: `_add_months` is now real calendar math
(fixed 19e940e), dunning-flap grace is consistent (`active`-past-period
gets the same 7-day grace as `past_due`, f64d34d), super-admin future
`effective_at` cancel is rejected. Those are closed. New findings —
the two P1s share one root cause: **the renewal sweep prices the next
period from CURRENT plan/seats, while `apply_renewal_success` shapes
that same period from PENDING plan/seats.**

- [P1] services/scheduler.py:266 + services/billing.py:729-748 —
  **queued monthly↔annual swap bills the old plan's price for the new
  plan's period.** `run_recurring_charges` computes
  `amount = effective_price(current plan) × seat_count`; the webhook's
  `apply_renewal_success` then applies `pending_plan_id` FIRST and
  takes the period length from the NEW plan. Customer queues
  monthly→annual: card charged 99 Kč/seat, period rolled 12 months
  (12× underbilling). annual→monthly: charged 996 Kč/seat for a
  1-month period (12× overcharge). Every customer who uses the
  Settings "change interval" feature hits this on their next renewal.
  Fix: in the sweep, price and label the charge from
  `pending_plan or plan` (keep `override_price_per_user_minor`
  precedence); alternatively apply the swap at charge time.
- [P1] services/scheduler.py:266 + services/billing.py:220-259 —
  **queued seat downsize bills the old seat count for the period in
  which the downsize lands.** The sweep charges
  `price × sub.seat_count` (old count, e.g. 10); the success handler
  then applies `pending_seat_count` (5) for that same new period. The
  customer pays 10 seats for a period in which they contractually and
  practically have 5 (their users are deactivated at the same moment
  the charge lands). Fix: bill `pending_seat_count or seat_count` in
  the sweep — same one-line shape as the plan fix above.
- [P1] api/v1/payments.py:144-157 — **a canceled org can never
  re-subscribe self-serve.** The `already_paid` guard 409s
  `initial-payment-init` whenever ANY paid initial charge exists,
  regardless of current status. But that is the exact path the product
  points lapsed customers at: `reactivate_self_serve`'s own error says
  "subscription period has already ended; choose a plan again", and
  past_due orgs with a dead card have no other rail (there is no
  card-update flow; renewals replay the initial transId). Every lapsed
  or canceled org that ever paid is permanently 409-blocked and must
  be rescued manually by the founder. Fix: scope the guard to
  non-lapsed states — only 409 when the sub is active OR
  (pending/trialing AND a paid initial charge exists for the current
  period); allow a fresh checkout when status ∈ {canceled, past_due}
  (the fresh initial payment also re-registers the card and
  `apply_initial_payment_success` already handles those states).
- [P2] api/v1/subscription.py:155-189 — the deprecated `choose-plan`
  endpoint has no status guard: an ACTIVE org calling it flips status
  to `pending_activation`, which silently stops the renewal sweep
  (`status == 'active'` filter) and swaps `plan_id` mid-period; the org
  then wedges (initial-init 409s per the previous finding). Current
  frontend no longer calls it. Fix: reject unless
  status ∈ {trialing, pending_activation} — or delete the endpoint.
- [P3] services/billing.py:811-819 — `apply_manual_payment_success`
  sets `current_period_starts_at = now` but `ends = anchor + months`
  where anchor can be the future old-period end → period longer than
  the plan interval; seat-proration fractions for that period are
  slightly diluted. Set starts_at to `anchor` for consistency.
- [P3] services/billing.py:512-517 — `extend_trial` does
  `org.trial_ends_at + delta` without a None check → 500 on an org
  with no trial anchor. Guard + BillingError.
- [P3] no period-rollover job exists: a self-canceled sub keeps
  `status='active'` + `canceled_at` forever after its period ends
  (docstring in `cancel_self_serve` promises "the eventual
  period-rollover job" flips it). Consequences are cosmetic-plus:
  admin/reporting shows active, and the `active`-branch grace in
  `is_app_access_allowed` gives self-canceled orgs 7 unpaid days past
  their chosen end. Already half-tracked in docs/TODO.md "Claude Zone"
  — fold this in when the rollover job lands.
- [P3] services/billing.py:305-307 — duplicated `sub.plan = plan`
  line in `choose_plan`; the pending-intent email is also sent before
  commit (founder gets mail even if the transaction later fails).

## R3 — money sweeps (scheduler.py)

All seven sweeps are single-flighted behind advisory locks (d906fe6) and
the recurring sweep now has per-period idempotency + eager plan loading
(22cb1ea, earlier today). PaymentMethod.organization_id is UNIQUE, so
the renewal join cannot fan out. Overdue/billing-info/renewal-draft
logic re-read: overdue collapses multiple invoices to one flip per sub;
billing-info stamps in-transaction (TOCTOU closed by the lock);
renewal-draft is idempotent on (subscription_id, draft).

- [P2] services/invoicing/service.py:280-282 — `prepare_renewal_draft`
  projects the next-period amount from CURRENT `seat_count` and plan —
  the same pending-blindness as the two R2 P1s. Once the sweep honors
  `pending_seat_count`/`pending_plan`, the founder's review draft must
  be computed the same way, or every queued change produces a draft
  that disagrees with the eventual charge. Fix together with the R2
  P1s (shared helper: "effective next-period plan+seats").

## R4 — invoicing (service, numbering, storage, exporter)

service.py read line-by-line; numbering.py in full; storage/exporter
skimmed (91 % covered; July verified numbering/integrity). Issuance
ordering (render+store before the `issued` flip, same transaction as
the immutability trigger) is correct; credit-note over-credit guard and
yearly advisory-locked numbering are sound.

- [P2] api/v1/admin_invoices.py + services/invoicing/service.py —
  **the renewal-draft pipeline has no exit.** There is NO
  confirm/issue endpoint for a draft anywhere (routes: list, detail,
  mark-paid, void, credit-note, manual, send, exports). Consequences
  chain: (a) the documented bank-transfer cycle ("founder issues an
  invoice (manual or renewal-draft), marks it paid") is impossible via
  drafts — only `issue_manual` works; (b) a stale draft suppresses ALL
  future drafts for that sub — `prepare_renewal_draft`'s idempotency
  key is `(subscription_id, status='draft')` with no period scoping;
  (c) mark-paid has no draft guard (router 409s only paid/voided), and
  marking a draft paid PERMANENTLY jams it: status leaves 'draft', the
  immutability trigger locks the pdf_* columns, no PDF can ever be
  attached, and if subscription-linked (renewal drafts always are) it
  extends the customer's period off a document that was never issued.
  Fix: add a draft→issue confirm endpoint (render+store+flip, reusing
  `_issue_internal`'s tail), 409 mark-paid on drafts, and scope the
  draft-idempotency key by period.
- [P2] services/invoicing/service.py:317-370 — `mark_paid` is
  read-then-act with no row lock; two concurrent mark-paid requests
  (double-click) both pass the router's status guard and BOTH call
  `apply_manual_payment_success` → the subscription period is extended
  twice for one payment. Fix: `SELECT … FOR UPDATE` the invoice inside
  the service and re-check status there (guards belong in the service,
  not just the router).
- [P2] services/invoicing/service.py:626 + db/models/billing_settings.py
  — `issuer_dic` is hardcoded `None` and BillingSettings has no DIČ
  field, but `is_vat_payer=True` is a supported setting that computes
  VAT. Flipping the flag produces daňové doklady with VAT amounts and
  NO DIČ — not legally valid. Either add `seller_dic` (required when
  `is_vat_payer`) or refuse to enable the flag without it. Latent
  until VAT registration.
- [P2] services/invoicing/service.py:395-429 — credit-note over-credit
  guard compares only the single new note against the original; N
  sequential credit notes each ≤ the original pass individually
  (3 full negations = 3× refund paper trail). Sum existing
  credit-notes for `related_invoice_id` into the check.
- [P3] services/invoicing/service.py:458 — the issuer-check line
  `if not billing.issuer_ico if hasattr(billing, "issuer_ico") else
  not billing.seller_ico:` is a conditional expression relying on
  `hasattr` being False forever (no `issuer_ico` attribute exists).
  Behaviorally correct today, booby-trap tomorrow. Replace with
  `if not billing.seller_ico:`.
- [P3] services/invoicing/service.py:532-554 — `_materialise_line`
  truncates with `int()` (toward zero) while `_build_lines_for_charge`
  uses banker's rounding; a non-payer line with an explicit
  `vat_rate_percent` stores the rate with zero VAT. Unify rounding +
  clamp the rate when not a VAT payer.
- [P3] services/invoicing/service.py:719-727 — `_advance_period` uses
  365/30-day arithmetic while real periods use calendar `_add_months`;
  draft period labels drift a few days from the eventual charge.
- [P3] services/invoicing/service.py:524 — `unit_price_minor =
  net_base // seats` floors, so unit × qty ≠ line subtotal on the
  rendered document (3 seats × 3 333 ≠ 10 000). Accountants notice.
  Use quantity=1 lines or distribute the remainder.
- [P3] services/invoicing/numbering.py:29-31 — the advisory-lock key
  is the bare year (2026); the app now has several advisory locks
  (scheduler 918 27xx). No collision today, but namespace the key
  (e.g. `0x1NV << 32 | year`) before someone picks a small int.

## R5 — admin money surfaces + authz

admin_invoices.py routes all behind `require_super_admin` ✓; customer
invoices.py org-scoped ✓; payments router role gates verified in R1;
super-admin billing actions (activate/comp/enterprise/cancel/extend)
audited via `_audit` ✓. Void guard rejects only re-void.

- [P3] api/v1/admin_invoices.py:250-267 — voiding a PAID invoice is
  allowed and leaves the already-applied subscription extension in
  place; Czech practice for a paid document is a credit note, not
  void. Consider 409 + pointing at credit-note.
- [P3] api/v1/invoices.py:48-117 — tax invoices (with billing
  address + IČO) are visible to EVERY org member via
  `require_org_membership`, while the charge list next door is
  admin-only. Align on admin-only.

## R6 — test quality + coverage gaps

Numbers look healthy (billing 87 %, invoicing 91 %) but the MISSING 13 %
of billing.py is precisely the renewal money core — the opposite of the
"money code should be the most test-covered" goal:

- [P1-blocking-gap] `apply_renewal_success` (billing.py:727-766) has
  **zero** covered lines, and `mark_charge_failed`'s renewal dunning
  branch (870-878) likewise. No test anywhere dispatches a
  `kind='renewal'` webhook. This is exactly why the two R2 P1s (queued
  swap/downsize misbilling) survived: the only code path that applies
  pending changes has never been executed by a test. Needed: an
  end-to-end renewal test (due sub → sweep creates charge → PAID
  webhook → period rolls, pending seat/plan applied, amounts asserted)
  plus a dunning ladder test (fail ×3 → past_due, backoff dates).
- Missing scenario tests that map 1:1 to this review's P1s: queued
  downsize → renewal amount; queued interval swap → renewal amount +
  period length; canceled-org re-checkout; double seat-change-init.
- `apply_initial_payment_success`'s already-active idempotency guard
  (line 630) is untested; so are `extend_trial` edge branches and the
  proration module (test_billing_proration.py = 1 test).
- Amount assertions are rare across money tests (~2 sites assert
  minor-unit values; most assert status transitions only). Money tests
  should assert amounts, not just states.
- storage.py's S3 branch — the PRODUCTION backend — has zero test
  coverage (tests exercise the local-fs fallback only). At minimum,
  moto/stub the boto3 client for store/fetch/hash-verify.
- scheduler.py's uncovered 21 % is runner loops + freeing-email
  branches — acceptable, but the freeing notification path has no test.

