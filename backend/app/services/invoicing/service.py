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
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.i18n import language_for_locale
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
    """|credit-note total| (cumulative across all credit notes for the
    original) > original invoice total. Partial credits are allowed;
    full negation is allowed; over-credit is not."""


class InvoiceNotPayableError(InvoiceServiceError):
    """mark_paid called on an invoice that isn't in a payable state
    (draft — never issued, no PDF; voided; or already paid)."""


class InvoiceNotDraftError(InvoiceServiceError):
    """confirm_draft called on an invoice that isn't a draft."""


class InvoiceNotVoidableError(InvoiceServiceError):
    """void called on a paid (reverse via credit note / unmark first)
    or already-voided invoice."""


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

        # A paid renewal charge makes any outstanding renewal DRAFT for
        # this subscription obsolete — the real invoice supersedes the
        # projection. Void it (keeping its consumed number, Fakturoid
        # style) so drafts don't pile up as zombies in /admin/faktury
        # (money-review R4 P2).
        if charge.kind == "renewal" and subscription is not None:
            stale_drafts = (
                (
                    await session.execute(
                        select(Invoice).where(
                            Invoice.subscription_id == subscription.id,
                            Invoice.status == "draft",
                        )
                    )
                )
                .scalars()
                .all()
            )
            for stale in stale_drafts:
                stale.status = "voided"
                session.add(
                    InvoiceAuditLog(
                        invoice_id=stale.id,
                        event="voided",
                        actor_user_id=by_admin_id,
                        payload={"reason": f"superseded by charge {charge.id} auto-issuance"},
                    )
                )

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
        link_subscription: bool = False,
    ) -> Invoice:
        """Founder-driven issuance. Used for refunds, comp-org charges,
        bespoke corrections — anything where the ComGate flow doesn't
        apply.

        When ``link_subscription=True`` and the org has a Subscription row,
        the new invoice is linked to it. ``InvoiceService.mark_paid`` then
        extends the subscription period — the bank-transfer pay-cycle.
        """
        billing = await self._load_billing_settings(session)
        self._require_issuer_configured(billing)

        org = await session.get(Organization, org_id)
        if org is None:
            raise InvoiceServiceError(f"Unknown organization {org_id}")

        subscription: Subscription | None = None
        if link_subscription:
            subscription = (
                await session.execute(
                    select(Subscription).where(Subscription.organization_id == org_id)
                )
            ).scalar_one_or_none()
            if subscription is None:
                raise InvoiceServiceError(
                    f"Cannot link subscription — organization {org_id} has none"
                )

        materialised = [
            self._materialise_line(li, billing, position=i + 1) for i, li in enumerate(lines_in)
        ]

        return await self._issue_internal(
            session,
            organization=org,
            billing=billing,
            lines=materialised,
            charge=None,
            subscription=subscription,
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

        Idempotent on `(subscription_id, status='draft', period start)`
        — re-running the scheduler within the same lead window returns
        the existing row, while a leftover draft from a PREVIOUS period
        no longer suppresses the new period's draft (money-review R4
        P2; the period start is what we stamp as taxable_supply_date).
        """
        projected_start = (
            subscription.current_period_ends_at.date()
            if subscription.current_period_ends_at is not None
            else None
        )
        existing_stmt = select(Invoice).where(
            Invoice.subscription_id == subscription.id,
            Invoice.status == "draft",
        )
        if projected_start is not None:
            existing_stmt = existing_stmt.where(Invoice.taxable_supply_date == projected_start)
        existing = (await session.execute(existing_stmt)).scalars().first()
        if existing is not None:
            return existing

        billing = await self._load_billing_settings(session)
        org = await session.get(Organization, subscription.organization_id)
        if org is None:
            raise InvoiceServiceError(
                f"Subscription {subscription.id} points at missing organization"
            )

        # Project from the NEXT period's plan + seats (queued pending_*
        # values win) so the founder's review draft matches the amount the
        # recurring-charge sweep will actually bill — see
        # billing.next_period_plan_and_seats.
        plan = await session.get(Plan, subscription.pending_plan_id or subscription.plan_id)
        if plan is None or plan.code not in {"monthly", "annual"}:
            raise InvoiceServiceError(f"Subscription {subscription.id} has no renewable plan")

        # Build a synthetic charge-shaped object so the existing
        # line-builder can reuse its logic.
        from app.services import billing as billing_module

        seats = (
            subscription.pending_seat_count
            if subscription.pending_seat_count is not None
            else subscription.seat_count
        )
        unit_price = billing_module.get_effective_price_for_plan(subscription, plan) or 0
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
        # Row lock + in-service status guard (money-review R4 P2): the
        # router's pre-check is read-then-act, so two concurrent
        # mark-paid requests (double-click) could both pass it and
        # extend the subscription twice for one payment. The FOR UPDATE
        # serialises them; the loser re-reads a 'paid' row and errors.
        invoice = (
            await session.execute(select(Invoice).where(Invoice.id == invoice_id).with_for_update())
        ).scalar_one_or_none()
        if invoice is None:
            raise InvoiceServiceError(f"Invoice {invoice_id} not found")
        if invoice.status != "issued":
            # 'draft' has no PDF and was never issued — paying it would
            # jam it forever (the immutability trigger locks pdf_*
            # columns once status leaves 'draft'). 'paid'/'voided' are
            # double-click or misuse.
            raise InvoiceNotPayableError(
                f"Invoice {invoice.number} is {invoice.status!r}; only an "
                "issued invoice can be marked paid"
            )
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

        # Bank-transfer flow: when the founder marks a regular invoice
        # paid AND it's linked to a subscription, advance the subscription
        # period the same way the Comgate webhook would. Skip credit-notes
        # (refunds) and proformas. The billing function decides whether
        # the subscription actually qualifies (comp/canceled → no-op).
        if invoice.kind == "invoice" and invoice.subscription_id is not None:
            from app.services import billing as billing_module

            sub_before = await billing_module.get_current_subscription(
                session, invoice.organization_id
            )
            before = _sub_billing_snapshot(sub_before)
            updated = await billing_module.apply_manual_payment_success(
                session,
                org_id=invoice.organization_id,
                invoice_number=invoice.number,
                paid_at=ts,
            )
            if updated is not None:
                # Full before/after snapshot so `unmark_paid` can revert a
                # mis-click precisely — and refuse when anything moved since.
                session.add(
                    InvoiceAuditLog(
                        invoice_id=invoice.id,
                        event="subscription_extended",
                        actor_user_id=by_admin_id,
                        payload={
                            "period_ends_at": (
                                updated.current_period_ends_at.isoformat()
                                if updated.current_period_ends_at is not None
                                else None
                            ),
                            "status": updated.status,
                            "before": before,
                            "after": _sub_billing_snapshot(updated),
                        },
                    )
                )
                await session.flush()
        return invoice

    async def unmark_paid(
        self,
        session: AsyncSession,
        invoice_id: uuid.UUID,
        *,
        by_admin_id: uuid.UUID,
    ) -> tuple[Invoice, bool]:
        """Revert a mis-clicked mark-paid: paid → issued, document intact,
        fully audit-logged. The escape hatch that lets void-on-paid be
        forbidden (returns policy 2026-08-03: refunds only via dobropis).

        If mark_paid extended the linked subscription, the extension is
        rolled back — but ONLY when the subscription still exactly matches
        the post-extension snapshot (nothing else moved since). Otherwise
        the billing state is left alone and the audit row + return flag
        say so, so the founder corrects the org manually.

        Returns `(invoice, subscription_reverted)`.
        """
        invoice = (
            await session.execute(select(Invoice).where(Invoice.id == invoice_id).with_for_update())
        ).scalar_one_or_none()
        if invoice is None:
            raise InvoiceServiceError(f"Invoice {invoice_id} not found")
        if invoice.status != "paid":
            raise InvoiceNotPayableError(
                f"Invoice {invoice.number} is {invoice.status!r}; only a paid "
                "invoice can be unmarked"
            )

        previous_paid_at = invoice.paid_at
        invoice.status = "issued"
        invoice.paid_at = None

        reverted = False
        extension_recorded = False
        if invoice.kind == "invoice" and invoice.subscription_id is not None:
            extension_row = (
                await session.execute(
                    select(InvoiceAuditLog)
                    .where(
                        InvoiceAuditLog.invoice_id == invoice.id,
                        InvoiceAuditLog.event == "subscription_extended",
                    )
                    .order_by(InvoiceAuditLog.created_at.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            if extension_row is not None:
                extension_recorded = True
                from app.services import billing as billing_module

                before = extension_row.payload.get("before")
                after = extension_row.payload.get("after")
                sub = await billing_module.get_current_subscription(
                    session, invoice.organization_id
                )
                if before and after and _sub_billing_snapshot(sub) == after:
                    _restore_sub_billing_snapshot(sub, before)
                    reverted = True

        session.add(
            InvoiceAuditLog(
                invoice_id=invoice.id,
                event="unmarked_paid",
                actor_user_id=by_admin_id,
                payload={
                    "previous_paid_at": (
                        previous_paid_at.isoformat() if previous_paid_at else None
                    ),
                    "subscription_extension_recorded": extension_recorded,
                    "subscription_reverted": reverted,
                },
            )
        )
        await session.flush()
        return invoice, reverted

    async def void(
        self,
        session: AsyncSession,
        invoice_id: uuid.UUID,
        *,
        reason: str,
        by_admin_id: uuid.UUID,
    ) -> Invoice:
        """Status → voided. The PDF stays in storage (immutability +
        audit trail); customer-facing list shows it strikethrough.

        Paid invoices cannot be voided (returns policy 2026-08-03: money
        that moved is only ever reversed by a dobropis; a mis-clicked
        mark-paid is undone via `unmark_paid` first). Voiding a voided
        invoice is equally rejected."""
        invoice = (
            await session.execute(select(Invoice).where(Invoice.id == invoice_id).with_for_update())
        ).scalar_one_or_none()
        if invoice is None:
            raise InvoiceServiceError(f"Invoice {invoice_id} not found")
        if invoice.status in {"paid", "voided"}:
            raise InvoiceNotVoidableError(
                f"Invoice {invoice.number} is {invoice.status!r}; a paid invoice "
                "is reversed by a credit note (or unmark it first if the payment "
                "flag was a mistake)"
            )
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
        # Cap the CUMULATIVE credit against the original (money-review R4
        # P2): each note alone passing the check would let N sequential
        # full negations manufacture an N× refund paper trail. Voided
        # notes don't count.
        prior_credit_minor = (
            await session.execute(
                select(func.coalesce(func.sum(Invoice.total_minor), 0)).where(
                    Invoice.related_invoice_id == original.id,
                    Invoice.kind == "credit_note",
                    Invoice.status != "voided",
                )
            )
        ).scalar_one()
        credit_total_minor = sum(line.line_total_minor for line in materialised)
        if abs(credit_total_minor) + abs(prior_credit_minor) > abs(original.total_minor):
            raise CreditNoteExceedsOriginalError(
                f"Credit total {credit_total_minor} plus prior credits "
                f"{prior_credit_minor} exceeds original {original.total_minor}"
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
        if not billing.seller_ico:
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

        # `charge.amount_minor` is the GROSS the customer already paid via
        # ComGate — VAT is NOT added on top of it (review R2 P1). When the
        # seller is a VAT payer we back-calculate the net base and VAT out of
        # that gross so the invoice total equals the money collected; adding
        # VAT on top would overstate the total by the VAT rate. When not a VAT
        # payer, net == gross and VAT == 0 (unchanged behaviour).
        gross = charge.amount_minor
        rate = billing.vat_rate_percent if billing.is_vat_payer else Decimal("0.00")
        if billing.is_vat_payer and rate > 0:
            net_base = int(
                (Decimal(gross) / (Decimal(1) + rate / Decimal(100))).to_integral_value()
            )
        else:
            net_base = gross
        vat = gross - net_base
        # Quantity 1, not `seats` (money-review R4 P3). Per-seat unit price
        # floors — 10 000 / 3 = 3 333 — so a multi-seat line printed
        # qty × unit ≠ subtotal, which is the first thing an accountant
        # queries. The seat count is already spelled out in `description`,
        # so nothing is lost by billing the period as one item.
        return [
            InvoiceLine(
                position=1,
                description=description,
                quantity=Decimal(1),
                unit_label="období",
                unit_price_minor=net_base,
                vat_rate_percent=rate,
                line_subtotal_minor=net_base,
                line_vat_minor=vat,
                line_total_minor=gross,
            )
        ]

    @staticmethod
    def _materialise_line(
        line_in: ManualLineIn, billing: BillingSettings, *, position: int
    ) -> InvoiceLine:
        # A neplátce never invoices VAT: clamp the rate so a stray
        # per-line override can't stamp a rate onto a zero-VAT line.
        if not billing.is_vat_payer:
            rate = Decimal("0.00")
        elif line_in.vat_rate_percent is not None:
            rate = line_in.vat_rate_percent
        else:
            rate = billing.vat_rate_percent
        # Money math in minor units only; banker's rounding to match
        # _build_lines_for_charge (int() truncation biased toward zero).
        subtotal = int((line_in.quantity * Decimal(line_in.unit_price_minor)).to_integral_value())
        vat = (
            int((Decimal(subtotal) * rate / Decimal(100)).to_integral_value())
            if billing.is_vat_payer
            else 0
        )
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
            issuer_dic=billing.seller_dic,
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

        session.add(
            InvoiceAuditLog(
                invoice_id=invoice.id,
                event="allocated",
                actor_user_id=by_admin_id,
                payload={"number": number, "year": year},
            )
        )
        await self._render_store_and_flip(
            session,
            invoice=invoice,
            lines=lines,
            organization=organization,
            by_admin_id=by_admin_id,
        )
        return invoice

    async def _render_store_and_flip(
        self,
        session: AsyncSession,
        *,
        invoice: Invoice,
        lines: list[InvoiceLine],
        organization: Organization,
        by_admin_id: uuid.UUID | None,
    ) -> None:
        """Render PDF (+ ISDOC for CZK), store, write storage refs, flip
        to 'issued', and audit. Shared by `_issue_internal` and
        `confirm_draft`. MUST run while status is still 'draft' — the
        immutability trigger blocks UPDATE of pdf_*/isdoc_* columns once
        status leaves 'draft' (same UPDATE, same transaction is fine)."""
        pdf_bytes = self._renderer.render_pdf(
            invoice, lines, lang=language_for_locale(organization.locale)
        )
        pdf_result = self._storage.store_pdf(invoice, pdf_bytes)
        invoice.pdf_object_key = pdf_result.object_key
        invoice.pdf_sha256 = pdf_result.sha256
        invoice.pdf_size_bytes = pdf_result.size_bytes

        # ISDOC is a Czech accounting-interchange artifact — attach it only to
        # CZK invoices.
        if invoice.currency == "CZK":
            isdoc_bytes = self._renderer.render_isdoc(invoice, lines)
            isdoc_result = self._storage.store_isdoc(invoice, isdoc_bytes)
            invoice.isdoc_object_key = isdoc_result.object_key
            invoice.isdoc_sha256 = isdoc_result.sha256
        invoice.status = "issued"

        for event, payload in (
            ("pdf_stored", {"sha256": pdf_result.sha256, "size_bytes": pdf_result.size_bytes}),
            (
                "issued",
                {"total_minor": invoice.total_minor, "currency": invoice.currency},
            ),
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

    async def confirm_draft(
        self,
        session: AsyncSession,
        invoice_id: uuid.UUID,
        *,
        by_admin_id: uuid.UUID,
    ) -> Invoice:
        """Draft → issued: the missing exit of the renewal-draft pipeline
        (money-review R4 P2). Re-validates + re-snapshots the ISSUER
        identity from BillingSettings (drafts skip issuer validation, so
        the draft-time snapshot may be empty), refreshes `issued_at` and
        `due_at` to confirmation time, renders + stores the PDF/ISDOC,
        and flips to 'issued'. Amounts stay as drafted — if the VAT
        situation changed since, void the draft and issue manually."""
        invoice = (
            await session.execute(select(Invoice).where(Invoice.id == invoice_id).with_for_update())
        ).scalar_one_or_none()
        if invoice is None:
            raise InvoiceServiceError(f"Invoice {invoice_id} not found")
        if invoice.status != "draft":
            raise InvoiceNotDraftError(
                f"Invoice {invoice.number} is {invoice.status!r}; only drafts can be confirmed"
            )

        billing = await self._load_billing_settings(session)
        self._require_issuer_configured(billing)
        org = await session.get(Organization, invoice.organization_id)
        if org is None:
            raise InvoiceServiceError(
                f"Invoice {invoice.id} points at missing organization {invoice.organization_id}"
            )

        now = datetime.now(tz=UTC)
        invoice.issued_at = now
        invoice.due_at = now.date() + timedelta(days=billing.default_payment_term_days)
        invoice.issuer_name = billing.issuer_name
        invoice.issuer_address = "\n".join(
            part
            for part in (
                billing.issuer_address_street,
                f"{billing.issuer_address_zip} {billing.issuer_address_city}".strip(),
            )
            if part
        )
        invoice.issuer_ico = billing.seller_ico or ""
        invoice.issuer_dic = billing.seller_dic
        invoice.issuer_iban = billing.seller_iban or ""
        invoice.issuer_account_domestic = billing.issuer_account_domestic
        invoice.issuer_register_text = billing.issuer_register_text

        lines = (
            (
                await session.execute(
                    select(InvoiceLine)
                    .where(InvoiceLine.invoice_id == invoice.id)
                    .order_by(InvoiceLine.position)
                )
            )
            .scalars()
            .all()
        )
        await self._render_store_and_flip(
            session,
            invoice=invoice,
            lines=list(lines),
            organization=org,
            by_admin_id=by_admin_id,
        )
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


_SUB_BILLING_SNAPSHOT_FIELDS = (
    "status",
    "current_period_starts_at",
    "current_period_ends_at",
    "next_renewal_charge_at",
    "canceled_at",
    "dunning_attempts",
    "last_charge_failed_at",
)


def _sub_billing_snapshot(sub: Subscription) -> dict[str, str | int | None]:
    """JSON-safe snapshot of every Subscription field that
    `apply_manual_payment_success` mutates — recorded before/after in the
    `subscription_extended` audit payload so `unmark_paid` can revert a
    mis-click exactly (or detect drift and refuse)."""
    out: dict[str, str | int | None] = {}
    for field in _SUB_BILLING_SNAPSHOT_FIELDS:
        value = getattr(sub, field)
        out[field] = value.isoformat() if isinstance(value, datetime) else value
    return out


_SUB_DATETIME_FIELDS = frozenset(_SUB_BILLING_SNAPSHOT_FIELDS) - {"status", "dunning_attempts"}


def _restore_sub_billing_snapshot(sub: Subscription, snapshot: dict[str, Any]) -> None:
    """Inverse of `_sub_billing_snapshot`."""
    for field in _SUB_BILLING_SNAPSHOT_FIELDS:
        value = snapshot.get(field)
        if field in _SUB_DATETIME_FIELDS and isinstance(value, str):
            setattr(sub, field, datetime.fromisoformat(value))
        else:
            setattr(sub, field, value)


def _advance_period(end: datetime | None, plan_code: str) -> datetime | None:
    """Project the next billing period's end from the current one.
    Returns None if `end` is None (e.g. comp / fresh-trial subscriptions
    without a period anchor). Calendar months via billing._add_months so
    the draft's period label matches what apply_renewal_success will
    actually set (365/30-day arithmetic drifted a few days)."""
    if end is None:
        return None
    from app.services.billing import _add_months

    return _add_months(end, 12 if plan_code == "annual" else 1)


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
