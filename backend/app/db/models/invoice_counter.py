"""Per-year invoice number sequencer.

One row per kalendářní rok. Allocation goes through a Postgres advisory
lock keyed on the year so concurrent issuance calls serialize on the
same row and never collide on ``sequence_in_year``. The advisory lock
is per-year, so allocations across years run in parallel.

Allocation flow (called from `InvoiceService.issue_*` in commit #5):

    async with session.begin():
        await session.execute(
            text("SELECT pg_advisory_xact_lock(:k)"),
            {"k": _lock_key(year)},
        )
        counter = await session.get(InvoiceCounter, year, with_for_update=True)
        if counter is None:
            counter = InvoiceCounter(year=year, last_sequence=0)
            session.add(counter)
            await session.flush()
        counter.last_sequence += 1
        seq = counter.last_sequence
        number = f"{year}-{seq:04d}"

The transaction-scoped advisory lock is released automatically on commit
or rollback — no manual unlock needed.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class InvoiceCounter(Base):
    __tablename__ = "invoice_counters"

    year: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    last_sequence: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
