"""Super-admin tax-invoice endpoint tests.

  - GET /admin/invoices                             — cross-org list with filters
  - GET /admin/invoices/{id}                        — detail with audit log
  - POST /admin/invoices/{id}/mark-paid             — state transition
  - POST /admin/invoices/{id}/void                  — state transition
  - POST /admin/invoices/{id}/credit-note           — child invoice
  - POST /admin/invoices/{id}/send                  — mailer wrapper

Non-super-admin callers must get 403 — the routes don't reveal whether
the IDs exist.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
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


async def _seed(
    session: AsyncSession, *, tmp_path: Path, super_admin: bool = True
) -> tuple[Organization, User, Invoice]:
    org = Organization(name=f"AdminInv-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.flush()
    admin = User(
        email=f"a-{uuid.uuid4().hex[:8]}@ex.cz",
        name="Admin",
        role=UserRole.admin,
        organization_id=org.id,
        is_super_admin=super_admin,
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

    storage = InvoiceStorage(
        Settings(
            s3_endpoint_url="",
            s3_bucket_invoices="",
            invoice_storage_local_root=str(tmp_path / "invoices"),
        )
    )
    svc = InvoiceService(storage=storage)
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
            # Two-step delete: credit notes reference the original via
            # related_invoice_id, so kill them first.
            await s.execute(
                delete(Invoice).where(
                    Invoice.related_invoice_id.in_(invoice_ids),
                )
            )
            await s.execute(delete(Invoice).where(Invoice.id.in_(invoice_ids)))
        await s.execute(delete(Subscription).where(Subscription.organization_id.in_(ids)))
        await s.execute(delete(Charge).where(Charge.organization_id.in_(ids)))
        await s.execute(delete(User).where(User.organization_id.in_(ids)))
        await s.execute(delete(Organization).where(Organization.id.in_(ids)))
        await s.commit()


# --------------------------------------------------------------------------- #


async def test_list_returns_invoices_across_orgs(
    client: AsyncClient, tmp_path: Path, cleanup_orgs: list[uuid.UUID]
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org_a, admin, _ = await _seed(s, tmp_path=tmp_path)
        org_b, _admin_b, _ = await _seed(s, tmp_path=tmp_path)
        cleanup_orgs.extend([org_a.id, org_b.id])

    response = await client.get("/api/v1/admin/invoices?limit=200", headers=_auth(admin))
    assert response.status_code == 200, response.text
    body = response.json()
    org_ids_in_response = {item["organization_id"] for item in body["items"]}
    assert str(org_a.id) in org_ids_in_response
    assert str(org_b.id) in org_ids_in_response
    # Each row carries the org name (avoids extra fetch in the UI).
    assert all("organization_name" in item for item in body["items"])


async def test_list_filters_by_org_and_status(
    client: AsyncClient, tmp_path: Path, cleanup_orgs: list[uuid.UUID]
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org_a, admin, _ = await _seed(s, tmp_path=tmp_path)
        org_b, _admin_b, _ = await _seed(s, tmp_path=tmp_path)
        cleanup_orgs.extend([org_a.id, org_b.id])

    response = await client.get(
        f"/api/v1/admin/invoices?org_id={org_a.id}&status=issued",
        headers=_auth(admin),
    )
    assert response.status_code == 200
    body = response.json()
    assert all(item["organization_id"] == str(org_a.id) for item in body["items"])
    assert all(item["status"] == "issued" for item in body["items"])


async def test_list_403_for_non_super_admin(
    client: AsyncClient, tmp_path: Path, cleanup_orgs: list[uuid.UUID]
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, _admin_super, _ = await _seed(s, tmp_path=tmp_path, super_admin=False)
        cleanup_orgs.append(org.id)
        # Re-fetch the (non-super) admin user.
        regular = (
            (await s.execute(select(User).where(User.organization_id == org.id))).scalars().first()
        )
        assert regular is not None

    response = await client.get("/api/v1/admin/invoices", headers=_auth(regular))
    assert response.status_code == 403


async def test_detail_returns_lines_and_audit_log(
    client: AsyncClient, tmp_path: Path, cleanup_orgs: list[uuid.UUID]
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, admin, invoice = await _seed(s, tmp_path=tmp_path)
        cleanup_orgs.append(org.id)
        invoice_id = invoice.id

    response = await client.get(f"/api/v1/admin/invoices/{invoice_id}", headers=_auth(admin))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["id"] == str(invoice_id)
    assert body["lines"]
    assert body["audit_log"]  # at least the `issued` event
    events = {entry["event"] for entry in body["audit_log"]}
    assert "issued" in events


async def test_mark_paid_transitions_status_and_records_actor(
    client: AsyncClient, tmp_path: Path, cleanup_orgs: list[uuid.UUID]
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, admin, invoice = await _seed(s, tmp_path=tmp_path)
        cleanup_orgs.append(org.id)
        invoice_id = invoice.id
        admin_id = admin.id

    response = await client.post(
        f"/api/v1/admin/invoices/{invoice_id}/mark-paid",
        headers=_auth(admin),
        json={"paid_at": None},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "paid"
    assert body["paid_at"] is not None

    # Audit log records the actor.
    paid_entries = [e for e in body["audit_log"] if e["event"] == "paid"]
    assert paid_entries, "expected a 'paid' audit-log entry"
    assert paid_entries[0]["actor_user_id"] == str(admin_id)


async def test_mark_paid_idempotent_returns_409(
    client: AsyncClient, tmp_path: Path, cleanup_orgs: list[uuid.UUID]
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, admin, invoice = await _seed(s, tmp_path=tmp_path)
        cleanup_orgs.append(org.id)
        invoice_id = invoice.id

    await client.post(
        f"/api/v1/admin/invoices/{invoice_id}/mark-paid",
        headers=_auth(admin),
        json={"paid_at": None},
    )
    second = await client.post(
        f"/api/v1/admin/invoices/{invoice_id}/mark-paid",
        headers=_auth(admin),
        json={"paid_at": None},
    )
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "invoice_already_paid"


async def test_void_transitions_to_voided(
    client: AsyncClient, tmp_path: Path, cleanup_orgs: list[uuid.UUID]
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, admin, invoice = await _seed(s, tmp_path=tmp_path)
        cleanup_orgs.append(org.id)
        invoice_id = invoice.id

    response = await client.post(
        f"/api/v1/admin/invoices/{invoice_id}/void",
        headers=_auth(admin),
        json={"reason": "Test storno z Q&A"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "voided"


async def test_credit_note_creates_child_invoice(
    client: AsyncClient, tmp_path: Path, cleanup_orgs: list[uuid.UUID]
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, admin, invoice = await _seed(s, tmp_path=tmp_path)
        cleanup_orgs.append(org.id)
        invoice_id = invoice.id

    response = await client.post(
        f"/api/v1/admin/invoices/{invoice_id}/credit-note",
        headers=_auth(admin),
        json={
            "reason": "Refund po reklamaci",
            "lines": [
                {
                    "description": "Storno – SimpleCRM Měsíční",
                    "quantity": "1",
                    "unit_price_minor": -99000,
                    "unit_label": "ks",
                }
            ],
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["kind"] == "credit_note"
    assert body["related_invoice_id"] == str(invoice_id)
    # Numeric quantity should round-trip; pydantic serialises Decimal as
    # string, so assert string-equality after Decimal conversion.
    assert Decimal(body["lines"][0]["quantity"]) == Decimal("1")


async def test_credit_note_blocked_when_exceeds_original(
    client: AsyncClient, tmp_path: Path, cleanup_orgs: list[uuid.UUID]
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, admin, invoice = await _seed(s, tmp_path=tmp_path)
        cleanup_orgs.append(org.id)
        invoice_id = invoice.id

    response = await client.post(
        f"/api/v1/admin/invoices/{invoice_id}/credit-note",
        headers=_auth(admin),
        json={
            "reason": "Pokus o nadměrný dobropis",
            "lines": [
                {
                    "description": "Storno",
                    "quantity": "10",
                    "unit_price_minor": -99000,
                    "unit_label": "ks",
                }
            ],
        },
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "credit_exceeds_original"
