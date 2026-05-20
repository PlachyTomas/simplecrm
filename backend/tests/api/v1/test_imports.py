"""Integration tests for the admin CSV-import endpoints.

Each test seeds a fresh organization + admin, runs at least one
/preview, and where relevant a /commit. The /commit path verifies that
rows actually land in `companies` / `contacts` with the right
organization scoping.
"""

from __future__ import annotations

import io
import json
import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import BlockedCompany, Company, Contact, Organization, User, UserRole
from app.db.session import AsyncSessionLocal


@pytest.fixture
async def owned_cleanup() -> AsyncIterator[dict[str, list[uuid.UUID | str]]]:
    tracked: dict[str, list[uuid.UUID | str]] = {"orgs": [], "emails": []}
    yield tracked
    async with AsyncSessionLocal() as session:
        if tracked["emails"]:
            await session.execute(delete(User).where(User.email.in_(tracked["emails"])))
        if tracked["orgs"]:
            org_ids = tracked["orgs"]
            await session.execute(delete(Contact).where(Contact.organization_id.in_(org_ids)))
            await session.execute(delete(Company).where(Company.organization_id.in_(org_ids)))
            await session.execute(
                delete(BlockedCompany).where(BlockedCompany.organization_id.in_(org_ids))
            )
            await session.execute(delete(Organization).where(Organization.id.in_(org_ids)))
        await session.commit()


async def _seed_org(
    session: AsyncSession, owned_cleanup: dict[str, list[uuid.UUID | str]]
) -> Organization:
    org = Organization(name=f"Org-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.commit()
    await session.refresh(org)
    owned_cleanup["orgs"].append(org.id)
    return org


async def _seed_user(
    session: AsyncSession,
    owned_cleanup: dict[str, list[uuid.UUID | str]],
    org: Organization,
    role: UserRole,
) -> User:
    email = f"u-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    user = User(email=email, name="U", role=role, organization_id=org.id)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


def _auth(user: User) -> dict[str, str]:
    token = create_access_token(user.id, user.organization_id, user.role)
    return {"Authorization": f"Bearer {token}"}


def _csv_upload(content: str, filename: str = "companies.csv") -> tuple[str, io.BytesIO, str]:
    return (filename, io.BytesIO(content.encode("utf-8")), "text/csv")


COMPANIES_CSV = (
    "Název,IČO,E-mail\nAcme s.r.o.,12345678,info@acme.cz\nBeta a.s.,87654321,kontakt@beta.cz\n"
)


async def test_fields_catalog_lists_company_and_contact_keys(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)

    r = await client.get("/api/v1/admin/imports/fields", headers=_auth(admin))
    assert r.status_code == 200
    body = r.json()
    assert {"name", "ico", "email"}.issubset({f["key"] for f in body["company"]})
    assert {"first_name", "last_name"}.issubset({f["key"] for f in body["contact"]})


async def test_preview_companies_only_counts_new_rows(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)

    files = {"companies_file": _csv_upload(COMPANIES_CSV)}
    data = {
        "mode": "companies_only",
        "mapping_companies_json": json.dumps({"Název": "name", "IČO": "ico", "E-mail": "email"}),
    }
    r = await client.post(
        "/api/v1/admin/imports/preview", headers=_auth(admin), files=files, data=data
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["counts"]["companies_to_create"] == 2
    assert body["counts"]["companies_to_update"] == 0
    assert body["counts"]["invalid_rows"] == 0
    assert body["errors"] == []


async def test_preview_diff_shows_changed_field_on_existing_company(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    db_session.add(
        Company(
            organization_id=org.id,
            name="Acme s.r.o.",
            ico="12345678",
            email="old@acme.cz",
        )
    )
    await db_session.commit()

    files = {"companies_file": _csv_upload(COMPANIES_CSV)}
    data = {
        "mode": "companies_only",
        "mapping_companies_json": json.dumps({"Název": "name", "IČO": "ico", "E-mail": "email"}),
    }
    r = await client.post(
        "/api/v1/admin/imports/preview", headers=_auth(admin), files=files, data=data
    )
    body = r.json()
    assert body["counts"]["companies_to_create"] == 1  # Beta
    assert body["counts"]["companies_to_update"] == 1  # Acme (email changed)
    diff = next(d for d in body["update_diffs"] if d["entity_type"] == "company")
    assert "email" in diff["changes"]
    assert diff["changes"]["email"]["from"] == "old@acme.cz"
    assert diff["changes"]["email"]["to"] == "info@acme.cz"


async def test_preview_flags_blocked_ico(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    db_session.add(
        BlockedCompany(organization_id=org.id, ico="87654321", reason_category="competitor")
    )
    await db_session.commit()

    files = {"companies_file": _csv_upload(COMPANIES_CSV)}
    data = {
        "mode": "companies_only",
        "mapping_companies_json": json.dumps({"Název": "name", "IČO": "ico"}),
    }
    r = await client.post(
        "/api/v1/admin/imports/preview", headers=_auth(admin), files=files, data=data
    )
    body = r.json()
    assert body["counts"]["invalid_rows"] == 1
    assert any(e["code"] == "ico_blocked" for e in body["errors"])


async def test_commit_persists_new_companies(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)

    files = {"companies_file": _csv_upload(COMPANIES_CSV)}
    data = {
        "mode": "companies_only",
        "mapping_companies_json": json.dumps({"Název": "name", "IČO": "ico", "E-mail": "email"}),
    }
    r = await client.post(
        "/api/v1/admin/imports/commit", headers=_auth(admin), files=files, data=data
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["created_company_ids"]) == 2

    async with AsyncSessionLocal() as s:
        names = (
            (await s.execute(select(Company.name).where(Company.organization_id == org.id)))
            .scalars()
            .all()
        )
        assert set(names) == {"Acme s.r.o.", "Beta a.s."}


COMBINED_CSV = (
    "FirmaNázev,FirmaIČO,Jméno,Příjmení\n"
    "Acme s.r.o.,12345678,Anna,Nováková\n"
    "Acme s.r.o.,12345678,Bob,Black\n"
    "Beta a.s.,87654321,Cyril,Cuk\n"
)


async def test_preview_combined_mode_links_contacts_by_ico(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)

    files = {"companies_file": _csv_upload(COMBINED_CSV, filename="combined.csv")}
    data = {
        "mode": "combined",
        "mapping_companies_json": json.dumps({"FirmaNázev": "name", "FirmaIČO": "ico"}),
        "mapping_contacts_json": json.dumps({"Jméno": "first_name", "Příjmení": "last_name"}),
        "match_source": "ico",
        "match_key_company": "FirmaIČO",
        "match_key_contact": "FirmaIČO",
    }
    r = await client.post(
        "/api/v1/admin/imports/preview", headers=_auth(admin), files=files, data=data
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # 2 unique companies after dedup, 3 contacts all matched.
    assert body["counts"]["companies_to_create"] == 2
    assert body["counts"]["contacts_to_create"] == 3
    assert body["counts"]["unmatched_contacts"] == 0


async def test_commit_separate_mode_links_contacts_to_companies(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)

    companies_csv = "Název,IČO\nAcme s.r.o.,12345678\nBeta a.s.,87654321\n"
    contacts_csv = (
        "Jméno,Příjmení,FirmaIČO\n"
        "Anna,Nováková,12345678\n"
        "Bob,Black,87654321\n"
        "Sirotek,Bezfirmy,99999999\n"  # unmatched
    )
    files = {
        "companies_file": _csv_upload(companies_csv, filename="companies.csv"),
        "contacts_file": _csv_upload(contacts_csv, filename="contacts.csv"),
    }
    data = {
        "mode": "separate",
        "mapping_companies_json": json.dumps({"Název": "name", "IČO": "ico"}),
        "mapping_contacts_json": json.dumps({"Jméno": "first_name", "Příjmení": "last_name"}),
        "match_source": "ico",
        "match_key_company": "IČO",
        "match_key_contact": "FirmaIČO",
        "skip_unmatched": "true",
    }
    r = await client.post(
        "/api/v1/admin/imports/commit", headers=_auth(admin), files=files, data=data
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["created_company_ids"]) == 2
    assert len(body["created_contact_ids"]) == 2

    async with AsyncSessionLocal() as s:
        contacts = (
            (await s.execute(select(Contact).where(Contact.organization_id == org.id)))
            .scalars()
            .all()
        )
        assert {c.last_name for c in contacts} == {"Nováková", "Black"}
        # Both must have a company_id pointing to the matching company.
        assert all(c.company_id is not None for c in contacts)


async def test_salesperson_cannot_import(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)

    files = {"companies_file": _csv_upload(COMPANIES_CSV)}
    data = {
        "mode": "companies_only",
        "mapping_companies_json": json.dumps({"Název": "name"}),
    }
    r = await client.post(
        "/api/v1/admin/imports/preview", headers=_auth(sales), files=files, data=data
    )
    assert r.status_code == 403


async def test_commit_resolves_owner_by_email(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)

    csv = (
        "Název,IČO,Obchodník\n"
        f"Acme s.r.o.,12345678,{sales.email}\n"
        f"Beta a.s.,87654321,{sales.email.upper()}\n"  # case-insensitive
    )
    files = {"companies_file": _csv_upload(csv)}
    data = {
        "mode": "companies_only",
        "mapping_companies_json": json.dumps({"Název": "name", "IČO": "ico", "Obchodník": "owner"}),
    }
    r = await client.post(
        "/api/v1/admin/imports/commit", headers=_auth(admin), files=files, data=data
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["created_company_ids"]) == 2

    async with AsyncSessionLocal() as s:
        companies = (
            (await s.execute(select(Company).where(Company.organization_id == org.id)))
            .scalars()
            .all()
        )
        assert all(c.owner_user_id == sales.id for c in companies)


async def test_preview_flags_owner_unknown(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)

    csv = "Název,IČO,Obchodník\nAcme s.r.o.,12345678,ghost@nikde.cz\n"
    files = {"companies_file": _csv_upload(csv)}
    data = {
        "mode": "companies_only",
        "mapping_companies_json": json.dumps({"Název": "name", "IČO": "ico", "Obchodník": "owner"}),
    }
    r = await client.post(
        "/api/v1/admin/imports/preview", headers=_auth(admin), files=files, data=data
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["counts"]["invalid_rows"] == 1
    assert any(e["code"] == "owner_unknown" for e in body["errors"])


async def test_commit_bulk_owner_assigns_every_company(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)

    files = {"companies_file": _csv_upload(COMPANIES_CSV)}
    data = {
        "mode": "companies_only",
        "mapping_companies_json": json.dumps({"Název": "name", "IČO": "ico", "E-mail": "email"}),
        "bulk_owner_user_id": str(sales.id),
    }
    r = await client.post(
        "/api/v1/admin/imports/commit", headers=_auth(admin), files=files, data=data
    )
    assert r.status_code == 200, r.text

    async with AsyncSessionLocal() as s:
        companies = (
            (await s.execute(select(Company).where(Company.organization_id == org.id)))
            .scalars()
            .all()
        )
        assert {c.owner_user_id for c in companies} == {sales.id}
        assert len(companies) == 2


async def test_preview_blocks_when_owner_cap_would_be_exceeded(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    sales.max_owned_companies = 1
    await db_session.commit()

    csv = f"Název,IČO,Obchodník\nFirm 1,11111118,{sales.email}\nFirm 2,22222226,{sales.email}\n"
    files = {"companies_file": _csv_upload(csv)}
    data = {
        "mode": "companies_only",
        "mapping_companies_json": json.dumps({"Název": "name", "IČO": "ico", "Obchodník": "owner"}),
    }
    r = await client.post(
        "/api/v1/admin/imports/preview", headers=_auth(admin), files=files, data=data
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # First row fits (current 0 + 1 = 1 ≤ cap); second one busts it.
    assert body["counts"]["companies_to_create"] == 1
    assert body["counts"]["invalid_rows"] == 1
    cap_errors = [e for e in body["errors"] if e["code"] == "owner_cap_reached"]
    assert len(cap_errors) == 1


async def test_invalid_mapping_returns_400_with_clear_message(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)

    files = {"companies_file": _csv_upload(COMPANIES_CSV)}
    # Mapped to a non-existent field key.
    data = {
        "mode": "companies_only",
        "mapping_companies_json": json.dumps({"Název": "made_up_field"}),
    }
    r = await client.post(
        "/api/v1/admin/imports/preview", headers=_auth(admin), files=files, data=data
    )
    assert r.status_code == 400
    assert "made_up_field" in r.json()["detail"]
