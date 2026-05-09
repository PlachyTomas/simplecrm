# SimpleCRM — In-House Invoicing & Super-Admin Invoice Management

> **Patched 2026-05-09** to reconcile against the actual repo state. Original draft assumed a Stripe-style "founder manually triggers issuance" flow + a clean slate; this codebase already runs ComGate webhooks and already has an `Invoice` model that means something else. Read §0 carefully — the rename is the load-bearing prerequisite for everything else.

This task introduces a Czech-law-compliant **tax-invoice** pipeline (Fakturoid-style PDF/A documents with gap-free sequencing, immutability, archival, and year export) on top of the existing ComGate-driven billing in this repo (commits up to `135d875`).

---

## 0. Prerequisite: rename existing `Invoice` → `Charge`

Today, `backend/app/db/models/invoice.py` defines an `Invoice` (table `invoices`) that is actually a **ComGate charge attempt record** — `kind ∈ {initial, renewal, seat_upgrade}`, `status ∈ {pending, paid, failed}`, holds `comgate_trans_id`, period bounds, `amount_minor`. That's a payment-attempt log, not a tax document.

Czech invoice law uses *faktura* / *daňový doklad* for the legal artifact this task produces. To free up the `Invoice` name, rename the existing model and its references:

- `backend/app/db/models/invoice.py` → `backend/app/db/models/charge.py`, class `Invoice` → `Charge`, table `invoices` → `charges`
- Update all 8 references (`payments.py`, `subscription.py`, `admin.py`, `services/billing.py`, `services/scheduler.py`, `services/comgate.py`, `db/models/__init__.py`, plus tests)
- Migration: `op.rename_table("invoices", "charges")`. Indexes follow the table; the `comgate_trans_id` unique constraint stays under its renamed name.
- Regenerate `frontend/src/types/api.generated.ts` — `InvoiceOut` → `ChargeOut` etc.

This rename happens **inside the same commit as the new tax-invoice models** so git history shows one cohesive "introduce tax invoicing foundation" change rather than an inconsistent intermediate state.

---

## 1. Goal

Build the **tax-invoice generation, archival, listing, and export pipeline** so the founder (super-admin) can mimic Fakturoid's invoice-management workflow entirely in-house. Every successful payment produces a tax invoice; every issued invoice is rendered as PDF/A, stored immutably with a SHA-256 hash, archived for the legally-required retention period (10 years per zákona o účetnictví), and queryable through the super-admin UI. Year-end export produces a clean handover package for the founder's accountant (CSV manifest + ZIP of PDFs + ISDOC XML alongside each PDF).

**Scope notes:**
- ComGate is the active payment processor (committed, webhook-driven). When the webhook lands a charge transition to `paid`, the orchestrator **automatically** allocates a sequence number and issues a tax invoice. The super-admin UI exists for manual cases (refunds, comp activations, corrections) — not as the primary issuance trigger.
- The seller is currently a **non-DPH OSVČ na paušální dani**. Invoices say `Nejsem plátce DPH` and contain no DPH amounts. The `BillingSettings.is_vat_payer` flag (already exists, default false) toggles this. When flipped to `true`, every newly-issued invoice includes DPH lines and the `Daňový doklad` designation. **Already-issued invoices are immutable** — they show whatever DPH state was true at their issue moment.
- Archival storage: **Hetzner Object Storage** (S3-compatible, env-configured). If the bucket is not yet provisioned, fall back to local filesystem under `var/invoices/` and document the migration path in `docs/invoicing.md`.
- Comp orgs (`Subscription.is_comp = true`) do not get invoices — they pay nothing. The webhook flow already skips them.
- Enterprise pricing (`Subscription.override_price_per_user_minor`) is honoured at line-item generation.

---

## 2. Czech invoice legal requirements (single source of truth)

Sources: § 11 zákona o účetnictví (1563/1991 Sb.), § 435 občanského zákoníku, § 29 zákona o DPH (235/2004 Sb.) for the plátce variant.

**Always required:**
1. **Označení dokumentu** — `Faktura` (non-plátce) or `Faktura — daňový doklad` (plátce)
2. **Dodavatel (issuer)**: jméno/firma, sídlo, **IČO**, údaj o zápisu (živnostenský rejstřík for OSVČ; obchodní rejstřík for s.r.o.)
3. **Odběratel (recipient)**: name/firm, address, **IČO**; DIČ if they are a plátce
4. **Číslo faktury** — gap-free sequential per kalendářní rok
5. **Datum vystavení**
6. **Datum splatnosti** — default 14 days from issue
7. **Předmět plnění** — line items, e.g. `SimpleCRM, plán Roční, 8 uživatelů, období 1. 11. 2026 – 31. 10. 2027`
8. **Cena za jednotku × množství × celkem**
9. **Způsob platby + bankovní spojení** — IBAN, plus domestic format `číslo/kód`; **variabilní symbol** = invoice number with dash stripped
10. **Final total in CZK**

**Additional when `is_vat_payer = true`:**
11. **DIČ dodavatele**
12. **Datum uskutečnění zdanitelného plnění (DUZP)** — for prepaid SaaS = day payment received; for postpaid = end of period
13. **Základ daně + sazba DPH (21 %) + výše DPH** per row
14. **Sum of základ daně, sum of DPH, total with DPH**

**Additional for non-plátce:**
15. **Poznámka `Nejsem plátce DPH`** — best-practice; prevents customer accountant errors

**QR Platba (always)** — SPAYD-format QR code embedded as SVG. Generated via `qrplatba` (Python lib, MIT). Includes IBAN, amount, currency, VS, message, due date.

---

## 3. Numbering, sequencing & immutability rules

- **Sequence:** one per kalendářní rok, format `YYYY-NNNN` (zero-padded to 4 digits, expand to 5 if a year exceeds 9 999 invoices). Variabilní symbol = `YYYYNNNN` (no dash).
- **Allocation:** atomic via Postgres advisory lock. Allocated at issuance, never speculatively. If issuance fails after allocation, the row is written with `status='voided'` so the number is consumed and never reused.
- **Immutability:** once `status != 'draft'`, the row's content fields (lines, totals, dates, snapshots, pdf_*) are read-only at the database level via a Postgres trigger. Status transitions (`issued → paid`, `issued → overdue`, `issued → voided`) and `paid_at` setting are explicitly allowed.
- **Storage immutability:** PDF written once to Object Storage with versioning enabled; SHA-256 hash recorded in DB; subsequent reads verify hash matches before serving.

---

## 4. Data model

> **All FKs are UUIDs in this codebase**, not ints. The original draft used `int` everywhere — that's wrong.

### 4.1 `Invoice` (new — the tax-invoice document)

```python
class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True, nullable=False,
    )
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("subscriptions.id"), index=True,
    )
    # Triggering ComGate charge (NULL for manually-issued invoices).
    charge_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("charges.id"), index=True,
    )

    # Number sequencing
    number: Mapped[str] = mapped_column(String(16), unique=True, index=True)  # 'YYYY-NNNN'
    year: Mapped[int] = mapped_column(Integer, index=True)
    sequence_in_year: Mapped[int] = mapped_column(Integer)
    variable_symbol: Mapped[str] = mapped_column(String(16))  # 'YYYYNNNN'

    # Status
    status: Mapped[str] = mapped_column(String(32), index=True)
    # status: 'draft' | 'issued' | 'paid' | 'overdue' | 'voided'
    kind: Mapped[str] = mapped_column(String(16), default="invoice", server_default="invoice")
    # kind: 'invoice' | 'credit_note' | 'proforma'
    related_invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("invoices.id"),
    )  # for credit_note → points at the corrected invoice

    # Dates (per Czech law)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))   # datum vystavení
    taxable_supply_date: Mapped[date] = mapped_column(Date)                # DUZP
    due_at: Mapped[date] = mapped_column(Date)                              # datum splatnosti
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Issuer snapshot (frozen at issuance — survives BillingSettings changes)
    issuer_name: Mapped[str] = mapped_column(String(200))
    issuer_address: Mapped[str] = mapped_column(Text)
    issuer_ico: Mapped[str] = mapped_column(String(8))
    issuer_dic: Mapped[str | None] = mapped_column(String(16))
    issuer_iban: Mapped[str] = mapped_column(String(34))
    issuer_account_domestic: Mapped[str | None] = mapped_column(String(32))
    issuer_register_text: Mapped[str] = mapped_column(Text)
    issuer_is_vat_payer: Mapped[bool] = mapped_column(Boolean)

    # Customer snapshot (frozen)
    customer_name: Mapped[str] = mapped_column(String(200))
    customer_address: Mapped[str] = mapped_column(Text)
    customer_ico: Mapped[str | None] = mapped_column(String(8))
    customer_dic: Mapped[str | None] = mapped_column(String(16))
    customer_email: Mapped[str | None] = mapped_column(String(120))

    # Money — minor units (haléře), int only
    currency: Mapped[str] = mapped_column(String(3), default="CZK", server_default="CZK")
    subtotal_minor: Mapped[int] = mapped_column(Integer)
    vat_amount_minor: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    total_minor: Mapped[int] = mapped_column(Integer)
    vat_rate_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.00"))

    # Storage
    pdf_object_key: Mapped[str | None] = mapped_column(String(300))
    pdf_sha256: Mapped[str | None] = mapped_column(String(64))
    pdf_size_bytes: Mapped[int | None] = mapped_column(Integer)
    isdoc_object_key: Mapped[str | None] = mapped_column(String(300))
    isdoc_sha256: Mapped[str | None] = mapped_column(String(64))

    # Notes
    note: Mapped[str | None] = mapped_column(Text)
    payment_method: Mapped[str] = mapped_column(String(32), default="bank_transfer", server_default="bank_transfer")
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sent_to_email: Mapped[str | None] = mapped_column(String(120))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("year", "sequence_in_year", name="uq_invoice_year_seq"),
        Index("ix_invoice_org_issued", "organization_id", "issued_at"),
        Index("ix_invoice_year_status", "year", "status"),
    )
```

**Postgres trigger** `invoice_immutable_after_issue`: on UPDATE, when the OLD row's `status != 'draft'`, raise an exception if any of the snapshot, money, date, sequence, or `pdf_*`/`isdoc_*` columns are touched. Status transitions (`issued → paid`, `issued → overdue`, `issued → voided`) and the corresponding `paid_at` / `sent_at` / `sent_to_email` setting are explicitly allowed.

### 4.2 `InvoiceLine` (new)

```python
class InvoiceLine(Base):
    __tablename__ = "invoice_lines"

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), index=True,
    )
    position: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(Text)
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 3))
    unit_label: Mapped[str | None] = mapped_column(String(32))   # 'uživatel', 'měsíc', etc.
    unit_price_minor: Mapped[int] = mapped_column(Integer)
    vat_rate_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.00"))
    line_subtotal_minor: Mapped[int] = mapped_column(Integer)
    line_vat_minor: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    line_total_minor: Mapped[int] = mapped_column(Integer)
```

Same immutability via the parent's trigger (cascade UPDATE check).

### 4.3 `InvoiceCounter` (new — atomic sequencing)

```python
class InvoiceCounter(Base):
    __tablename__ = "invoice_counters"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_sequence: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )
```

Allocation flow inside a transaction:

```python
async with session.begin():
    await session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _lock_key(year)})
    counter = await session.get(InvoiceCounter, year, with_for_update=True)
    if counter is None:
        counter = InvoiceCounter(year=year, last_sequence=0)
        session.add(counter)
        await session.flush()
    counter.last_sequence += 1
    seq = counter.last_sequence
    number = f"{year}-{seq:04d}"
```

`_lock_key(year)` returns a stable bigint derived from `year` to scope the advisory lock per-year (multiple years can allocate concurrently).

### 4.4 `InvoiceAuditLog` (new — append-only)

```python
class InvoiceAuditLog(Base):
    __tablename__ = "invoice_audit_log"

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("invoices.id"), index=True,
    )
    event: Mapped[str] = mapped_column(String(64), index=True)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id"),
    )
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True, nullable=False)
```

Event values: `allocated` | `issued` | `pdf_stored` | `pdf_verified` | `sent` | `send_failed` | `paid` | `voided` | `credit_note_created` | `export_run` | `integrity_failure`.

INSERT-only at the application level. A Postgres trigger blocks UPDATE / DELETE on this table.

### 4.5 `BillingSettings` extension (commit #2)

Add fields needed for the issuer snapshot:
- `issuer_name: str`
- `issuer_address_street: str`, `issuer_address_city: str`, `issuer_address_zip: str`
- `issuer_register_text: str` — multi-line
- `issuer_account_domestic: str | None` — e.g. `123456789/0100`
- `default_payment_term_days: int` (default 14)
- `invoice_email_subject_template: str` — Jinja2
- `invoice_email_body_template: str` — Jinja2 (markdown source)

These extend the existing singleton; one new migration adds the columns.

---

## 5. PDF rendering & storage

### 5.1 Library stack

- **Jinja2** — already in deps
- **WeasyPrint** — backend dep; renders HTML+CSS to PDF/A-2b. Adds `libpango`, `libcairo`, `libgdk-pixbuf` system deps; production Dockerfile (when added) needs them.
- **qrplatba** — generates SPAYD QR codes as SVG
- **boto3** — Hetzner Object Storage via S3 API
- **babel** — Czech number/date formatting

### 5.2 Template

`backend/app/services/invoicing/templates/invoice.html.j2` — A4 single page, self-hosted Inter + JetBrains Mono fonts via `@font-face` (TTF in `templates/fonts/`), Czech copy throughout (vykání). Layout per the original §5.2 — no changes needed there.

### 5.3 `InvoiceRenderer` service

`backend/app/services/invoicing/renderer.py` — `render_pdf(invoice, lines) -> bytes` and `render_isdoc(invoice, lines) -> bytes`. Determinism: embed all fonts, pin WeasyPrint version, pass fixed `pdf_creation_date`, strip variable metadata. Tests assert byte-stable SHA-256.

### 5.4 `InvoiceStorage` service

`backend/app/services/invoicing/storage.py` — `store_pdf` / `store_isdoc` / `fetch_pdf` / `fetch_isdoc`, hash verified on every read. Object key scheme: `invoices/{year}/{customer_org_id}/{number}.pdf`. Local filesystem fallback under `var/invoices/`. Bucket needs versioning + object-lock (governance, 5 years) when provisioned.

### 5.5 `InvoiceService` (orchestrator)

`backend/app/services/invoicing/service.py`:

```python
class InvoiceService:
    async def issue_for_charge(self, charge: Charge, by_admin_id: uuid.UUID | None = None) -> Invoice:
        """Called by the ComGate webhook handler when a charge transitions to `paid`.
        Idempotent: if an invoice already exists for this charge, returns the existing one."""

    async def issue_manual(self, org_id: uuid.UUID, lines: list[dict], note: str | None,
                           by_admin_id: uuid.UUID, taxable_supply_date: date | None = None,
                           due_at: date | None = None) -> Invoice: ...

    async def mark_paid(self, invoice_id: uuid.UUID, paid_at: datetime | None,
                        by_admin_id: uuid.UUID) -> Invoice: ...

    async def void(self, invoice_id: uuid.UUID, reason: str, by_admin_id: uuid.UUID) -> Invoice: ...

    async def issue_credit_note(self, original_invoice_id: uuid.UUID, lines: list[dict],
                                 reason: str, by_admin_id: uuid.UUID) -> Invoice: ...

    async def send_email(self, invoice_id: uuid.UUID, override_to: str | None = None) -> None: ...

    async def regenerate_pdf(self, invoice_id: uuid.UUID, by_admin_id: uuid.UUID) -> None:
        """Drafts only. Issued invoices are immutable."""
```

Every method writes one or more `InvoiceAuditLog` entries. All money math in minor units with `int` arithmetic — no floats anywhere.

**Webhook integration (commit #6):** `payments.py` webhook handler calls `InvoiceService.issue_for_charge(charge)` after marking the charge `paid`, in the same transaction. Comp orgs are skipped (already filtered upstream). Idempotency: webhook re-fires hit the existing-invoice branch and return without allocating a new number.

**Renewal pre-draft job (commit #7):** APScheduler job runs at 04:00 Europe/Prague: finds active subscriptions with `current_period_ends_at` within 7 days, issues a `draft` invoice queued for super-admin review (does NOT auto-issue or auto-send — operator confirms the draft via UI).

---

## 6. Credit notes (dobropisy / opravné doklady)

Implementation per the original §6: new row with `kind='credit_note'`, `related_invoice_id` set, lines mirror the original with negative quantities (or partial subset). Number from same yearly sequence. PDF header `Opravný daňový doklad` (plátce) or `Dobropis k faktuře` (non-plátce). Original invoice never modified. `issue_credit_note` enforces |credit total| ≤ original total.

---

## 7. Email delivery

Reuse the AWS SES infrastructure (when wired; today email goes through the existing `services/email.py` stub — same path). New module `backend/app/services/invoicing/mailer.py` with `InvoiceMailer.send(invoice, to_email=None)`. PDF attached, ISDOC available on request only. Czech vykání throughout.

---

## 8. API endpoints

All under `/api/v1`. Super-admin only unless noted.

**Customer-facing (org admin role):**
- `GET /organizations/current/invoices` — paginated list (number, kind, status, issued_at, due_at, total_minor, total_with_vat_minor, paid_at)
- `GET /organizations/current/invoices/:id` — full invoice + lines (403 if cross-org)
- `GET /organizations/current/invoices/:id/pdf` — streams PDF, hash-verified

**Super-admin:**
- `GET /admin/invoices` — paginated, filters: `?year=2026&status=issued&org_id=X&kind=invoice&search=…`
- `GET /admin/invoices/:id/pdf` and `/isdoc` — streams with hash verification
- `POST /admin/invoices/draft` — body `{org_id, lines, note?, taxable_supply_date?, due_at?}`
- `POST /admin/invoices/:id/issue` — promotes draft, allocates number, renders + stores
- `POST /admin/invoices/:id/send` — body `{override_email?}`
- `POST /admin/invoices/:id/mark-paid` — body `{paid_at?}`
- `POST /admin/invoices/:id/void` — body `{reason}`
- `POST /admin/invoices/:id/credit-note` — body `{lines, reason}`
- `POST /admin/invoices/:id/regenerate-pdf` — drafts only
- `GET /admin/invoices/audit-log?invoice_id=X`

**Year export:**
- `POST /admin/invoices/export` — body `{year, format: 'csv'|'zip'|'full'}`. Returns job ID.
- `GET /admin/invoices/export/:job_id` — status polling
- `GET /admin/invoices/export/:job_id/download` — streams the artifact

`ExportJob` model: `(id, year, format, status, created_at, completed_at, download_object_key, error_text)`. APScheduler runs the worker; single worker is fine at this volume.

---

## 9. Frontend tasks

Re-read `.claude/skills/ui-design.md` before any UI. **No magenta** on invoicing screens — magenta is reserved for win moments (PAYGATE pricing page, won-deal celebration); financial records are operational density.

F1–F5 unchanged from the original §9. Wire the customer-facing list under `/app/nastaveni/predplatne/faktury`, super-admin browser at `/admin/faktury`, manual-invoice + credit-note builders, year export, integrity dashboard widget.

---

## 10. Special-case handling — checklist

- [ ] **Numbering survives concurrency**: 50 concurrent `issue_for_charge` calls → 50 distinct, gap-free numbers; no collisions, no skips.
- [ ] **Immutability enforced**: raw-SQL UPDATE on an issued invoice raises trigger exception. Status changes (`issued → paid`) work.
- [ ] **Hash mismatch**: corrupted PDF → `IntegrityError`, audit log captures it, super-admin UI red badge.
- [ ] **DPH toggle mid-year**: pre-flip invoices keep `Nejsem plátce DPH`; post-flip include DPH lines; CSV export shows mixed columns.
- [ ] **Credit note math**: 990 Kč original → -990 Kč full credit; partial 3-of-8 users → -371.25 Kč rounded correctly.
- [ ] **PDF determinism**: same invoice rendered twice → identical SHA-256.
- [ ] **Czech diacritics**: `Žďár nad Sázavou s.r.o.` renders without missing-glyph boxes.
- [ ] **Comp orgs don't get invoices**: webhook for a comp org is a no-op on invoicing.
- [ ] **Enterprise pricing**: `override_price_per_user_minor=7900` → line price 79 Kč, not the plan default.
- [ ] **Year boundary**: invoice 2026-12-31 23:59 → `2026-NNNN`; next 2027-01-01 00:01 → `2027-0001`.

---

## 11. Acceptance criteria

1. All migrations run cleanly forward + backward; existing PAYGATE artifacts intact; `Charge` rename does not lose data.
2. Issuing an invoice via `POST /admin/invoices/:id/issue` produces a row with `status='issued'`, a PDF in storage with verified SHA-256, and an `InvoiceAuditLog` entry with `event='issued'`.
3. Customer-facing list at `/app/nastaveni/predplatne/faktury` shows only invoices belonging to that org; cross-org access returns 403.
4. Super-admin list at `/admin/faktury` shows all invoices; non-super-admin gets 403.
5. Year export with `format='full'` for a year with N invoices produces a ZIP containing N PDFs, N ISDOC files, and one manifest.csv whose row count matches N.
6. Sending an invoice produces an `InvoiceAuditLog` row with `event='sent'`, `sent_at` populated, and email lands in the configured destination.
7. Credit note issuance does not modify the original invoice's row; both have distinct numbers from the same yearly sequence.
8. PDF rendering is deterministic: hash assertion in test passes.
9. All money math uses minor-unit integers; no floats in financial paths (`grep 'float(' app/services/invoicing/` returns 0 hits).
10. Czech copy uses vykání; no English strings; no hardcoded `Kč` outside formatter helpers.
11. `pnpm test`, `pytest`, `pnpm lint`, `mypy --strict`, `pnpm typecheck`, `pnpm build` all green.
12. New endpoints have test files with 3+ tests each (happy / validation / permission); concurrency test for sequencing covers the race condition.

---

## 12. Out of scope

- Auto-marking invoices paid by reading bank statements
- Per-org invoice template customization
- Multi-currency invoices (CZK only)
- Foreign-language invoices (Czech only)
- Reverse charge / OSS for EU B2B
- Qualified electronic timestamps (TSA) — hash-only is sufficient
- Direct accounting-software integrations (Pohoda XML push, Money S3 API) — year ZIP + ISDOC is the handover format

---

## 13. Commit plan (sequential)

1. **`feat(invoicing): rename Charge model and add Invoice/InvoiceLine/InvoiceCounter/InvoiceAuditLog with immutability triggers`** — combines the §0 rename and the new tax-invoice models into one cohesive commit. Migration renames `invoices → charges` and creates the four new tables. Tests cover the immutability trigger, the year-sequence allocation under concurrency, and the audit-log INSERT-only constraint.
2. `feat(invoicing): extend BillingSettings with issuer snapshot fields`
3. `feat(invoicing): add InvoiceRenderer with WeasyPrint PDF/A and ISDOC XML output`
4. `feat(invoicing): add InvoiceStorage with Object Storage + local fallback and hash verification`
5. `feat(invoicing): add InvoiceService orchestrator and InvoiceMailer`
6. `feat(invoicing): wire issuance into ComGate webhook charge-paid path`
7. `feat(invoicing): add daily renewal-draft scheduler job`
8. `feat(invoicing): customer-facing invoice list/detail endpoints + UI`
9. `feat(admin): super-admin invoices browser with filters and detail drawer`
10. `feat(admin): manual invoice and credit-note builders`
11. `feat(admin): year export jobs with CSV/ZIP/full packages`
12. `feat(admin): archive integrity dashboard widget and weekly verification job`
13. `test(invoicing): concurrency, determinism, immutability, integrity test suites`
14. `chore(invoicing): docs/invoicing.md operator guide`

---

## 14. Session protocol

- One commit per chat session (initially) — `RESUME.md` written at the end pointing at the next commit and what's needed.
- On resume: read `RESUME.md`, verify state (`alembic upgrade head`, `pytest`, `pnpm build`), delete `RESUME.md`, continue.
- When all 14 commits are landed and `§11` acceptance criteria met, no `RESUME.md` exists.
