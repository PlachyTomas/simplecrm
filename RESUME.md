# Resume: INVOICES_TASK.md commit #7

**Last completed:** *feat(invoicing): wire issuance into ComGate webhook charge-paid path* (commit #6).

## State at session end

- Migration head: `1a5b9f76b1ee` (no schema changes since #2).
- `app/api/v1/payments.py:_dispatch_success` now calls `InvoiceService().issue_for_charge(session, charge)` after the billing-service `apply_*_success` runs. Comp orgs are skipped (defensive — comp subs shouldn't reach the webhook, but double-check). `InvoiceIssuerNotConfiguredError` is logged at WARNING and swallowed (the webhook stays a 204; the founder issues manually later). Any other exception from the orchestrator is `logger.exception`'d and swallowed for the same reason — a renderer crash shouldn't mask the fact that the customer paid.
- Test cleanup helper `_wipe_invoices_for_org(session, org_id)` in `tests/api/v1/test_payments.py` disables the `trg_invoice_audit_log_no_delete` trigger, deletes audit-log + line + invoice rows for an org, re-enables the trigger. Used in 3 places: the new test, the existing `test_webhook_initial_paid_promotes_to_active`, the seat-upgrade test, and the autouse `owned_payments_emails` fixture.
- 1 new test `test_webhook_paid_charge_auto_issues_tax_invoice` covers: configure issuer fields, fire a PAID webhook for a fresh org's initial charge, assert `Invoice.charge_id` matches + status='issued' + total_minor=99000 + pdf_object_key non-NULL.
- Backend suite: **424 passed** (423 → 424). Three commits ahead of `origin/main` after this commit lands.

## Next: commit #7 — `feat(invoicing): add daily renewal-draft scheduler job`

A scheduled job runs at 04:00 Europe/Prague: finds active subscriptions where `current_period_ends_at` is within the next 7 days, generates the next-period invoice with `status='draft'`, queues it for super-admin review. The operator confirms and "issues" via UI before the renewal charge fires.

### Files to touch

- `backend/app/services/scheduler.py` — add a new APScheduler job. The existing scheduler module already has a `recurring_renewal_charges` job that runs at 03:00 and triggers ComGate charges; this new one runs at 04:00 (one hour later, after the recurring job would have caught any failed renewals overnight) and just creates draft invoices.

```python
async def daily_invoice_renewal_drafts(*, now: datetime | None = None) -> int:
    """For each active sub with current_period_ends_at within 7 days,
    create a status='draft' Invoice projecting the next period's
    charge. Returns the number of drafts created."""
```

The job should be idempotent — if a draft already exists for the next-period invoice (matched on `subscription_id` + `taxable_supply_date`), skip. Add a uniqueness pre-check rather than relying on the unique constraint, because the existing `(year, sequence_in_year)` constraint doesn't apply to drafts that haven't been numbered yet.

Wait — actually, **drafts shouldn't consume sequence numbers**. The `allocate_invoice_number` helper bumps the counter; if the founder later voids the draft, the number is gone. Per the prompt §3, "If issuance fails after allocation, write a `voided` invoice record holding that number — never reuse" — so the founder voiding a draft would leave a voided number.

Better: drafts get a placeholder number like `DRAFT-{uuid.uuid4().hex[:8]}` that the issue endpoint replaces with the real `YYYY-NNNN` at the moment the founder confirms. **This is a design change from commit #5**'s assumption that drafts have real numbers. Audit:
- `Invoice.number` column is `String(16) UNIQUE NOT NULL` — placeholder fits but uniqueness must hold. UUID-based prefixes work.
- `Invoice.year`, `sequence_in_year`, `variable_symbol` are NOT NULL. For drafts we'd need to set them to something. Maybe `year=current_year`, `sequence_in_year=0`, `variable_symbol='DRAFT-...'`. But `(year, sequence_in_year)` is unique — multiple drafts with `seq=0` would collide.
- **Cleanest design for #7**: drafts allocate real numbers. If the founder discards a draft, we mark it voided and the number is consumed. The §3 rule already says voided numbers are fine. The cost is wasted numbers, which is acceptable for an alpha; it's also what Fakturoid does.

OK — drafts get real numbers. The scheduler reuses `InvoiceService.issue_for_charge`-style flow but stops at `status='draft'` (no PDF render, no storage). Or write a new method `prepare_renewal_draft(sub)` that builds the row + lines but doesn't render.

Concretely:

```python
async def prepare_renewal_draft(self, session, *, subscription: Subscription) -> Invoice:
    """Build the next-period draft invoice for `subscription`. Allocates
    a number, snapshots issuer + customer, builds lines from the
    subscription's plan + seat count + period bounds, returns the
    Invoice row in status='draft'. No PDF render."""
```

Then `daily_invoice_renewal_drafts` iterates and calls `prepare_renewal_draft`. The super-admin UI (commit #9-10) will render+store on confirm via a "Vystavit" button that calls `InvoiceService.issue_draft(invoice_id)` (yet another new method).

### Tests

- `test_invoicing_scheduler.py`:
  - drafts are created for subs ending within 7 days
  - subs ending 8+ days out are skipped
  - subs that already have a draft for the same period are skipped (idempotency)
  - comp subs are skipped
  - returns the count

### Watch out for

- The job must use a fresh `AsyncSessionLocal()` (existing pattern in `scheduler.py`).
- APScheduler's `AsyncIOScheduler` triggers must be wrapped in `asyncio.run_coroutine_threadsafe` or similar — see how the existing renewal-charges job is registered.
- `subscription.current_period_ends_at` can be NULL (comp subs, freshly-created trials). Filter those out.

### How to start commit #7

1. `cd backend && uv run alembic current` — head is `1a5b9f76b1ee`.
2. Read `app/services/scheduler.py` for the existing job-registration pattern + how it iterates subs.
3. Add `prepare_renewal_draft` to `InvoiceService` first (small, easy to test in isolation).
4. Then the scheduler job that calls it.
5. Tests, gates, commit, update RESUME.

## Carryover from commits #1–6

- Endpoint URL `/api/v1/payments/invoices` not renamed.
- `invoice_audit_log` REVOKE deferred (triggers cover protection).
- BillingSettings `seller_ico` / `seller_iban` are the legacy column names; snapshot fields use `issuer_*`. Worth a follow-up rename for consistency.
- WeasyPrint pinned `>=63.0,<64`; bumping breaks already-stored `pdf_sha256`.
- WeasyPrint emits a `Ignored fill:#000000` warning per render (QR SVG). Cosmetic.
- S3 storage path implemented but not exercised by tests; configure Hetzner bucket + integration test before flipping `s3_endpoint_url`.
- The webhook now writes invoice rows + ~3 audit-log entries on every paid charge. The autouse `_wipe_invoices_for_org` cleanup helper in `test_payments.py` keeps the dev DB tidy. CI fresh DB → no impact.
- **Important inconsistency for the scheduler**: `BillingSettings` is a singleton, so the issuer fields are global. If the scheduler runs while issuer fields are still empty, `prepare_renewal_draft` should still succeed (drafts don't validate strict issuer config — only issuance does). This means the founder can have draft invoices waiting + still need to configure their billing details before clicking "Issue".
