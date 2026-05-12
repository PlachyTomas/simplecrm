"""Tax-invoice orchestrator.

Owns the lifecycle of a tax-invoice document: issuance from a paid
ComGate charge, manual issuance from the super-admin UI, marking as
paid, voiding, credit notes. Every state transition writes one or
more `InvoiceAuditLog` rows so the founder + accountant have a clear
forensic trail.

**Issuance flow** (`issue_for_charge`):

  1. Idempotency: if an Invoice row already exists for this charge,
     return it. ComGate webhooks can re-fire and we don't want a fresh
     number allocated each time.
  2. Validate `BillingSettings` issuer fields are non-empty (the
     founder must have configured their own IČO, address, register
     text via the super-admin UI). Otherwise raise
     `InvoiceIssuerNotConfiguredError`.
  3. Snapshot issuer + customer.
  4. Allocate the next number via `numbering.allocate_invoice_number`
     (advisory-locked per year).
  5. Build the line items from the charge's kind + period.
  6. Create the `Invoice` row in `status='draft'`.
  7. Render PDF + ISDOC via `InvoiceRenderer`.
  8. Store both via `InvoiceStorage`.
  9. Set `pdf_*`/`isdoc_*` columns on the row, flip `status='issued'`.
     This step ordering matters: the immutability trigger blocks
     UPDATE on guarded columns once `status != 'draft'`. We must write
     storage references BEFORE the status flip — same UPDATE, same
     transaction.
 10. Write audit log entries: `allocated`, `issued`, `pdf_stored`.

Caller commits the transaction. On rollback the consumed sequence number
rolls back with the row, so we don't leak gaps.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    BillingSettings,
    Charge,
    Invoice,
    InvoiceAuditLog,
    InvoiceLine,
    Organization,
    Plan,
    Subscription,
)
from app.services.invoicing.numbering import allocate_invoice_number
from app.services.invoicing.renderer import InvoiceRenderer
from app.services.invoicing.storage import InvoiceStorage

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Errors
# --------------------------------------------------------------------------- #


class InvoiceServiceError(Exception):
    """Base for orchestrator-level failures."""


class InvoiceIssuerNotConfiguredError(InvoiceServiceError):
    """`BillingSettings.issuer_*` columns are still at their empty
    defaults. The founder must fill them in via the super-admin UI
    before the first invoice is issued."""


class CreditNoteExceedsOriginalError(InvoiceServiceError):
    """|credit-note total| > original invoice total. Partial credits
    are allowed; full negation is allowed; over-credit is not."""


# --------------------------------------------------------------------------- #
# Inputs
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class ManualLineIn:
    """Caller-supplied line for `issue_manual` and `issue_credit_note`.
    The orchestrator computes `line_subtotal_minor`, `line_vat_minor`,
    and `line_total_minor` from these primitives + the issuer's DPH state."""

    description: str
    quantity: Decimal
    unit_price_minor: int
    unit_label: str | None = None
    # Override the VAT rate per line (e.g. 0% for some services). When
    # None, the issuer's default rate from BillingSettings is used.
    vat_rate_percent: Decimal | None = None


# --------------------------------------------------------------------------- #
# Service
# --------------------------------------------------------------------------- #


class InvoiceService:
    """Stateless orchestrator. Construct per-request or reuse."""

    def __init__(
        self,
        renderer: InvoiceRenderer | None = None,
        storage: InvoiceStorage | None = None,
    ) -> None:
        self._renderer = renderer or InvoiceRenderer()
        self._storage = storage or InvoiceStorage()

    # ------------------------- automatic issuance ------------------------ #

    async def issue_for_charge(
        self,
        session: AsyncSession,
        charge: Charge,
        *,
        by_admin_id: uuid.UUID | None = None,
    ) -> Invoice:
        """Issue an invoice off a paid ComGate charge.

        Idempotent — if an invoice already exists for this charge, returns
        the existing row without re-rendering. The webhook handler in
        commit #6 calls this from the same transaction that flips the
        charge's status to `paid`.
        """
        # Idempotency check first — webhook may re-fire.
        existing = await session.execute(
            select(Invoice).where(Invoice.charge_id == charge.id).limit(1)
        )
        prior = existing.scalar_one_or_none()
        if prior is not None:
            return prior

        billing = await self._load_billing_settings(session)
        self._require_issuer_configured(billing)

        org = await session.get(Organization, charge.organization_id)
        if org is None:
            raise InvoiceServiceError(
                f"Charge {charge.id} points at missing organization {charge.organization_id}"
            )

        subscription, plan = await self._load_sub_and_plan(session, charge.organization_id)
        lines = self._build_lines_for_charge(charge, plan, billing)

        return await self._issue_internal(
            session,
            organization=org,
            billing=billing,
            lines=lines,
            charge=charge,
            subscription=subscription,
            note=None,
            taxable_supply_date=None,
            due_at=None,
            by_admin_id=by_admin_id,
        )

    # ------------------------- manual issuance --------------------------- #

    async def issue_manual(
        self,
        session: AsyncSession,
        *,
        org_id: uuid.UUID,
        lines_in: list[ManualLineIn],
        note: str | None,
        by_admin_id: uuid.UUID,
        taxable_supply_date: date | None = None,
        due_at: date | None = None,
    ) -> Invoice:
        """Founder-driven issuance. Used for refunds, comp-org charges,
        bespoke corrections — anything where the ComGate flow doesn't
        apply."""
        billing = await self._load_billing_settings(session)
        self._require_issuer_configured(billing)

        org = await session.get(Organization, org_id)
        if org is None:
            raise InvoiceServiceError(f"Unknown organization {org_id}")

        materialised = [
            self._materialise_line(li, billing, position=i + 1) for i, li in enumerate(lines_in)
        ]

        return await self._issue_internal(
            session,
            organization=org,
            billing=billing,
            lines=materialised,
            charge=None,
            subscription=None,
            note=note,
            taxable_supply_date=taxable_supply_date,
            due_at=due_at,
            by_admin_id=by_admin_id,
        )

    # ------------------------- renewal drafts ---------------------------- #

    async def prepare_renewal_draft(
        self,
        session: AsyncSession,
        *,
        subscription: Subscription,
    ) -> Invoice:
        """Build a `status='draft'` Invoice projecting the next-period
        charge for `subscription`. Used by the daily scheduler job so
        the founder can eyeball upcoming invoices before the renewal
        charge fires the next day.

        Drafts deliberately don't validate issuer fields (the founder
        may not have filled them in yet) and don't render or store
        PDFs. They DO consume a real sequence number from the yearly
        counter — matches Fakturoid; voiding a draft just leaves a
        consumed number per §3 of INVOICES_TASK.md.

        Idempotent on `(subscription_id, status='draft')` — re-running
        the scheduler returns the existing row.
        """
        existing = (
            (
                await session.execute(
                    select(Invoice).where(
                        Invoice.subscription_id == subscription.id,
                        Invoice.status == "draft",
                    )
                )
            )
            .scalars()
            .first()
        )
        if existing is not None:
            return existing

        billing = await self._load_billing_settings(session)
        org = await session.get(Organization, subscription.organization_id)
        if org is None:
            raise InvoiceServiceError(
                f"Subscription {subscription.id} points at missing organization"
            )

        plan = await session.get(Plan, subscription.plan_id)
        if plan is None or plan.code not in {"monthly", "annual"}:
            raise InvoiceServiceError(f"Subscription {subscription.id} has no renewable plan")

        # Build a synthetic charge-shaped object so the existing
        # line-builder can reuse its logic.
        from app.services import billing as billing_module

        seats = subscription.seat_count
        unit_price = billing_module.get_effective_price_per_user_minor(subscription) or 0
        total = unit_price * seats

        synthetic = Charge(
            id=uuid.uuid4(),
            organization_id=org.id,
            kind="renewal",
            amount_minor=total,
            currency="CZK",
            status="pending",
            seats=seats,
            period_starts_at=subscription.current_period_ends_at,
            period_ends_at=_advance_period(subscription.current_period_ends_at, plan.code),
        )
        lines = self._build_lines_for_charge(synthetic, plan, billing)

        return await self._issue_internal(
            session,
            organization=org,
            billing=billing,
            lines=lines,
            charge=None,
            subscription=subscription,
            note=None,
            taxable_supply_date=(
                synthetic.period_starts_at.date() if synthetic.period_starts_at else None
            ),
            due_at=None,
            by_admin_id=None,
            kind="invoice",
            related_invoice_id=None,
            stop_at_draft=True,
        )

    # ------------------------- state transitions ------------------------- #

    async def mark_paid(
        self,
        session: AsyncSession,
        invoice_id: uuid.UUID,
        *,
        paid_at: datetime | None,
        by_admin_id: uuid.UUID | None = None,
    ) -> Invoice:
        invoice = await self._get_or_404(session, invoice_id)
        ts = paid_at or datetime.now(tz=UTC)
        invoice.status = "paid"
        invoice.paid_at = ts
        session.add(
            InvoiceAuditLog(
                invoice_id=invoice.id,
                event="paid",
                actor_user_id=by_admin_id,
                payload={"paid_at": ts.isoformat()},
            )
        )
        await session.flush()
        return invoice

    async def void(
        self,
        session: AsyncSession,
        invoice_id: uuid.UUID,
        *,
        reason: str,
        by_admin_id: uuid.UUID,
    ) -> Invoice:
        """Status → voided. The PDF stays in storage (immutability +
        audit trail); customer-facing list shows it strikethrough."""
        invoice = await self._get_or_404(session, invoice_id)
        invoice.status = "voided"
        session.add(
            InvoiceAuditLog(
                invoice_id=invoice.id,
                event="voided",
                actor_user_id=by_admin_id,
                payload={"reason": reason},
            )
        )
        await session.flush()
        return invoice

    async def issue_credit_note(
        self,
        session: AsyncSession,
        *,
        original_invoice_id: uuid.UUID,
        lines_in: list[ManualLineIn],
        reason: str,
        by_admin_id: uuid.UUID,
    ) -> Invoice:
        """Issue a `kind='credit_note'` invoice referencing the original.

        Quantities in `lines_in` should be NEGATIVE (or partial-negative)
        — full negation reverses the original; partial credits subset.
        Enforces |credit total| ≤ |original total| so credits can't
        manufacture a refund larger than the underlying invoice.
        """
        original = await self._get_or_404(session, original_invoice_id)

        billing = await self._load_billing_settings(session)
        self._require_issuer_configured(billing)
        org = await session.get(Organization, original.organization_id)
        if org is None:
            raise InvoiceServiceError(
                f"Original invoice points at missing organization {original.organization_id}"
            )

        materialised = [
            self._materialise_line(li, billing, position=i + 1) for i, li in enumerate(lines_in)
        ]
        # Sum the materialised lines to a credit total in minor units.
        credit_total_minor = sum(line.line_total_minor for line in materialised)
        if abs(credit_total_minor) > abs(original.total_minor):
            raise CreditNoteExceedsOriginalError(
                f"Credit total {credit_total_minor} exceeds original {original.total_minor}"
            )

        return await self._issue_internal(
            session,
            organization=org,
            billing=billing,
            lines=materialised,
            charge=None,
            subscription=None,
            note=f"Dobropis k faktuře {original.number}: {reason}",
            taxable_supply_date=None,
            due_at=None,
            by_admin_id=by_admin_id,
            kind="credit_note",
            related_invoice_id=original.id,
        )

    # ------------------------- internals --------------------------------- #

    async def _load_billing_settings(self, session: AsyncSession) -> BillingSettings:
        return (await session.execute(select(BillingSettings))).scalar_one()

    @staticmethod
    def _require_issuer_configured(billing: BillingSettings) -> None:
        missing = []
        if not billing.issuer_name:
            missing.append("issuer_name")
        if not billing.issuer_address_street:
            missing.append("issuer_address_street")
        if not billing.issuer_ico if hasattr(billing, "issuer_ico") else not billing.seller_ico:
            missing.append("seller_ico")
        if not billing.seller_iban:
            missing.append("seller_iban")
        if missing:
            raise InvoiceIssuerNotConfiguredError(
                "Cannot issue invoice — BillingSettings is missing: " + ", ".join(missing)
            )

    async def _load_sub_and_plan(
        self, session: AsyncSession, org_id: uuid.UUID
    ) -> tuple[Subscription | None, Plan | None]:
        sub = (
            await session.execute(
                select(Subscription).where(Subscription.organization_id == org_id)
            )
        ).scalar_one_or_none()
        if sub is None:
            return None, None
        plan = await session.get(Plan, sub.plan_id)
        return sub, plan

    def _build_lines_for_charge(
        self,
        charge: Charge,
        plan: Plan | None,
        billing: BillingSettings,
    ) -> list[InvoiceLine]:
        """One Czech-language line per charge. Quantity = seat count;
        unit price = charge.amount_minor // seats (defends against zero
        seats if the column is malformed)."""
        seats = charge.seats or 1
        unit_price_minor = charge.amount_minor // max(seats, 1)
        plan_label = plan.display_name_cs if plan else charge.kind
        period_str = ""
        if charge.period_starts_at and charge.period_ends_at:
            period_str = (
                f", období {charge.period_starts_at.date().isoformat()} – "
                f"{charge.period_ends_at.date().isoformat()}"
            )

        if charge.kind == "seat_upgrade":
            description = f"SimpleCRM, navýšení o {seats} {_user_word(seats)}{period_str}"
        else:
            description = f"SimpleCRM, plán {plan_label}, {seats} {_user_word(seats)}{period_str}"

        line_in = ManualLineIn(
            description=description,
            quantity=Decimal(seats),
            unit_price_minor=unit_price_minor,
            unit_label="uživatel",
            vat_rate_percent=None,  # use BillingSettings default
        )
        return [self._materialise_line(line_in, billing, position=1)]

    @staticmethod
    def _materialise_line(
        line_in: ManualLineIn, billing: BillingSettings, *, position: int
    ) -> InvoiceLine:
        rate = (
            line_in.vat_rate_percent
            if line_in.vat_rate_percent is not None
            else (billing.vat_rate_percent if billing.is_vat_payer else Decimal("0.00"))
        )
        # Money math in minor units only.
        subtotal = int(line_in.quantity * Decimal(line_in.unit_price_minor))
        vat = int(Decimal(subtotal) * rate / Decimal(100)) if billing.is_vat_payer else 0
        return InvoiceLine(
            position=position,
            description=line_in.description,
            quantity=line_in.quantity,
            unit_label=line_in.unit_label,
            unit_price_minor=line_in.unit_price_minor,
            vat_rate_percent=rate,
            line_subtotal_minor=subtotal,
            line_vat_minor=vat,
            line_total_minor=subtotal + vat,
        )

    async def _issue_internal(
        self,
        session: AsyncSession,
        *,
        organization: Organization,
        billing: BillingSettings,
        lines: list[InvoiceLine],
        charge: Charge | None,
        subscription: Subscription | None,
        note: str | None,
        taxable_supply_date: date | None,
        due_at: date | None,
        by_admin_id: uuid.UUID | None,
        kind: str = "invoice",
        related_invoice_id: uuid.UUID | None = None,
        stop_at_draft: bool = False,
    ) -> Invoice:
        now = datetime.now(tz=UTC)
        year = now.year
        seq, number, vs = await allocate_invoice_number(session, year)

        currency = "CZK"
        subtotal = sum(line.line_subtotal_minor for line in lines)
        vat_total = sum(line.line_vat_minor for line in lines)
        total = subtotal + vat_total

        issued_at = now
        tsd = taxable_supply_date or now.date()
        due = due_at or (now.date() + timedelta(days=billing.default_payment_term_days))

        issuer_address = "\n".join(
            part
            for part in (
                billing.issuer_address_street,
                f"{billing.issuer_address_zip} {billing.issuer_address_city}".strip(),
            )
            if part
        )
        # Snapshot the customer billing address from the org's structured
        # fields (populated via ARES autofill or the Settings → Organizace
        # form). Empty when the founder hasn't filled in the form yet —
        # the invoice still renders, but with a blank address, which is
        # the correct signal to the customer to complete their billing
        # details (rather than the org name appearing where the address
        # should be, as it did before the Settings form landed).
        zip_city = f"{organization.address_zip or ''} {organization.address_city or ''}".strip()
        customer_address_parts = [organization.address_street, zip_city]
        customer_address = "\n".join(p for p in customer_address_parts if p)
        # Distinct legal name override for invoices. Falls back to the org
        # display name when unset — so existing orgs (no billing_name set)
        # keep producing identical invoices to before.
        customer_invoice_name = organization.billing_name or organization.name

        invoice = Invoice(
            organization_id=organization.id,
            subscription_id=subscription.id if subscription else None,
            charge_id=charge.id if charge else None,
            number=number,
            year=year,
            sequence_in_year=seq,
            variable_symbol=vs,
            status="draft",
            kind=kind,
            related_invoice_id=related_invoice_id,
            issued_at=issued_at,
            taxable_supply_date=tsd,
            due_at=due,
            issuer_name=billing.issuer_name,
            issuer_address=issuer_address,
            issuer_ico=billing.seller_ico or "",
            issuer_dic=None,  # set later when seller becomes plátce
            issuer_iban=billing.seller_iban or "",
            issuer_account_domestic=billing.issuer_account_domestic,
            issuer_register_text=billing.issuer_register_text,
            issuer_is_vat_payer=billing.is_vat_payer,
            customer_name=customer_invoice_name,
            customer_address=customer_address,
            customer_ico=organization.ico,
            customer_dic=organization.dic,
            customer_email=organization.billing_email,
            currency=currency,
            subtotal_minor=subtotal,
            vat_amount_minor=vat_total,
            total_minor=total,
            vat_rate_percent=billing.vat_rate_percent if billing.is_vat_payer else Decimal("0.00"),
            note=note,
            payment_method="bank_transfer",
        )
        session.add(invoice)
        await session.flush()  # populate invoice.id so lines can FK it

        for line in lines:
            line.invoice_id = invoice.id
            session.add(line)

        await session.flush()

        if stop_at_draft:
            # Renewal-draft path: don't render, don't store, don't flip
            # to 'issued'. Drafts wait in the super-admin UI for the
            # founder to confirm. Audit-log just `allocated`.
            session.add(
                InvoiceAuditLog(
                    invoice_id=invoice.id,
                    event="allocated",
                    actor_user_id=by_admin_id,
                    payload={"number": number, "year": year, "kind": "draft"},
                )
            )
            await session.flush()
            return invoice

        # Render + store BEFORE flipping status, because the immutability
        # trigger blocks UPDATE of pdf_*/isdoc_* columns once status leaves
        # 'draft'.
        pdf_bytes = self._renderer.render_pdf(invoice, lines)
        isdoc_bytes = self._renderer.render_isdoc(invoice, lines)
        pdf_result = self._storage.store_pdf(invoice, pdf_bytes)
        isdoc_result = self._storage.store_isdoc(invoice, isdoc_bytes)

        invoice.pdf_object_key = pdf_result.object_key
        invoice.pdf_sha256 = pdf_result.sha256
        invoice.pdf_size_bytes = pdf_result.size_bytes
        invoice.isdoc_object_key = isdoc_result.object_key
        invoice.isdoc_sha256 = isdoc_result.sha256
        invoice.status = "issued"

        # Audit trail. Three rows for the issuance flow; mark_paid /
        # void / send add their own later.
        for event, payload in (
            ("allocated", {"number": number, "year": year}),
            ("pdf_stored", {"sha256": pdf_result.sha256, "size_bytes": pdf_result.size_bytes}),
            ("issued", {"total_minor": total, "currency": currency}),
        ):
            session.add(
                InvoiceAuditLog(
                    invoice_id=invoice.id,
                    event=event,
                    actor_user_id=by_admin_id,
                    payload=payload,
                )
            )
        await session.flush()
        return invoice

    @staticmethod
    async def _get_or_404(session: AsyncSession, invoice_id: uuid.UUID) -> Invoice:
        invoice = await session.get(Invoice, invoice_id)
        if invoice is None:
            raise InvoiceServiceError(f"Invoice {invoice_id} not found")
        return invoice


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _advance_period(end: datetime | None, plan_code: str) -> datetime | None:
    """Project the next billing period's end from the current one.
    Returns None if `end` is None (e.g. comp / fresh-trial subscriptions
    without a period anchor)."""
    if end is None:
        return None
    if plan_code == "annual":
        return end + timedelta(days=365)
    return end + timedelta(days=30)


def _user_word(n: int) -> str:
    """Czech declension for `uživatel` based on count.

    1 → uživatel; 2-4 → uživatelé; 0, 5+ → uživatelů.
    """
    if n == 1:
        return "uživatel"
    if 2 <= n <= 4:
        return "uživatelé"
    return "uživatelů"


__all__ = [
    "CreditNoteExceedsOriginalError",
    "InvoiceIssuerNotConfiguredError",
    "InvoiceService",
    "InvoiceServiceError",
    "ManualLineIn",
]
