# Invoicing operations runbook

Operational playbook for the Czech-law-compliant tax-invoicing system.
Covers founder workflows in `/admin/faktury`, customer-facing surfaces,
the architecture under the hood, configuration prerequisites, and the
common operational issues that bite.

## Overview

SimpleCRM emits two distinct things that both look like "invoices" if
you squint:

1. **`Charge`** — a ComGate payment-attempt record. `kind ∈ {initial,
   renewal, seat_upgrade}`, `status ∈ {pending, paid, failed, refunded}`.
   Never a legal document; just an attempt log.
2. **`Invoice`** — the legal *daňový doklad* (or *faktura* if the
   issuer isn't a DPH plátce). Czech law requires gap-free yearly
   sequencing, immutability after issue, and 10-year archival.

The customer's "Faktury" sub-tab shows `Invoice` rows; "Platby" shows
`Charge` rows. The /admin shell shows both, in different tabs.

Legal authority:
- Sequencing + 10-year archival: § 11 zákona č. 563/1991 Sb. (zákon o
  účetnictví).
- DPH-payer requirements (DUZP, IČO, DIČ): § 29 zákona č. 235/2004 Sb.
  (zákon o DPH).
- Issuer identification: § 435 občanského zákoníku.

## For the founder (super-admin operations)

All founder workflows live under `/admin/faktury`.

### Issuing manually (refunds, comp orgs, one-off corrections)

1. Open `/admin/faktury` → **Vystavit ručně** (top-right button).
2. Type the org name into the typeahead. Pick from the dropdown.
3. Add line items: description, quantity, unit (`ks`, `h`, …), price in
   Kč. The total preview updates live; the backend recomputes
   authoritatively on submit.
4. Optionally set a custom splatnost (defaults to issued + 14 days).
5. **Vystavit fakturu** — issuance is synchronous: PDF + ISDOC are
   rendered, hash-verified, and stored before the modal closes. The
   detail drawer auto-opens with the new invoice selected.

If you see "Nakonfigurujte fakturační údaje", the issuer fields in
`BillingSettings` are missing. Go to `/admin/nastaveni` first.

### Issuing a credit note (refund customer)

1. Open the original invoice in the detail drawer.
2. Click **Vystavit dobropis**.
3. Lines come pre-filled at *negative* prices. Edit if it's a partial
   refund — leave at full negation if it's a complete reversal.
4. Required: **důvod** (min. 3 znaky). This goes into the dobropis's
   `note` and into the audit-log payload — keep it specific
   ("Refund po reklamaci 2026-04-30 — vadný účet"), not generic ("oprava").
5. **Vystavit dobropis** — the new invoice has `kind='credit_note'` and
   a `related_invoice_id` pointing at the original. The drawer
   re-targets to the credit note after issuance.

The system rejects credit notes whose absolute total exceeds the
original — § 42 ZDPH doesn't allow refunding more than was charged.

### Marking paid / voiding / re-sending

In the detail drawer:

- **Označit jako zaplaceno** — flips status to `paid`, sets `paid_at` to
  now. 409 if already paid (idempotent).
- **Stornovat** — status → `voided`. Type a reason (≥ 3 chars). The PDF
  stays in storage; the customer-facing list shows it strikethrough.
- **Odeslat** — runs `InvoiceMailer.send` against the customer email
  snapshot. Currently logs to stdout (the email module is a stub
  pending SES/Resend integration); when wired, it'll attach the
  hash-verified PDF.

Each action writes an audit-log entry visible in the timeline at the
bottom of the drawer.

### Year-end exports

Three buttons in the InvoicesList header:

- **CSV {year}** — semicolon-delimited, UTF-8 BOM-prefixed. Opens
  directly in Excel cs-CZ. One row per non-draft invoice with all the
  fields the accountant cares about (number, dates, customer, totals,
  IČO/DIČ).
- **PDF ZIP {year}** — every PDF for the year, named `{year}/{number}.pdf`.
  Hash-verified on fetch.
- **Úplný {year}** — single ZIP combining the CSV + every PDF + every
  ISDOC XML. **This is the bundle you send the accountant.**

The export year follows the year filter at the top of the list. If you
haven't picked a year, all three buttons default to the current
calendar year.

Voided invoices are included in exports — accountants need to see them
to reconcile.

### Archive integrity check

The **Integrita archivu** card at the top of `/admin/faktury` shows the
last weekly run.

- Three counters: zkontrolováno / v pořádku / selhalo.
- Failure list (if any) names the invoice number, which file (`pdf` or
  `isdoc`), and the error.
- **Spustit kontrolu** runs the walk synchronously. On a small archive
  (<100 invoices) this finishes in a second or two.

What's checked: every invoice with stored bytes is re-fetched via
`InvoiceStorage`, which recomputes SHA-256 and compares to the
`pdf_sha256` / `isdoc_sha256` recorded at issuance. A failure means
**either** the storage layer was tampered with **or** the database row
was tampered with — either way, the auditor's nightmare. Each failure
also lands as an `integrity_failure` audit entry on the offending
invoice's timeline.

## For the customer

`/app/nastaveni/predplatne` shows two cards under "Předplatné":

- **Faktury** — legal tax-invoice documents. Per-row download icon
  fetches the hash-verified PDF.
- **Platby** — ComGate payment attempts (operational record).

Drafts are excluded from the customer view by design — those are the
founder's review queue under the daily renewal-draft scheduler.

## Architecture

```
ComGate webhook → /payments/webhook
                     │
                     ▼
            services/billing.py (apply_*_success)
                     │
                     ▼
            InvoiceService.issue_for_charge
                     │
        ┌────────────┴────────────┬──────────────┐
        ▼                         ▼              ▼
   InvoiceCounter             Renderer       Storage
  (advisory lock)         (WeasyPrint +     (S3 / local)
                           lxml ISDOC)
        │                         │              │
        └─────────────┬───────────┘              │
                      ▼                          │
                  Invoice                        │
                 (db row)                        │
                      │                          │
                      └────── pdf_sha256 ◀───────┘
```

Module-by-module:

- `app/db/models/charge.py` — ComGate attempts.
- `app/db/models/invoice.py` — legal documents.
- `app/db/models/invoice_line.py` — line items.
- `app/db/models/invoice_counter.py` — per-year sequencer (PK = `year`,
  `last_sequence` increments under `pg_advisory_xact_lock`).
- `app/db/models/invoice_audit_log.py` — append-only event log
  (UPDATE/DELETE blocked by triggers).
- `app/services/invoicing/numbering.py` — `allocate_invoice_number`.
- `app/services/invoicing/renderer.py` — WeasyPrint PDF + lxml ISDOC.
  Determinism via `finisher` callable that pins `pdf.info["CreationDate"]`
  and `pdf.info["ModDate"]`.
- `app/services/invoicing/storage.py` — `InvoiceStorage` with S3 +
  local filesystem fallback. Computes SHA-256 on every fetch + raises
  `IntegrityError` on mismatch.
- `app/services/invoicing/service.py` — `InvoiceService` orchestrator.
  `issue_for_charge` (idempotent), `issue_manual`, `prepare_renewal_draft`,
  `mark_paid`, `void`, `issue_credit_note`.
- `app/services/invoicing/mailer.py` — `InvoiceMailer.send`.
- `app/services/invoicing/exporter.py` — year CSV / PDF ZIP / full ZIP.
- `app/services/invoicing/integrity.py` — archive walker.
- `app/services/scheduler.py` — `renewal_draft_scheduler` (daily 04:00
  Europe/Prague), `integrity_check_scheduler` (every 7 days). Both
  started in `app/main.py` lifespan.

Database triggers (installed in the foundation migration):
- `trg_invoice_immutable` — UPDATE on a non-draft Invoice fails if any
  guarded field changes (number, total, issuer/customer snapshot,
  hashes). Status transitions and `paid_at` / `sent_at` / `note` are
  exempt.
- `trg_invoice_line_immutable` — UPDATE on an InvoiceLine fails if its
  parent Invoice has left `draft`.
- `trg_invoice_audit_log_no_update` / `trg_invoice_audit_log_no_delete`
  — UPDATE / DELETE on `invoice_audit_log` always fail.

## Configuration

Required environment variables (see `.env.example`):

- `S3_ENDPOINT_URL`, `S3_BUCKET_INVOICES`, `S3_ACCESS_KEY`,
  `S3_SECRET_KEY` — Hetzner Object Storage. If the endpoint URL is
  empty, the storage layer falls back to `var/invoices/` on the host
  (acceptable for dev; never for prod).
- `INVOICE_STORAGE_LOCAL_ROOT` — override the local fallback path.
  Defaults to `var/invoices/`.

Required `BillingSettings` fields (singleton row, edit at
`/admin/nastaveni`):

- `seller_iban` — issuer IBAN; goes into QR Platba on the PDF.
- `seller_ico` — issuer IČO (8-digit; legacy column name pre-#2).
- `issuer_name` — issuer's legal name.
- `issuer_address_street`, `issuer_address_city`, `issuer_address_zip`.
- `issuer_register_text` — "Zapsán v obchodním rejstříku…" or "Zapsán
  v živnostenském rejstříku" — appears in the PDF footer.
- `is_vat_payer` — set TRUE if you're a DPH plátce. Affects line VAT
  and the "Nejsem plátce DPH" footer note.
- `default_payment_term_days` — defaults to 14.
- `invoice_email_subject_template` / `invoice_email_body_template` —
  Jinja2 templates for `InvoiceMailer.send`.

Issuance hard-fails (409 `issuer_not_configured`) until all required
issuer fields are populated. The customer-facing initial-payment
endpoint catches this and logs a warning — payment still succeeds, but
no invoice is issued. Investigate any `issuer_not_configured` warnings
in the logs immediately.

## Common operational issues

**WeasyPrint version pin** — `pyproject.toml` pins `weasyprint>=63.0,<64`.
Bumping the major silently changes PDF output bytes, which makes every
already-stored `pdf_sha256` fail the integrity check. Don't bump
without re-running issuance for every existing row (you'd need a
migration that re-renders + re-hashes — non-trivial).

**"Invoice already paid" 409** — `mark_paid` is idempotent at the
status level. If the customer disputes a paid status, check the audit
log for the `paid` event's `payload.paid_at` and `actor_user_id`. The
event tells you who clicked the button and when.

**Integrity check failed** — read the failure entry's `error` field:
- `IntegrityError: ...` — bytes don't match `pdf_sha256`. Storage layer
  was tampered with, OR the database row was tampered with. Compare
  the stored bytes' hash with `pdf_sha256` manually before deciding
  which side is wrong.
- `missing: ...FileNotFoundError...` — file is gone from storage
  entirely. Check S3 logs / object storage console for deletion events.

**Audit-log trigger blocks DELETE** — the trigger is unconditional. The
only legitimate path that needs to bypass it is **test cleanup**, which
uses `tests/conftest.py::wipe_invoicing_for_org`'s
`ALTER TABLE … DISABLE TRIGGER … DELETE … ENABLE TRIGGER` pattern.
Production code must never `DELETE` from `invoice_audit_log`.

**Voided invoices stay in storage + exports** — by design. Removing
them would create a sequence gap, which is illegal. The strikethrough
in the customer UI + the `voided` status in exports are sufficient
audit signal.

**`var/invoices/` fills up in dev** — the local fallback writes here
when S3 isn't configured. It's gitignored. Wipe with
`rm -rf backend/var/invoices` if it gets unwieldy; the next test run
recreates what it needs.

## Czech compliance gotchas

**Gap-free yearly numbering** — the per-year `InvoiceCounter` allocates
under `pg_advisory_xact_lock`, so concurrent issuance can't race. The
test `test_invoice_counter_allocates_under_concurrency` exercises this
at N=20.

If you accidentally allocate a number you don't end up using
(network failure between allocation and PDF render), don't try to
"reuse" it — issue another invoice with the next number, then void
the orphan separately. Auditors prefer "voided invoice 2026-0073" to
"missing invoice 2026-0073".

**Snapshot fields frozen at issuance** — issuer + customer snapshot
columns (issuer_name, customer_address, issuer_iban, etc.) are copied
into the Invoice row at issue time. Changing `BillingSettings.seller_iban`
later does NOT retroactively rewrite issued invoices. This is
intentional — the legal document records what was true on the day it
was issued.

**VAT-payer toggle must match real registration** — `BillingSettings.
is_vat_payer = True` makes the renderer emit DPH columns and a DUZP-
labelled date. Setting it incorrectly is a hard compliance violation.
If your status changes mid-year (you cross the registration threshold),
update the toggle on the day the registration becomes effective; old
invoices already have the snapshot frozen.

**ISDOC for B2B** — ISDOC 6.0.1 XML is emitted alongside every PDF.
Czech B2B accounting software (Pohoda, Money S3, Helios) imports it
directly. The full year ZIP includes one `.isdoc.xml` per invoice for
the accountant.

## Related docs

- `docs/runbook.md` — production deployment + backup / secret rotation
- `docs/comgate-setup.md` — payment provider configuration
- `docs/prompts/INVOICES_TASK.md` — original 14-commit specification
  (historical reference; treat this runbook as the current source of
  truth)
