"""Database-level invariants for the tax-invoicing models.

The Postgres triggers from migration ``165882b6092b`` enforce:
  - Invoice immutability after ``status`` leaves ``'draft'``
  - Invoice line immutability after the parent leaves ``'draft'``
  - Append-only semantics on ``invoice_audit_log``

The InvoiceCounter advisory-lock pattern enforces gap-free yearly
sequencing under concurrency. None of this matters at runtime if the
triggers / lock semantics are wrong, so this suite hits them directly.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import delete, select, text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Invoice, InvoiceAuditLog, InvoiceCounter, InvoiceLine, Organization
from app.db.session import AsyncSessionLocal

# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _lock_key(year: int) -> int:
    """Stable bigint advisory-lock key per kalendářní rok.

    Mirrors what the future `InvoiceService` will use; defined here so the
    concurrency test exercises the same lock semantics the service will.
    """
    # Postgres advisory locks accept bigint; year fits comfortably.
    return year


async def _seed_org(session: AsyncSession) -> Organization:
    org = Organization(name=f"Inv-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.flush()
    return org


def _make_invoice_kwargs(org_id: uuid.UUID, *, status: str = "issued") -> dict:
    """Common required fields for a freshly-issued Invoice. Tests override
    only what they need; this keeps the test bodies focused on the assertion."""
    return {
        "organization_id": org_id,
        "number": f"2026-{uuid.uuid4().int % 10000:04d}",
        "year": 2026,
        "sequence_in_year": uuid.uuid4().int % 10000,
        "variable_symbol": "20260001",
        "status": status,
        "kind": "invoice",
        "issued_at": datetime.now(tz=UTC),
        "taxable_supply_date": date.today(),
        "due_at": date.today() + timedelta(days=14),
        "issuer_name": "Tomáš Test OSVČ",
        "issuer_address": "Praha 1\n110 00",
        "issuer_ico": "12345678",
        "issuer_iban": "CZ6508000000192000145399",
        "issuer_register_text": "Zapsán v živnostenském rejstříku",
        "issuer_is_vat_payer": False,
        "customer_name": "Klient s.r.o.",
        "customer_address": "Brno\n602 00",
        "customer_ico": "87654321",
        "subtotal_minor": 99000,
        "vat_amount_minor": 0,
        "total_minor": 99000,
        "vat_rate_percent": Decimal("0.00"),
    }


@pytest.fixture
async def cleanup_invoices() -> list[uuid.UUID]:
    """Track invoice IDs created during the test and tear them down on exit
    (cascades to lines + audit log; counters get cleared separately)."""
    ids: list[uuid.UUID] = []
    try:
        yield ids
    finally:
        if ids:
            await _teardown_invoices(ids)


async def _teardown_invoices(ids: list[uuid.UUID]) -> None:
    async with AsyncSessionLocal() as s:
        # Audit log has no DELETE permission via trigger; manual fix:
        # disable the trigger for the session, delete, restore. The
        # alternative is leaking audit rows, which is fine in dev
        # but pollutes the table over many test runs.
        await s.execute(
            text("ALTER TABLE invoice_audit_log DISABLE TRIGGER trg_invoice_audit_log_no_delete")
        )
        await s.execute(delete(InvoiceAuditLog).where(InvoiceAuditLog.invoice_id.in_(ids)))
        await s.execute(
            text("ALTER TABLE invoice_audit_log ENABLE TRIGGER trg_invoice_audit_log_no_delete")
        )
        await s.execute(delete(Invoice).where(Invoice.id.in_(ids)))
        # The orgs are tagged "Inv-…" — clean those too
        await s.execute(delete(Organization).where(Organization.name.like("Inv-%")))
        await s.commit()


# --------------------------------------------------------------------------- #
# Immutability — Invoice
# --------------------------------------------------------------------------- #


async def test_invoice_immutability_trigger_blocks_update_after_issue(
    cleanup_invoices: list[uuid.UUID],
) -> None:
    async with AsyncSessionLocal() as s:
        org = await _seed_org(s)
        inv = Invoice(**_make_invoice_kwargs(org.id, status="issued"))
        s.add(inv)
        await s.commit()
        cleanup_invoices.append(inv.id)

    async with AsyncSessionLocal() as s:
        # Mutate a guarded column on the issued invoice — the trigger
        # should refuse the UPDATE.
        with pytest.raises((IntegrityError, DBAPIError)) as exc_info:
            await s.execute(
                text("UPDATE invoices SET total_minor = 12345 WHERE id = :id"),
                {"id": str(inv.id)},
            )
            await s.commit()
        # The trigger raises with our explicit message and a check_violation
        # SQLSTATE — both are part of the contract.
        assert "immutable" in str(exc_info.value).lower()


async def test_invoice_status_transitions_allowed(
    cleanup_invoices: list[uuid.UUID],
) -> None:
    """`issued → paid → voided` and `paid_at` writes must succeed even
    though the parent row is "non-draft" — the trigger is supposed to
    permit status transitions."""
    async with AsyncSessionLocal() as s:
        org = await _seed_org(s)
        inv = Invoice(**_make_invoice_kwargs(org.id, status="issued"))
        s.add(inv)
        await s.commit()
        cleanup_invoices.append(inv.id)

    paid_at = datetime.now(tz=UTC)
    async with AsyncSessionLocal() as s:
        await s.execute(
            text("UPDATE invoices SET status = 'paid', paid_at = :p WHERE id = :id"),
            {"p": paid_at, "id": str(inv.id)},
        )
        await s.commit()

    async with AsyncSessionLocal() as s:
        await s.execute(
            text("UPDATE invoices SET status = 'voided' WHERE id = :id"),
            {"id": str(inv.id)},
        )
        await s.commit()

    async with AsyncSessionLocal() as s:
        loaded = await s.get(Invoice, inv.id)
        assert loaded is not None
        assert loaded.status == "voided"
        assert loaded.paid_at is not None


async def test_invoice_draft_freely_mutable(
    cleanup_invoices: list[uuid.UUID],
) -> None:
    """Drafts have no immutability protection — the orchestrator builds
    them up over multiple writes before flipping to ``issued``."""
    async with AsyncSessionLocal() as s:
        org = await _seed_org(s)
        inv = Invoice(**_make_invoice_kwargs(org.id, status="draft"))
        s.add(inv)
        await s.commit()
        cleanup_invoices.append(inv.id)

    # Money mutation on a draft should pass with no trigger error.
    async with AsyncSessionLocal() as s:
        await s.execute(
            text("UPDATE invoices SET total_minor = 88800 WHERE id = :id"),
            {"id": str(inv.id)},
        )
        await s.commit()

    async with AsyncSessionLocal() as s:
        loaded = await s.get(Invoice, inv.id)
        assert loaded is not None
        assert loaded.total_minor == 88800


# --------------------------------------------------------------------------- #
# Immutability — InvoiceLine
# --------------------------------------------------------------------------- #


async def test_invoice_line_immutability(
    cleanup_invoices: list[uuid.UUID],
) -> None:
    """Once the parent invoice leaves ``draft``, every UPDATE on its lines
    is rejected. The lines test mirrors the parent-row guarantee."""
    async with AsyncSessionLocal() as s:
        org = await _seed_org(s)
        inv = Invoice(**_make_invoice_kwargs(org.id, status="issued"))
        s.add(inv)
        await s.flush()
        line = InvoiceLine(
            invoice_id=inv.id,
            position=1,
            description="SimpleCRM, plán Roční",
            quantity=Decimal("1.000"),
            unit_label="uživatel",
            unit_price_minor=99000,
            line_subtotal_minor=99000,
            line_total_minor=99000,
        )
        s.add(line)
        await s.commit()
        cleanup_invoices.append(inv.id)
        line_id = line.id

    async with AsyncSessionLocal() as s:
        with pytest.raises((IntegrityError, DBAPIError)) as exc_info:
            await s.execute(
                text("UPDATE invoice_lines SET line_total_minor = 1 WHERE id = :id"),
                {"id": str(line_id)},
            )
            await s.commit()
        assert "immutable" in str(exc_info.value).lower()


# --------------------------------------------------------------------------- #
# Append-only — InvoiceAuditLog
# --------------------------------------------------------------------------- #


async def test_audit_log_blocks_update() -> None:
    async with AsyncSessionLocal() as s:
        entry = InvoiceAuditLog(event="allocated", payload={"note": "test"})
        s.add(entry)
        await s.commit()
        entry_id = entry.id

    try:
        async with AsyncSessionLocal() as s:
            with pytest.raises((IntegrityError, DBAPIError)) as exc_info:
                await s.execute(
                    text("UPDATE invoice_audit_log SET event = 'tampered' WHERE id = :id"),
                    {"id": str(entry_id)},
                )
                await s.commit()
            assert "append-only" in str(exc_info.value).lower()
    finally:
        # Use the disable-trigger trick from the cleanup fixture inline.
        async with AsyncSessionLocal() as s:
            await s.execute(
                text(
                    "ALTER TABLE invoice_audit_log DISABLE TRIGGER trg_invoice_audit_log_no_delete"
                )
            )
            await s.execute(delete(InvoiceAuditLog).where(InvoiceAuditLog.id == entry_id))
            await s.execute(
                text("ALTER TABLE invoice_audit_log ENABLE TRIGGER trg_invoice_audit_log_no_delete")
            )
            await s.commit()


async def test_audit_log_blocks_delete() -> None:
    async with AsyncSessionLocal() as s:
        entry = InvoiceAuditLog(event="allocated", payload={"note": "test"})
        s.add(entry)
        await s.commit()
        entry_id = entry.id

    try:
        async with AsyncSessionLocal() as s:
            with pytest.raises((IntegrityError, DBAPIError)) as exc_info:
                await s.execute(
                    text("DELETE FROM invoice_audit_log WHERE id = :id"),
                    {"id": str(entry_id)},
                )
                await s.commit()
            assert "append-only" in str(exc_info.value).lower()
    finally:
        async with AsyncSessionLocal() as s:
            await s.execute(
                text(
                    "ALTER TABLE invoice_audit_log DISABLE TRIGGER trg_invoice_audit_log_no_delete"
                )
            )
            await s.execute(delete(InvoiceAuditLog).where(InvoiceAuditLog.id == entry_id))
            await s.execute(
                text("ALTER TABLE invoice_audit_log ENABLE TRIGGER trg_invoice_audit_log_no_delete")
            )
            await s.commit()


# --------------------------------------------------------------------------- #
# InvoiceCounter — concurrency + year isolation
# --------------------------------------------------------------------------- #


async def _allocate_one(year: int) -> int:
    """Mirror the allocation flow the future `InvoiceService` will run.

    Each call opens its own session (so the asyncpg pool can serve
    concurrent calls) and uses a transaction-scoped advisory lock to
    serialize against other allocators on the same year.
    """
    async with AsyncSessionLocal() as session, session.begin():
        await session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _lock_key(year)})
        counter = (
            await session.execute(
                select(InvoiceCounter).where(InvoiceCounter.year == year).with_for_update()
            )
        ).scalar_one_or_none()
        if counter is None:
            counter = InvoiceCounter(year=year, last_sequence=0)
            session.add(counter)
            await session.flush()
        counter.last_sequence += 1
        return counter.last_sequence


@pytest.fixture
async def cleanup_counter() -> None:
    """Reset the sequencer on a stable test-only year so reruns aren't
    polluted by previous values."""
    yield
    async with AsyncSessionLocal() as s:
        await s.execute(delete(InvoiceCounter).where(InvoiceCounter.year >= 2999))
        await s.commit()


async def test_invoice_counter_allocates_under_concurrency(
    cleanup_counter: None,
) -> None:
    """20 concurrent allocations against the same year produce 20 distinct
    gap-free numbers. The advisory lock is the only thing preventing
    duplicate ``sequence_in_year`` values when two transactions race."""
    year = 2999  # test-only sentinel; real years stay clean

    async with AsyncSessionLocal() as s:
        await s.execute(delete(InvoiceCounter).where(InvoiceCounter.year == year))
        await s.commit()

    results = await asyncio.gather(*(_allocate_one(year) for _ in range(20)))
    assert sorted(results) == list(range(1, 21)), results
    assert len(set(results)) == 20, "duplicate sequence numbers leaked"


async def test_invoice_counter_year_isolation(cleanup_counter: None) -> None:
    """Concurrent allocations across two different years don't block each
    other; the lock key is per-year. We just assert that interleaved calls
    on year A don't leak into year B's counter."""
    year_a, year_b = 2998, 2999
    async with AsyncSessionLocal() as s:
        await s.execute(delete(InvoiceCounter).where(InvoiceCounter.year.in_([year_a, year_b])))
        await s.commit()

    # 5 on each year, fired together
    coros = [_allocate_one(year_a) for _ in range(5)] + [_allocate_one(year_b) for _ in range(5)]
    await asyncio.gather(*coros)

    async with AsyncSessionLocal() as s:
        a = await s.get(InvoiceCounter, year_a)
        b = await s.get(InvoiceCounter, year_b)
        assert a is not None and a.last_sequence == 5
        assert b is not None and b.last_sequence == 5
