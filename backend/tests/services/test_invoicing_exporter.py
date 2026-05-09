"""Year-export tests — CSV format + ZIP archive integrity."""

from __future__ import annotations

import io
import uuid
import zipfile
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    BillingSettings,
    Charge,
    InvoiceAuditLog,
    Organization,
    Plan,
    Subscription,
    User,
    UserRole,
)
from app.db.session import AsyncSessionLocal
from app.services.invoicing.exporter import (
    build_csv,
    build_full_zip,
    build_pdf_zip,
)
from app.services.invoicing.service import InvoiceService
from app.services.invoicing.storage import InvoiceStorage
from tests.conftest import wipe_invoicing_for_org


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


async def _seed_invoice(session: AsyncSession) -> tuple[Organization, User]:
    org = Organization(name=f"Exp-{uuid.uuid4().hex[:6]}")
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
    # Use the default storage so build_*() can fetch the same files
    # without us threading a storage instance through every call. The
    # files land in var/invoices/ which is gitignored.
    svc = InvoiceService()
    await svc.issue_for_charge(session, charge)
    await session.commit()
    return org, admin


@pytest.fixture
async def cleanup_orgs() -> list[uuid.UUID]:
    ids: list[uuid.UUID] = []
    try:
        yield ids
    finally:
        if ids:
            await wipe_invoicing_for_org(ids)


# --------------------------------------------------------------------------- #


async def test_csv_export_has_bom_and_semicolon_delimiter(
    cleanup_orgs: list[uuid.UUID],
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, admin = await _seed_invoice(s)
        cleanup_orgs.append(org.id)

    async with AsyncSessionLocal() as s:
        year = datetime.now(tz=UTC).year
        payload = await build_csv(s, year, actor_user_id=admin.id)
        await s.commit()

    # UTF-8 BOM prefix.
    assert payload.startswith(b"\xef\xbb\xbf")
    text_payload = payload.decode("utf-8-sig")
    # Semicolon-delimited.
    header_line = text_payload.splitlines()[0]
    assert ";" in header_line
    # Czech header values present.
    assert "Číslo" in header_line
    assert "Splatnost" in header_line


async def test_csv_export_writes_audit_run(
    cleanup_orgs: list[uuid.UUID],
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, admin = await _seed_invoice(s)
        cleanup_orgs.append(org.id)

    async with AsyncSessionLocal() as s:
        year = datetime.now(tz=UTC).year
        await build_csv(s, year, actor_user_id=admin.id)
        await s.commit()

    async with AsyncSessionLocal() as s:
        runs = (
            (await s.execute(select(InvoiceAuditLog).where(InvoiceAuditLog.event == "export_run")))
            .scalars()
            .all()
        )
        assert any(r.payload.get("kind") == "csv" for r in runs)


async def test_pdf_zip_is_valid_archive_with_year_prefix(
    cleanup_orgs: list[uuid.UUID],
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, admin = await _seed_invoice(s)
        cleanup_orgs.append(org.id)

    storage = InvoiceStorage()  # default — must match issuance path

    async with AsyncSessionLocal() as s:
        year = datetime.now(tz=UTC).year
        payload = await build_pdf_zip(s, year, actor_user_id=admin.id, storage=storage)
        await s.commit()

    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        names = zf.namelist()
        assert all(n.startswith(f"{year}/") for n in names), names
        assert all(n.endswith(".pdf") for n in names), names
        # Spot-check: at least one PDF body starts with %PDF-
        for name in names:
            data = zf.read(name)
            assert data.startswith(b"%PDF-"), name


async def test_full_zip_contains_csv_and_pdfs(
    cleanup_orgs: list[uuid.UUID],
) -> None:
    async with AsyncSessionLocal() as s:
        await _configure_issuer(s)
    async with AsyncSessionLocal() as s:
        org, admin = await _seed_invoice(s)
        cleanup_orgs.append(org.id)

    storage = InvoiceStorage()

    async with AsyncSessionLocal() as s:
        year = datetime.now(tz=UTC).year
        payload = await build_full_zip(s, year, actor_user_id=admin.id, storage=storage)
        await s.commit()

    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        names = zf.namelist()
        assert f"{year}/prehled.csv" in names
        assert any(n.endswith(".pdf") for n in names)
        # ISDOC may or may not be present depending on the rendering path;
        # the renderer in #3 emits ISDOC for issued invoices, so expect at
        # least one .xml entry.
        assert any(n.endswith(".isdoc.xml") for n in names)
