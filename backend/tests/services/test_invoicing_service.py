"""InvoiceService orchestrator tests.

Exercises the full issuance flow against the dev DB (real Postgres,
real renderer, real local-fallback storage). The mailer is also wired
to confirm the audit-log + sent_at column updates land.

Each test seeds a fresh org + BillingSettings configuration to avoid
order-dependence on the shared singleton row.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.models import (
    BillingSettings,
    Charge,
    Invoice,
    InvoiceAuditLog,
    InvoiceLine,
    Organization,
    Subscription,
)
from app.db.session import AsyncSessionLocal
from app.services.invoicing.mailer import InvoiceMailer
from app.services.invoicing.service import (
    CreditNoteExceedsOriginalError,
    InvoiceIssuerNotConfiguredError,
    InvoiceService,
    ManualLineIn,
)
from app.services.invoicing.storage import InvoiceStorage

# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


async def _configure_issuer(session: AsyncSession) -> None:
    """Force the singleton BillingSettings to a known fully-configured
    state so issuance doesn't fail on missing-issuer validation."""
    await session.execute(
        update(BillingSettings).values(
            seller_iban="CZ6508000000192000145399",
            seller_ico="12345678",
            issuer_name="Tomáš Test OSVČ",
            issuer_address_street="Testovací 1",
            issuer_address_city="Praha",
            issuer_address_zip="100 00",
            issuer_register_text="Zapsán v živnostenském rejstříku",
        )
    )
    await session.commit()


async def _bare_issuer(session: AsyncSession) -> None:
    """Wipe the issuer fields so issuance fails on validation."""
    await session.execute(
        update(BillingSettings).values(
            seller_iban=None,
            seller_ico=None,
            issuer_name="",
            issuer_address_street="",
            issuer_address_city="",
            issuer_address_zip="",
            issuer_register_text="",
        )
    )
    await session.commit()


async def _make_org_and_charge(session: AsyncSession) -> tuple[Organization, Charge]:
    org = Organization(name=f"InvSvc-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.flush()
    charge = Charge(
        organization_id=org.id,
        kind="initial",
        amount_minor=99_900,
        currency="CZK",
        status="paid",
        seats=1,
        period_starts_at=datetime(2026, 5, 9, tzinfo=UTC),
        period_ends_at=datetime(2027, 5, 9, tzinfo=UTC),
        paid_at=datetime.now(tz=UTC),
    )
    session.add(charge)
    await session.commit()
    return org, charge


@pytest.fixture
async def cleanup_orgs() -> list[uuid.UUID]:
    ids: list[uuid.UUID] = []
    try:
        yield ids
    finally:
        if ids:
            await _teardown(ids)


async def _teardown(ids: list[uuid.UUID]) -> None:
    from sqlalchemy import text

    async with AsyncSessionLocal() as s:
        # Audit log triggers reject DELETE; disable + re-enable.
        await s.execute(
            text("ALTER TABLE invoice_audit_log DISABLE TRIGGER trg_invoice_audit_log_no_delete")
        )
        await s.execute(
            delete(InvoiceAuditLog).where(
                InvoiceAuditLog.invoice_id.in_(
                    select(Invoice.id).where(Invoice.organization_id.in_(ids))
                )
            )
        )
        await s.execute(
            text("ALTER TABLE invoice_audit_log ENABLE TRIGGER trg_invoice_audit_log_no_delete")
        )
        await s.execute(
            delete(InvoiceLine).where(
                InvoiceLine.invoice_id.in_(
                    select(Invoice.id).where(Invoice.organization_id.in_(ids))
                )
            )
        )
        await s.execute(delete(Invoice).where(Invoice.organization_id.in_(ids)))
        await s.execute(delete(Charge).where(Charge.organization_id.in_(ids)))
        await s.execute(delete(Subscription).where(Subscription.organization_id.in_(ids)))
        await s.execute(delete(Organization).where(Organization.id.in_(ids)))
        await s.commit()


def _local_storage(tmp_path: Path) -> InvoiceStorage:
    """Force the storage layer to the local filesystem under `tmp_path`
    so issuance writes don't pollute `var/invoices/` or attempt to
    contact a real S3 bucket."""
    return InvoiceStorage(
        Settings(
            s3_endpoint_url="",
            s3_bucket_invoices="",
            invoice_storage_local_root=str(tmp_path / "invoices"),
        )
    )


# --------------------------------------------------------------------------- #
# Validation
# --------------------------------------------------------------------------- #


async def test_issue_for_charge_rejects_when_issuer_not_configured(
    cleanup_orgs: list[uuid.UUID], tmp_path: Path
) -> None:
    async with AsyncSessionLocal() as s:
        await _bare_issuer(s)

    async with AsyncSessionLocal() as s:
        org, charge = await _make_org_and_charge(s)
        cleanup_orgs.append(org.id)

    async with AsyncSessionLocal() as s:
        svc = InvoiceService(storage=_local_storage(tmp_path))
        with pytest.raises(InvoiceIssuerNotConfiguredError):
            await svc.issue_for_charge(s, charge)


# --------------------------------------------------------------------------- #
# Happy path
# --------------------------------------------------------------------------- #


async def test_issue_for_charge_creates_issued_invoice_with_audit_trail(
    cleanup_orgs: list[uuid.UUID], tmp_path: Path
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, charge = await _make_org_and_charge(s)
        cleanup_orgs.append(org.id)

    async with AsyncSessionLocal() as s:
        svc = InvoiceService(storage=_local_storage(tmp_path))
        invoice = await svc.issue_for_charge(s, charge)
        await s.commit()

    async with AsyncSessionLocal() as s:
        loaded = await s.get(Invoice, invoice.id)
        assert loaded is not None
        assert loaded.status == "issued"
        assert loaded.kind == "invoice"
        assert loaded.charge_id == charge.id
        assert loaded.pdf_object_key is not None
        assert loaded.pdf_sha256 is not None
        assert loaded.isdoc_object_key is not None
        assert loaded.total_minor == charge.amount_minor

        events = (
            (
                await s.execute(
                    select(InvoiceAuditLog.event)
                    .where(InvoiceAuditLog.invoice_id == loaded.id)
                    .order_by(InvoiceAuditLog.created_at)
                )
            )
            .scalars()
            .all()
        )
        # `allocated`, `pdf_stored`, `issued` — the standard issuance trio.
        assert set(events) >= {"allocated", "pdf_stored", "issued"}


async def test_issue_for_charge_is_idempotent_on_webhook_replay(
    cleanup_orgs: list[uuid.UUID], tmp_path: Path
) -> None:
    """Re-firing the ComGate webhook hits issue_for_charge a second time.
    Must return the existing invoice — no new sequence allocation, no
    second PDF render."""
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, charge = await _make_org_and_charge(s)
        cleanup_orgs.append(org.id)

    async with AsyncSessionLocal() as s:
        svc = InvoiceService(storage=_local_storage(tmp_path))
        first = await svc.issue_for_charge(s, charge)
        await s.commit()
        first_id = first.id
        first_number = first.number

    async with AsyncSessionLocal() as s:
        # Simulate the second webhook firing.
        charge_reload = await s.get(Charge, charge.id)
        assert charge_reload is not None
        svc = InvoiceService(storage=_local_storage(tmp_path))
        second = await svc.issue_for_charge(s, charge_reload)
        await s.commit()
        assert second.id == first_id
        assert second.number == first_number


# --------------------------------------------------------------------------- #
# Manual issuance
# --------------------------------------------------------------------------- #


async def test_issue_manual_creates_invoice_with_provided_lines(
    cleanup_orgs: list[uuid.UUID], tmp_path: Path
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org = Organization(name=f"InvSvc-{uuid.uuid4().hex[:6]}")
        s.add(org)
        await s.flush()
        cleanup_orgs.append(org.id)
        await s.commit()

    async with AsyncSessionLocal() as s:
        svc = InvoiceService(storage=_local_storage(tmp_path))
        invoice = await svc.issue_manual(
            s,
            org_id=org.id,
            lines_in=[
                ManualLineIn(
                    description="Konzultace migrace dat",
                    quantity=Decimal("4"),
                    unit_price_minor=250_000,  # 2 500 Kč/h
                    unit_label="hodina",
                )
            ],
            note="Mimořádná fakturace",
            by_admin_id=None,
        )
        await s.commit()
        assert invoice.status == "issued"
        assert invoice.subtotal_minor == 1_000_000  # 4 × 2 500 Kč
        assert invoice.note == "Mimořádná fakturace"


# --------------------------------------------------------------------------- #
# State transitions
# --------------------------------------------------------------------------- #


async def test_mark_paid_records_audit_and_sets_paid_at(
    cleanup_orgs: list[uuid.UUID], tmp_path: Path
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, charge = await _make_org_and_charge(s)
        cleanup_orgs.append(org.id)
    async with AsyncSessionLocal() as s:
        svc = InvoiceService(storage=_local_storage(tmp_path))
        invoice = await svc.issue_for_charge(s, charge)
        await s.commit()
        invoice_id = invoice.id

    when = datetime(2026, 6, 1, 9, 0, tzinfo=UTC)
    async with AsyncSessionLocal() as s:
        svc = InvoiceService(storage=_local_storage(tmp_path))
        updated = await svc.mark_paid(s, invoice_id, paid_at=when, by_admin_id=None)
        await s.commit()
        assert updated.status == "paid"
        assert updated.paid_at == when

        events = (
            (
                await s.execute(
                    select(InvoiceAuditLog.event).where(InvoiceAuditLog.invoice_id == invoice_id)
                )
            )
            .scalars()
            .all()
        )
        assert "paid" in events


async def test_void_writes_audit_and_leaves_pdf_intact(
    cleanup_orgs: list[uuid.UUID], tmp_path: Path
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, charge = await _make_org_and_charge(s)
        cleanup_orgs.append(org.id)
    storage = _local_storage(tmp_path)
    async with AsyncSessionLocal() as s:
        svc = InvoiceService(storage=storage)
        invoice = await svc.issue_for_charge(s, charge)
        await s.commit()
        invoice_id = invoice.id
        pdf_key = invoice.pdf_object_key
        pdf_sha = invoice.pdf_sha256

    async with AsyncSessionLocal() as s:
        svc = InvoiceService(storage=storage)
        updated = await svc.void(s, invoice_id, reason="Test refund", by_admin_id=None)
        await s.commit()
        assert updated.status == "voided"
        # PDF is still on disk + still hash-verifiable
        assert updated.pdf_object_key == pdf_key
        assert updated.pdf_sha256 == pdf_sha
        # fetch_pdf still returns the original bytes
        assert storage.fetch_pdf(updated).startswith(b"%PDF-")


# --------------------------------------------------------------------------- #
# Credit notes
# --------------------------------------------------------------------------- #


async def test_credit_note_creates_separate_row_referencing_original(
    cleanup_orgs: list[uuid.UUID], tmp_path: Path
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, charge = await _make_org_and_charge(s)
        cleanup_orgs.append(org.id)
    async with AsyncSessionLocal() as s:
        svc = InvoiceService(storage=_local_storage(tmp_path))
        original = await svc.issue_for_charge(s, charge)
        await s.commit()
        original_id = original.id
        original_number = original.number
        original_total = original.total_minor

    async with AsyncSessionLocal() as s:
        svc = InvoiceService(storage=_local_storage(tmp_path))
        credit = await svc.issue_credit_note(
            s,
            original_invoice_id=original_id,
            lines_in=[
                ManualLineIn(
                    description="Vrácení — částečná fakturace",
                    quantity=Decimal("-1"),
                    unit_price_minor=original_total,
                    unit_label="ks",
                )
            ],
            reason="Klient odstoupil od smlouvy",
            by_admin_id=None,
        )
        await s.commit()

    async with AsyncSessionLocal() as s:
        # Original still intact.
        orig = await s.get(Invoice, original_id)
        assert orig is not None
        assert orig.kind == "invoice"
        assert orig.total_minor == original_total
        assert orig.number == original_number
        assert orig.status == "issued"
        # Credit note is a separate row referencing the original.
        cn = await s.get(Invoice, credit.id)
        assert cn is not None
        assert cn.kind == "credit_note"
        assert cn.related_invoice_id == original_id
        assert cn.number != original_number
        # Same yearly sequence — both share the year prefix.
        assert cn.year == orig.year


async def test_credit_note_rejects_overcredit(
    cleanup_orgs: list[uuid.UUID], tmp_path: Path
) -> None:
    """|credit total| > |original total| → CreditNoteExceedsOriginalError."""
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, charge = await _make_org_and_charge(s)
        cleanup_orgs.append(org.id)
    async with AsyncSessionLocal() as s:
        svc = InvoiceService(storage=_local_storage(tmp_path))
        original = await svc.issue_for_charge(s, charge)
        await s.commit()
        original_id = original.id
        original_total = original.total_minor

    async with AsyncSessionLocal() as s:
        svc = InvoiceService(storage=_local_storage(tmp_path))
        with pytest.raises(CreditNoteExceedsOriginalError):
            await svc.issue_credit_note(
                s,
                original_invoice_id=original_id,
                lines_in=[
                    ManualLineIn(
                        description="Over-credit",
                        quantity=Decimal("-10"),
                        unit_price_minor=original_total,
                        unit_label="ks",
                    )
                ],
                reason="should fail",
                by_admin_id=None,
            )


# --------------------------------------------------------------------------- #
# Mailer
# --------------------------------------------------------------------------- #


async def test_mailer_sends_invoice_and_writes_sent_audit(
    cleanup_orgs: list[uuid.UUID], tmp_path: Path
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, charge = await _make_org_and_charge(s)
        cleanup_orgs.append(org.id)
    storage = _local_storage(tmp_path)
    async with AsyncSessionLocal() as s:
        svc = InvoiceService(storage=storage)
        invoice = await svc.issue_for_charge(s, charge)
        await s.commit()
        invoice_id = invoice.id

    mailer = InvoiceMailer(storage=storage)
    async with AsyncSessionLocal() as s:
        loaded = await s.get(Invoice, invoice_id)
        assert loaded is not None
        await mailer.send(s, loaded, override_to="customer@example.cz")
        await s.commit()

    async with AsyncSessionLocal() as s:
        refreshed = await s.get(Invoice, invoice_id)
        assert refreshed is not None
        assert refreshed.sent_at is not None
        assert refreshed.sent_to_email == "customer@example.cz"
        events = (
            (
                await s.execute(
                    select(InvoiceAuditLog.event).where(InvoiceAuditLog.invoice_id == invoice_id)
                )
            )
            .scalars()
            .all()
        )
        assert "sent" in events
