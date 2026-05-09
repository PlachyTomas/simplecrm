"""Archive-integrity walker tests."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import delete, select, text, update
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
    User,
    UserRole,
)
from app.db.session import AsyncSessionLocal
from app.services.invoicing.integrity import (
    latest_integrity_run,
    run_archive_integrity_check,
)
from app.services.invoicing.service import InvoiceService


async def _configure_issuer(session: AsyncSession) -> None:
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


async def _seed_invoice(session: AsyncSession) -> tuple[Organization, User, Invoice]:
    org = Organization(name=f"Int-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.flush()
    admin = User(
        email=f"a-{uuid.uuid4().hex[:8]}@ex.cz",
        name="A",
        role=UserRole.admin,
        organization_id=org.id,
        is_super_admin=True,
    )
    session.add(admin)
    plan_id = (await session.execute(select(Plan.id).where(Plan.code == "monthly"))).scalar_one()
    session.add(
        Subscription(
            organization_id=org.id,
            plan_id=plan_id,
            status="active",
            started_at=datetime.now(tz=UTC),
            seat_count=1,
            contracted_seat_count=1,
        )
    )
    charge = Charge(
        organization_id=org.id,
        kind="initial",
        amount_minor=99000,
        currency="CZK",
        status="paid",
        seats=1,
        period_starts_at=datetime.now(tz=UTC),
        period_ends_at=datetime.now(tz=UTC) + timedelta(days=30),
        paid_at=datetime.now(tz=UTC),
    )
    session.add(charge)
    await session.commit()
    svc = InvoiceService()
    invoice = await svc.issue_for_charge(session, charge)
    await session.commit()
    return org, admin, invoice


@pytest.fixture
async def cleanup_orgs() -> list[uuid.UUID]:
    ids: list[uuid.UUID] = []
    try:
        yield ids
    finally:
        if ids:
            await _teardown(ids)


async def _teardown(ids: list[uuid.UUID]) -> None:
    async with AsyncSessionLocal() as s:
        invoice_ids = (
            (await s.execute(select(Invoice.id).where(Invoice.organization_id.in_(ids))))
            .scalars()
            .all()
        )
        await s.execute(
            text("ALTER TABLE invoice_audit_log DISABLE TRIGGER trg_invoice_audit_log_no_delete")
        )
        if invoice_ids:
            await s.execute(
                delete(InvoiceAuditLog).where(InvoiceAuditLog.invoice_id.in_(invoice_ids))
            )
        await s.execute(delete(InvoiceAuditLog).where(InvoiceAuditLog.invoice_id.is_(None)))
        await s.execute(
            text("ALTER TABLE invoice_audit_log ENABLE TRIGGER trg_invoice_audit_log_no_delete")
        )
        if invoice_ids:
            await s.execute(delete(InvoiceLine).where(InvoiceLine.invoice_id.in_(invoice_ids)))
            await s.execute(delete(Invoice).where(Invoice.id.in_(invoice_ids)))
        await s.execute(delete(Subscription).where(Subscription.organization_id.in_(ids)))
        await s.execute(delete(Charge).where(Charge.organization_id.in_(ids)))
        await s.execute(delete(User).where(User.organization_id.in_(ids)))
        await s.execute(delete(Organization).where(Organization.id.in_(ids)))
        await s.commit()


# --------------------------------------------------------------------------- #


async def test_integrity_check_passes_for_freshly_issued_invoice(
    cleanup_orgs: list[uuid.UUID],
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, admin, _ = await _seed_invoice(s)
        cleanup_orgs.append(org.id)

    async with AsyncSessionLocal() as s:
        result = await run_archive_integrity_check(s, actor_user_id=admin.id)
        await s.commit()

    assert result.checked >= 1
    assert result.ok == result.checked
    assert result.failures == []


async def test_integrity_check_writes_summary_audit_row(
    cleanup_orgs: list[uuid.UUID],
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, admin, _ = await _seed_invoice(s)
        cleanup_orgs.append(org.id)

    async with AsyncSessionLocal() as s:
        await run_archive_integrity_check(s, actor_user_id=admin.id)
        await s.commit()

    async with AsyncSessionLocal() as s:
        last = await latest_integrity_run(s)
        assert last is not None
        assert last.event == "integrity_check_run"
        assert "run_id" in last.payload
        assert last.payload.get("failed", -1) == 0


async def test_integrity_check_records_failure_when_pdf_hash_mismatches(
    cleanup_orgs: list[uuid.UUID],
) -> None:
    """Tamper with `pdf_sha256` to simulate a corrupted archive — the
    walker should report a failure for that invoice."""
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, admin, invoice = await _seed_invoice(s)
        cleanup_orgs.append(org.id)
        invoice_id = invoice.id

    # Force a hash mismatch by overwriting pdf_sha256 to a bogus value.
    # The immutability trigger allows changes during/before issued; once
    # issued we need a raw UPDATE that sidesteps the SQLAlchemy-managed
    # paths. The pdf_sha256 column is in the trigger's guarded set, so
    # we bypass via DISABLE TRIGGER for the duration of the tamper.
    async with AsyncSessionLocal() as s:
        await s.execute(text("ALTER TABLE invoices DISABLE TRIGGER trg_invoice_immutable"))
        await s.execute(
            text("UPDATE invoices SET pdf_sha256 = :bad WHERE id = :id"),
            {"bad": "0" * 64, "id": str(invoice_id)},
        )
        await s.execute(text("ALTER TABLE invoices ENABLE TRIGGER trg_invoice_immutable"))
        await s.commit()

    async with AsyncSessionLocal() as s:
        result = await run_archive_integrity_check(s, actor_user_id=admin.id)
        await s.commit()

    assert any(f.invoice_id == invoice_id and f.kind == "pdf" for f in result.failures), (
        result.failures
    )


async def test_latest_integrity_run_returns_most_recent(
    cleanup_orgs: list[uuid.UUID],
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, admin, _ = await _seed_invoice(s)
        cleanup_orgs.append(org.id)

    async with AsyncSessionLocal() as s:
        first = await run_archive_integrity_check(s, actor_user_id=admin.id)
        await s.commit()
    async with AsyncSessionLocal() as s:
        second = await run_archive_integrity_check(s, actor_user_id=admin.id)
        await s.commit()

    assert first.run_id != second.run_id
    async with AsyncSessionLocal() as s:
        latest = await latest_integrity_run(s)
        assert latest is not None
        assert latest.payload["run_id"] == str(second.run_id)
