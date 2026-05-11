# SimpleCRM — ComGate Go-Live Audit + Pricing-UX Polish

You are a Claude Code session running in the repo root with full edit
permissions. **This is an audit-then-fix task, not a fresh build.** Read
the existing code first, write a short status report per question
below, then make the focused code changes the audit surfaces. Don't
rewrite anything that's already correct.

When you're done, post a single end-of-turn summary that:
- answers each Q below with **OK / FIX-PROPOSED / OPEN-QUESTION**,
- links to the file:line you read or changed,
- lists every commit you made,
- flags anything you couldn't decide without the operator.

## Before you start

- Confirm the current branch is clean (`git status`); if not, ask before
  proceeding.
- Read `docs/comgate-setup.md` end-to-end. That doc is the source of
  truth for the ComGate integration.
- Skim `app/services/billing.py`, `app/services/comgate.py`, and
  `app/api/v1/payments.py` to anchor the audit.
- Don't run live ComGate calls. The audit is read-mostly; only mock
  tests should touch the network.

## What changed recently (don't re-do)

- `commit 75ff8b6` wired Zoho SMTP. Invoice mailer now attaches the PDF
  and goes from `faktury@simplecrm.cz`; feedback notifications go from
  `info@simplecrm.cz`. SMTP credentials are still env-var-only. The
  human TODO at `docs/TODO.md` lists the Zoho/DNS ops that have to
  happen on the deploy host before mail actually flows.
- The pay gate (`TrialExpiredGate`), choose-plan flow, ComGate hosted-
  page handoff, webhook, and super-admin Aktivovat path all exist.
  Audit them; assume they were correct at write-time but verify.

## Audit questions

For each question, find the relevant code, write **what's true today**
and **what's missing**. If a fix is small and clearly correct, make
it in this same session (one focused commit per topic). If a fix
needs operator input or is multi-day, leave it as `OPEN-QUESTION` in
the summary.

### Q1. Payment methods — card AND bank transfer

- Does the ComGate handoff actually offer both card AND bank-transfer
  methods, or only cards? Check `services/comgate.py` for the
  `paymentMethod` / `methods` parameter on the create-payment call and
  the hosted-page configuration.
- For bank transfers (ComGate "BANK_*" methods): **how do we confirm
  payment?** Read `app/api/v1/payments.py::webhook` — does it handle
  the pending → paid transition for bank transfers, which can land
  hours or days after the user closes the hosted page? Does the user's
  in-app state show "čeká na platbu" between hosted-page completion
  and bank confirmation, or does it silently look like nothing
  happened?
- Is the webhook signature verification still using the documented
  ComGate scheme, or is there any TODO/comment hinting it was stubbed?

### Q2. Invoice flow — where do we collect Czech company creds?

- The invoice schema in `app/db/models/invoice.py` includes ICO, DIC,
  customer name + address. Where in the **first-time user flow** do we
  collect these? Is it on `/onboarding/create-org`, in
  `/app/settings/organization`, or only when the user first hits the
  pay-gate?
- **Acceptance criterion the operator is asking for:** these fields
  must NOT block the free trial. A user without an ICO must still
  reach `/app`, use the product, and only get prompted for company
  details at the moment they pick a paid plan. Verify this.
- If a customer is a non-Czech business or a natural person without
  an ICO, what does the invoice look like? Czech tax law allows
  fyzická osoba invoices — confirm the schema + PDF render handle
  that branch.
- Are ICO + DIC validated client-side (format) and server-side (ARES
  lookup)? We already have ARES integration on the
  `/companies` flow; is the org-level invoice form reusing it?

### Q3. Trial expiry → payment prompt → lockout

- Read `app/services/billing.py::is_app_access_allowed` and
  `app/core/deps.py::require_active_trial_or_subscription`. The
  contract the operator wants:
  - **New trial signups**: trial ends → access cut immediately (zero
    grace days). The current code has a 7-day `past_due` grace — that
    grace must apply to **already-paying** orgs whose card declined,
    NOT to brand-new trials that never paid. Verify the branching.
  - **All users of the affected org** must be locked out simultaneously
    (not just the admin). Salespeople under a frozen org should hit the
    pay-gate too. Verify with a quick test that exercises both roles.
- Where is the "free trial just ended, please pay" prompt rendered?
  Confirm it tells the user clearly that they can export their data
  (the `/api/v1/reports/export-csv` bypass is intentional per
  `ProtectedRoute.tsx`).
- After payment, does access restore **immediately** on webhook
  receipt, or only on next page load? Check.

### Q4. Landing-page CTA cleanup

- The hero CTA reads "Vyzkoušet 30 dní zdarma"; the pricing trial card
  reads "Začít zdarma". Both route to `/signup`. Is there ANY
  functional difference between them (utm params, A/B split, anything)?
- If there's none, **delete** the "Začít zdarma" variant: pick one
  label ("Vyzkoušet 30 dní zdarma" — the more specific one) and use it
  everywhere. Make sure the test at
  `frontend/src/__tests__/landing.test.tsx` still matches afterwards.

### Q5. Billing settings — live cost calculation + annual savings

- Open `frontend/src/app/settings/UsersSection.tsx` (seat-count input)
  and the billing tab. As the admin types a new seat count, does the
  displayed monthly + annual cost re-render live? Or do they have to
  press a button to recalculate?
- For the annual plan, do we show **both**:
  - the percent saved vs monthly (e.g. "Ušetříte 16 %"), AND
  - the absolute koruna amount saved per year (e.g. "Ušetříte 1 188 Kč
    ročně")?
- The CreateOrgPage plan step already shows the annual badge "Ušetříte
  16 %". Confirm parity between onboarding + settings — both surfaces
  should show the same calculation and the same wording.

## Additional questions you should also answer (operator didn't list these but they matter for go-live)

### Q6. DPH (VAT) on invoices

- Is the issuer (us) a registered VAT payer? Check `BillingSettings.dic`
  and the invoice PDF template — does it render with "DPH 21 %" lines
  when issuer is VAT-registered, and as a non-VAT invoice otherwise?
- The customer's `dic` is optional — does the template handle both
  populated and empty values without leaving stray "DIČ:" labels?

### Q7. ISDOC + email delivery end-to-end

- The invoice PDF is attached now (commit 75ff8b6). Is the **ISDOC XML**
  also attached when the customer wants it, or sent separately? Czech
  B2B convention is to bundle both.
- Run an integration test that creates a real invoice → triggers the
  mailer with a fake SMTP — does the audit log entry now report the
  attachment count correctly (was 0 before)?

### Q8. Webhook resilience

- ComGate retries webhooks up to 10 times. Is the webhook idempotent?
  Specifically: receiving the same `transId` twice — does it produce
  duplicate Charges, duplicate audit entries, or duplicate
  subscription state transitions?
- Does the webhook validate that the payment amount matches what we
  asked for? A spoofed webhook claiming 1 Kč for a 5 940 Kč seat
  upgrade must be rejected.

### Q9. Initial payment vs. recurring renewal vs. mid-period seat
upgrade

- Three distinct ComGate flows live in `app/api/v1/payments.py`:
  `initial-payment-init`, recurring renewals (scheduler?),
  `seat-change-init`. Read all three. Is the renewal path actually
  implemented or still a TODO? If it's still a TODO, what
  triggers a renewal today — manual super-admin Aktivovat?

### Q10. Refunds and cancellations

- Where does a customer cancel? `/app/settings/billing` should expose
  it — confirm.
- On cancellation, does access continue until `current_period_ends_at`
  (standard SaaS contract), or end immediately? Whichever it is, the
  cancel button copy needs to match.

### Q11. Currency, locale, language

- CZK only, or do we support EUR? Check `BillingSettings.currency` and
  the plan price columns.
- The PDF + emails render in Czech. Is there an English fallback for
  non-Czech customers, or do we deliberately only sell to CZ?

### Q12. Test-mode vs production-mode toggle

- `COMGATE_TEST_MODE` defaults to `true`. What flips it for production?
  Is there a deployment checklist anywhere that reminds the operator
  to set it to `false` on go-live? If not, add a startup log warning
  ("ComGate running in TEST MODE") so it's loud during smoke-tests.

### Q13. Audit log completeness for payments

- Every payment-state transition (trial start, plan chosen,
  hosted-page redirected, webhook received, charge succeeded, charge
  failed, refund, cancellation) should write to an audit table that's
  visible to the super-admin. Pick three random transitions, follow
  them through, and report any that don't produce a row.

## Deliverable

- `commit` each focused fix separately with a clear scope.
- Update `docs/TODO.md` (the human zone) with any operational follow-ups
  you discover.
- Update `docs/comgate-setup.md` if you find any place where the doc
  drifted from code.
- Don't push to remote unless the operator asks; leave commits local on
  `main`.
- End-of-turn summary in the format described at the top.
