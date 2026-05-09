"""Archive integrity walker.

Iterates every invoice that has stored bytes (`pdf_object_key IS NOT NULL`
or `isdoc_object_key IS NOT NULL`), re-fetches via `InvoiceStorage`
which already hash-verifies on read, and aggregates failures into a
single audit-log entry per run.

Two modes: on-demand (super-admin button → POST endpoint) and weekly
(scheduler). Both call `run_archive_integrity_check`; the run is
identified by a fresh UUID so the dashboard can correlate the row to
the audit log.

Tracking design: a single `integrity_check_run` row per run with a
summary payload, plus one `integrity_failure` row per individual
mismatch. Avoids one-row-per-success spam at scale (we'd be writing
hundreds of audit rows per check otherwise).
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import asdict, dataclass
from typing import Literal

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Invoice, InvoiceAuditLog
from app.services.invoicing.storage import IntegrityError, InvoiceStorage

logger = logging.getLogger(__name__)


FailureKind = Literal["pdf", "isdoc"]


@dataclass(frozen=True)
class IntegrityFailure:
    invoice_id: uuid.UUID
    invoice_number: str
    kind: FailureKind
    error: str


@dataclass
class IntegrityRunResult:
    run_id: uuid.UUID
    checked: int
    ok: int
    failures: list[IntegrityFailure]


async def run_archive_integrity_check(
    session: AsyncSession,
    *,
    actor_user_id: uuid.UUID | None,
    storage: InvoiceStorage | None = None,
) -> IntegrityRunResult:
    """Walk every issued invoice's stored bytes and verify hashes.

    Returns the run summary; also writes:
      - one `integrity_check_run` audit row carrying the summary
      - one `integrity_failure` audit row per individual mismatch
    """
    storage = storage or InvoiceStorage()
    run_id = uuid.uuid4()
    failures: list[IntegrityFailure] = []
    checked = 0
    ok = 0

    stmt = (
        select(Invoice)
        .where(Invoice.status != "draft")
        .where(Invoice.pdf_object_key.is_not(None))
        .order_by(Invoice.issued_at.desc())
    )
    invoices = list((await session.execute(stmt)).scalars().all())

    for invoice in invoices:
        # PDF leg.
        if invoice.pdf_object_key is not None and invoice.pdf_sha256 is not None:
            checked += 1
            try:
                storage.fetch_pdf(invoice)
                ok += 1
            except IntegrityError as exc:
                failures.append(
                    IntegrityFailure(
                        invoice_id=invoice.id,
                        invoice_number=invoice.number,
                        kind="pdf",
                        error=str(exc),
                    )
                )
            except FileNotFoundError as exc:
                failures.append(
                    IntegrityFailure(
                        invoice_id=invoice.id,
                        invoice_number=invoice.number,
                        kind="pdf",
                        error=f"missing: {exc}",
                    )
                )
            except Exception as exc:
                # Log + record so transport-level failures (S3 outage)
                # show up in the dashboard instead of crashing the run.
                logger.warning("integrity check PDF fetch error for %s: %s", invoice.number, exc)
                failures.append(
                    IntegrityFailure(
                        invoice_id=invoice.id,
                        invoice_number=invoice.number,
                        kind="pdf",
                        error=str(exc),
                    )
                )

        # ISDOC leg (only if recorded — early invoices may pre-date ISDOC).
        if invoice.isdoc_object_key is not None and invoice.isdoc_sha256 is not None:
            checked += 1
            try:
                storage.fetch_isdoc(invoice)
                ok += 1
            except IntegrityError as exc:
                failures.append(
                    IntegrityFailure(
                        invoice_id=invoice.id,
                        invoice_number=invoice.number,
                        kind="isdoc",
                        error=str(exc),
                    )
                )
            except FileNotFoundError as exc:
                failures.append(
                    IntegrityFailure(
                        invoice_id=invoice.id,
                        invoice_number=invoice.number,
                        kind="isdoc",
                        error=f"missing: {exc}",
                    )
                )
            except Exception as exc:
                logger.warning("integrity check ISDOC fetch error for %s: %s", invoice.number, exc)
                failures.append(
                    IntegrityFailure(
                        invoice_id=invoice.id,
                        invoice_number=invoice.number,
                        kind="isdoc",
                        error=str(exc),
                    )
                )

    # Summary row — always written, even if `checked == 0`.
    session.add(
        InvoiceAuditLog(
            invoice_id=None,
            event="integrity_check_run",
            actor_user_id=actor_user_id,
            payload={
                "run_id": str(run_id),
                "checked": checked,
                "ok": ok,
                "failed": len(failures),
                "failures": [
                    {
                        "invoice_id": str(f.invoice_id),
                        "invoice_number": f.invoice_number,
                        "kind": f.kind,
                        "error": f.error[:500],
                    }
                    for f in failures
                ],
            },
        )
    )

    # One row per failure, attached to the offending invoice — so the
    # detail drawer's audit-log timeline shows the failure under the
    # right invoice.
    for failure in failures:
        session.add(
            InvoiceAuditLog(
                invoice_id=failure.invoice_id,
                event="integrity_failure",
                actor_user_id=actor_user_id,
                payload={
                    "run_id": str(run_id),
                    "kind": failure.kind,
                    "error": failure.error[:500],
                },
            )
        )

    await session.flush()
    logger.info(
        "integrity check run=%s checked=%d ok=%d failed=%d",
        run_id,
        checked,
        ok,
        len(failures),
    )
    return IntegrityRunResult(run_id=run_id, checked=checked, ok=ok, failures=failures)


async def latest_integrity_run(
    session: AsyncSession,
) -> InvoiceAuditLog | None:
    """Most recent `integrity_check_run` audit row, or None if no
    check has run yet."""
    stmt = (
        select(InvoiceAuditLog)
        .where(InvoiceAuditLog.event == "integrity_check_run")
        .order_by(desc(InvoiceAuditLog.created_at))
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


__all__ = [
    "IntegrityFailure",
    "IntegrityRunResult",
    "latest_integrity_run",
    "run_archive_integrity_check",
]


# `asdict` is referenced by tests for serialisation convenience; expose
# it via __all__ so the test imports cleanly without a private import.
_ = asdict
