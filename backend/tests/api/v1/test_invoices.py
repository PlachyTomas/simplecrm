"""Customer-facing tax-invoice endpoint tests.

  - GET /organizations/current/invoices       — list (drafts excluded)
  - GET /organizations/current/invoices/{id}  — detail with lines
  - GET /organizations/current/invoices/{id}/pdf — hash-verified stream

Cross-org access returns 404 (don't leak existence).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import create_access_token
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
from app.services.invoicing.service import InvoiceService
from app.services.invoicing.storage import InvoiceStorage


def _auth(user: User) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {create_access_token(user.id, user.organization_id, user.role)}"
    }


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


async def _seed_org_admin_and_invoice(
    session: AsyncSession, *, tmp_path: Path, status_value: str = "issued"
) -> tuple[Organization, User, Invoice]:
    org = Organization(name=f"InvCust-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.flush()
    admin = User(
        email=f"a-{uuid.uuid4().hex[:8]}@ex.cz",
        name="A",
        role=UserRole.admin,
        organization_id=org.id,
    )
    session.add(admin)
    plan_id = (await session.execute(select(Plan.id).where(Plan.code == "monthly"))).scalar_one()
    sub = Subscription(
        organization_id=org.id,
        plan_id=plan_id,
        status="active",
        started_at=datetime.now(tz=UTC),
        seat_count=1,
        contracted_seat_count=1,
    )
    session.add(sub)
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

    storage = InvoiceStorage(
        Settings(
            s3_endpoint_url="",
            s3_bucket_invoices="",
            invoice_storage_local_root=str(tmp_path / "invoices"),
        )
    )
    svc = InvoiceService(storage=storage)
    invoice = await svc.issue_for_charge(session, charge)
    if status_value == "draft":
        # Force back to draft (rare in real life — paid charges always
        # land as `issued`. Done here so list-excludes-drafts test has
        # something to assert against).
        await session.execute(
            text("UPDATE invoices SET status = 'draft' WHERE id = :id"),
            {"id": str(invoice.id)},
        )
    await session.commit()
    return org, admin, invoice


@pytest.fixture
async def cleanup_invoicing_orgs() -> list[uuid.UUID]:
    ids: list[uuid.UUID] = []
    try:
        yield ids
    finally:
        if ids:
            await _teardown_invoicing(ids)


async def _teardown_invoicing(ids: list[uuid.UUID]) -> None:
    async with AsyncSessionLocal() as s:
        invoice_ids = (
            (await s.execute(select(Invoice.id).where(Invoice.organization_id.in_(ids))))
            .scalars()
            .all()
        )
        if invoice_ids:
            await s.execute(
                text(
                    "ALTER TABLE invoice_audit_log DISABLE TRIGGER trg_invoice_audit_log_no_delete"
                )
            )
            await s.execute(
                delete(InvoiceAuditLog).where(InvoiceAuditLog.invoice_id.in_(invoice_ids))
            )
            await s.execute(
                text("ALTER TABLE invoice_audit_log ENABLE TRIGGER trg_invoice_audit_log_no_delete")
            )
            await s.execute(delete(InvoiceLine).where(InvoiceLine.invoice_id.in_(invoice_ids)))
            await s.execute(delete(Invoice).where(Invoice.id.in_(invoice_ids)))
        await s.execute(delete(Subscription).where(Subscription.organization_id.in_(ids)))
        await s.execute(delete(Charge).where(Charge.organization_id.in_(ids)))
        await s.execute(delete(User).where(User.organization_id.in_(ids)))
        await s.execute(delete(Organization).where(Organization.id.in_(ids)))
        await s.commit()


# --------------------------------------------------------------------------- #


async def test_list_returns_only_my_orgs_invoices(
    client: AsyncClient, tmp_path: Path, cleanup_invoicing_orgs: list[uuid.UUID]
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, admin, _ = await _seed_org_admin_and_invoice(s, tmp_path=tmp_path)
        cleanup_invoicing_orgs.append(org.id)

    response = await client.get("/api/v1/organizations/current/invoices", headers=_auth(admin))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] >= 1
    assert all(inv["status"] != "draft" for inv in body["items"])


async def test_list_excludes_drafts(
    client: AsyncClient, tmp_path: Path, cleanup_invoicing_orgs: list[uuid.UUID]
) -> None:
    """Drafts belong to the founder's review queue; the customer surface
    must not show them."""
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, admin, _ = await _seed_org_admin_and_invoice(
            s, tmp_path=tmp_path, status_value="draft"
        )
        cleanup_invoicing_orgs.append(org.id)

    response = await client.get("/api/v1/organizations/current/invoices", headers=_auth(admin))
    assert response.status_code == 200
    assert response.json()["total"] == 0


async def test_detail_returns_lines_and_payment_info(
    client: AsyncClient, tmp_path: Path, cleanup_invoicing_orgs: list[uuid.UUID]
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, admin, invoice = await _seed_org_admin_and_invoice(s, tmp_path=tmp_path)
        cleanup_invoicing_orgs.append(org.id)
        invoice_id = invoice.id

    response = await client.get(
        f"/api/v1/organizations/current/invoices/{invoice_id}", headers=_auth(admin)
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["id"] == str(invoice_id)
    assert body["lines"]
    assert body["issuer_iban"]
    assert body["variable_symbol"]


async def test_detail_404_for_cross_org_invoice(
    client: AsyncClient, tmp_path: Path, cleanup_invoicing_orgs: list[uuid.UUID]
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org_a, admin_a, _ = await _seed_org_admin_and_invoice(s, tmp_path=tmp_path)
        org_b, _admin_b, invoice_b = await _seed_org_admin_and_invoice(s, tmp_path=tmp_path)
        cleanup_invoicing_orgs.extend([org_a.id, org_b.id])

    response = await client.get(
        f"/api/v1/organizations/current/invoices/{invoice_b.id}", headers=_auth(admin_a)
    )
    assert response.status_code == 404, response.text


async def test_pdf_stream_returns_pdf_bytes_with_hash_verified(
    client: AsyncClient, tmp_path: Path, cleanup_invoicing_orgs: list[uuid.UUID]
) -> None:
    """Default storage points at `var/invoices/` on the host. We can't
    easily redirect the route's `InvoiceStorage()` to tmp_path without
    monkeypatching, so this test seeds via the default path and reads
    back from there. Cleanup wipes the rows; the PDF files stay in
    var/invoices/ (gitignored)."""
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org = Organization(name=f"InvCustPDF-{uuid.uuid4().hex[:6]}")
        s.add(org)
        await s.flush()
        admin = User(
            email=f"a-{uuid.uuid4().hex[:8]}@ex.cz",
            name="A",
            role=UserRole.admin,
            organization_id=org.id,
        )
        s.add(admin)
        plan_id = (await s.execute(select(Plan.id).where(Plan.code == "monthly"))).scalar_one()
        s.add(
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
            paid_at=datetime.now(tz=UTC),
        )
        s.add(charge)
        await s.commit()
        # Use the default InvoiceStorage so the route can fetch from
        # the same path.
        svc = InvoiceService()
        invoice = await svc.issue_for_charge(s, charge)
        await s.commit()
        cleanup_invoicing_orgs.append(org.id)
        invoice_id = invoice.id

    response = await client.get(
        f"/api/v1/organizations/current/invoices/{invoice_id}/pdf",
        headers=_auth(admin),
    )
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF-")
    assert b"%%EOF" in response.content[-32:]
    # Disposition uses the invoice number for the filename.
    assert "Faktura-" in response.headers.get("content-disposition", "")
