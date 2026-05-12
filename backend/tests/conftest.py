import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Charge,
    Invoice,
    InvoiceAuditLog,
    InvoiceLine,
    Organization,
    Subscription,
    User,
)
from app.db.session import AsyncSessionLocal
from app.main import app


@pytest.fixture(autouse=True)
def _block_real_smtp(monkeypatch: pytest.MonkeyPatch) -> None:
    """Belt-and-suspenders: never fire real outbound mail during tests.

    The dev `.env` may carry real Zoho credentials so the operator can
    smoke-test invoice delivery locally. Without this fixture every
    paid-charge webhook test would push a real (bouncing) email through
    Zoho and pollute the sending-reputation audit. We bypass the
    `_send_via_smtp` worker so the `send_email` log-fallback path is
    effectively the only outcome.
    """
    monkeypatch.setattr("app.services.email._send_via_smtp", lambda _msg: None)


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    """A session wrapped in an outer transaction that rolls back on exit.

    Lets tests touch real tables without polluting the dev DB. Each test gets
    a clean slate even though the same physical database is used.
    """
    async with AsyncSessionLocal() as session:
        await session.begin()
        try:
            yield session
        finally:
            await session.rollback()
            await session.close()


async def wipe_invoicing_for_org(ids: list[uuid.UUID]) -> None:
    """Cleanup helper: tear down invoicing-related rows for the given orgs.

    Disables the audit-log delete trigger for the duration of the wipe
    (the trigger normally rejects DELETE to keep history append-only;
    test cleanup is the one place that needs to bypass it). Also wipes
    cross-cutting `export_run` / `integrity_check_run` audit rows
    (`invoice_id IS NULL`) created by the same test run.

    Promoted from per-test-file copies after the 6th duplicate. Callers:

      - tests/api/v1/test_payments.py
      - tests/api/v1/test_invoices.py
      - tests/api/v1/test_admin_invoices.py
      - tests/services/test_invoicing_service.py
      - tests/services/test_invoicing_scheduler.py
      - tests/services/test_invoicing_exporter.py
      - tests/services/test_invoicing_integrity.py
    """
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
        # Cross-cutting rows (export_run, integrity_check_run).
        await s.execute(delete(InvoiceAuditLog).where(InvoiceAuditLog.invoice_id.is_(None)))
        await s.execute(
            text("ALTER TABLE invoice_audit_log ENABLE TRIGGER trg_invoice_audit_log_no_delete")
        )
        if invoice_ids:
            await s.execute(delete(InvoiceLine).where(InvoiceLine.invoice_id.in_(invoice_ids)))
            # Two-step delete so credit notes that reference an original
            # via related_invoice_id come down with their parents.
            await s.execute(delete(Invoice).where(Invoice.related_invoice_id.in_(invoice_ids)))
            await s.execute(delete(Invoice).where(Invoice.id.in_(invoice_ids)))
        await s.execute(delete(Subscription).where(Subscription.organization_id.in_(ids)))
        await s.execute(delete(Charge).where(Charge.organization_id.in_(ids)))
        await s.execute(delete(User).where(User.organization_id.in_(ids)))
        await s.execute(delete(Organization).where(Organization.id.in_(ids)))
        await s.commit()
