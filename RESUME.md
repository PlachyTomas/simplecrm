# Resume: INVOICES_TASK.md commit #6

**Last completed:** *feat(invoicing): InvoiceService orchestrator and InvoiceMailer* (commit #5).

## State at session end

- Migration head: `1a5b9f76b1ee` (no schema changes since #2).
- New modules in `app/services/invoicing/`:
  - `numbering.py` — `allocate_invoice_number(session, year)` returning `(seq, number, variable_symbol)` under a per-year `pg_advisory_xact_lock`.
  - `service.py` — `InvoiceService` with `issue_for_charge`, `issue_manual`, `mark_paid`, `void`, `issue_credit_note`. Idempotent issuance (existing invoice for charge_id → returned as-is). Validates `BillingSettings` issuer fields are non-empty before issuance (`InvoiceIssuerNotConfiguredError`). Credit notes can't exceed the original total (`CreditNoteExceedsOriginalError`). Czech declension helper `_user_word(n)` for proper "uživatel/uživatelé/uživatelů" line descriptions.
  - `mailer.py` — `InvoiceMailer.send` renders the BillingSettings Jinja2 subject/body templates with invoice context, fetches + hash-verifies the stored PDF before send (logs `send_failed` audit on transport error), writes `sent_at` + `sent_to_email` + `sent` audit row.
- **Renderer determinism upgrade**: `render_pdf` now uses a WeasyPrint `finisher` callable that pins `CreationDate` and `ModDate` in the PDF info dict to `invoice.issued_at`. The previous `pdf_creation_date=…` kwarg was silently ignored (WeasyPrint 63 doesn't accept it as a top-level option) — determinism only "worked" by accident because two consecutive renders happened in the same wall-clock second. Now load-bearing.
- 9 new tests in `tests/services/test_invoicing_service.py`:
  - rejects when issuer not configured
  - happy-path issuance with full audit trail (`allocated`, `pdf_stored`, `issued`)
  - idempotency on webhook replay (same id, same number, no second render)
  - manual issuance with custom lines
  - mark_paid records audit + sets paid_at
  - void leaves PDF in storage + adds `voided` audit
  - credit note creates separate row, original untouched
  - over-credit rejected
  - mailer round-trips, writes `sent` audit + `sent_at`/`sent_to_email`
- Backend suite: **423 passed** (414 → 423). mypy strict + ruff clean. **Seven commits ahead of `origin/main`.**

## Next: commit #6 — `feat(invoicing): wire issuance into ComGate webhook charge-paid path`

Hook the orchestrator into the existing webhook so paid charges automatically issue invoices.

### Files to touch
- `backend/app/api/v1/payments.py`
  - In `_dispatch_success` (after `charge.status = "paid"` is set), call `await InvoiceService().issue_for_charge(session, charge, by_admin_id=None)`. Wrap in try/except — if invoice issuance fails (e.g. issuer not configured), log a `WARNING` but don't break the webhook (the charge is still paid; the invoice can be issued manually later from the super-admin UI).
  - The orchestrator's idempotency check makes the webhook safe to re-fire.
  - Skip issuance for comp orgs — check `subscription.is_comp` and short-circuit. Already-paid charges shouldn't have invoices either; the existing `if charge.status in {"paid", "failed", ...}` early-return covers webhook replay correctly.
- `backend/tests/api/v1/test_payments.py` — add a test that the webhook handler creates the invoice row alongside flipping the charge to `paid`. Need to seed BillingSettings with valid issuer fields (use the helper from test_invoicing_service.py — promote it to a conftest if needed).

### Watch out for
- The webhook flow runs inside its own session (per the `payments.py` handler). The orchestrator's `await session.flush()` calls write into the same transaction — good. The final `await session.commit()` at the end of the webhook handler commits everything atomically.
- `subscription.is_comp` check needs a SQL load — the charge has `organization_id` but not `is_comp`. Pull `Subscription` row first.
- `enterprise` org with override price — already handled by `compute_seat_proration` upstream; the orchestrator's `_build_lines_for_charge` derives unit price from `charge.amount_minor // seats`, which is the post-override value. No change needed.
- The renderer warning about `Ignored fill:#000000` is from the QR Platba SVG — harmless, but spamming. Worth quieting in a follow-up.

### How to start commit #6

1. `cd backend && uv run alembic current` — head is `1a5b9f76b1ee`.
2. `cd backend && uv run pytest -q` — confirms 423 green.
3. Read `app/api/v1/payments.py:_dispatch_success` for the hook point.
4. Add the call + comp-org skip + try/except. Don't forget BillingSettings issuer-fields validation can raise — log + continue, don't 500 the webhook.
5. Test: seed an org+sub+charge, fire the webhook, assert both `Charge.status='paid'` and an Invoice row was created with the correct `charge_id`.
6. Gates, commit, update RESUME.

## Carryover from commits #1–5

- Endpoint URL `/api/v1/payments/invoices` intentionally not renamed.
- `invoice_audit_log` REVOKE deferred (triggers cover protection).
- BillingSettings issuer columns must be filled in via UI before issuance.
- WeasyPrint pinned `>=63.0,<64`; bumping breaks already-stored `pdf_sha256`.
- ~1 MB of TTFs in repo (Inter + JetBrains Mono).
- S3 path implemented but not exercised by tests; configure Hetzner bucket + integration test before flipping `s3_endpoint_url`.
- WeasyPrint emits a `Ignored fill:#000000` warning for the QR SVG. Cosmetic; noisy in CI.
- The orchestrator's `_require_issuer_configured` falls back to `seller_ico` (the legacy column name kept for compatibility); the snapshot also uses `billing.seller_ico`. **Inconsistency**: snapshot fields are named `issuer_*` but `BillingSettings` still has `seller_ico` and `seller_iban`. Worth a follow-up rename for consistency, but not blocking.
