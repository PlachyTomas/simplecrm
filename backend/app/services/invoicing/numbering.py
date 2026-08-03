"""Atomic per-year invoice number allocator.

Postgres advisory lock keyed on the year serializes concurrent issuance
calls so `(year, sequence_in_year)` never collides — gap-free per
kalendářní rok per `docs/prompts/INVOICES_TASK.md` §3.

Concurrent allocations across different years run in parallel because
the lock key includes the year. The transaction-scoped advisory lock is
released automatically on commit/rollback.

Usage from inside an orchestrator transaction:

    seq, number, vs = await allocate_invoice_number(session, year)
    invoice = Invoice(number=number, year=year, sequence_in_year=seq,
                       variable_symbol=vs, ...)
"""

from __future__ import annotations

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import InvoiceCounter

# Postgres advisory locks accept bigint. The key is namespaced (money-
# review R4 P3): the app has other advisory locks (scheduler sweeps use
# 918 27xx), and a bare `year` (~2026) sat in the same easily-collided
# small-int space. "INV" in hex, shifted past any plausible year.
_NAMESPACE = 0x494E56 << 16  # "INV"


def _lock_key(year: int) -> int:
    return _NAMESPACE | year


async def allocate_invoice_number(session: AsyncSession, year: int) -> tuple[int, str, str]:
    """Allocate the next sequence number for `year` under an advisory lock.

    Returns `(sequence_in_year, number, variable_symbol)` where
    `number = "YYYY-NNNN"` (zero-padded to 4 digits, expand to 5 if a
    year exceeds 9 999 invoices) and `variable_symbol = "YYYYNNNN"`
    (no dash; bank transfer field).

    Caller is responsible for the surrounding transaction and for
    persisting the new `Invoice` row in the same transaction. If the
    transaction rolls back, the counter increment rolls back with it
    — but in practice we follow §3 of INVOICES_TASK.md and write a
    `voided` Invoice row holding the consumed number rather than
    leaving a gap.
    """
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
    seq = counter.last_sequence
    width = 4 if seq < 10_000 else 5
    number = f"{year}-{seq:0{width}d}"
    variable_symbol = number.replace("-", "")
    return seq, number, variable_symbol


__all__ = ["allocate_invoice_number"]
