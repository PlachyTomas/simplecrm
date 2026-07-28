"""Integration tests for the admin CSV-import endpoints (v2 multi-file).

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
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import (
    Activity,
    BlockedCompany,
    Company,
    Contact,
    Deal,
    Organization,
    Pipeline,
    Stage,
    StageType,
    User,
    UserRole,
)
from app.db.session import AsyncSessionLocal
from app.services.pipeline import create_default_pipeline

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "pipedrive"


@pytest.fixture
async def owned_cleanup() -> AsyncIterator[dict[str, list[uuid.UUID | str]]]:
    tracked: dict[str, list[uuid.UUID | str]] = {"orgs": [], "emails": []}
    yield tracked
    async with AsyncSessionLocal() as session:
        if tracked["emails"]:
            await session.execute(delete(User).where(User.email.in_(tracked["emails"])))
        if tracked["orgs"]:
            org_ids = tracked["orgs"]
            # FK-safe order: deals reference companies, contacts and stages;
            # deleting pipelines cascades their stages at the DB level.
            await session.execute(delete(Deal).where(Deal.organization_id.in_(org_ids)))
            await session.execute(delete(Pipeline).where(Pipeline.organization_id.in_(org_ids)))
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


def _csv(content: str, filename: str) -> tuple[str, io.BytesIO, str]:
    return (filename, io.BytesIO(content.encode("utf-8")), "text/csv")


COMPANIES_CSV = (
    "Název,IČO,E-mail\nAcme s.r.o.,12345678,info@acme.cz\nBeta a.s.,87654321,kontakt@beta.cz\n"
)


def _spec_companies(mapping: dict[str, str]) -> dict[str, object]:
    return {"role": "companies", "mapping_company": mapping}


def _spec_contacts(
    mapping: dict[str, str], match_key_contact: str | None = None
) -> dict[str, object]:
    spec: dict[str, object] = {"role": "contacts", "mapping_contact": mapping}
    if match_key_contact is not None:
        spec["match_key_contact"] = match_key_contact
    return spec


def _spec_combined(
    company_mapping: dict[str, str],
    contact_mapping: dict[str, str],
    match_key_contact: str | None = None,
) -> dict[str, object]:
    spec: dict[str, object] = {
        "role": "combined",
        "mapping_company": company_mapping,
        "mapping_contact": contact_mapping,
    }
    if match_key_contact is not None:
        spec["match_key_contact"] = match_key_contact
    return spec


async def test_fields_catalog_lists_company_and_contact_keys(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)

    r = await client.get("/api/v1/admin/imports/fields", headers=_auth(admin))
    assert r.status_code == 200
    body = r.json()
    assert {"name", "ico", "email", "phone", "industry", "owner"}.issubset(
        {f["key"] for f in body["company"]}
    )
    assert {"first_name", "last_name"}.issubset({f["key"] for f in body["contact"]})


async def test_preview_companies_only_counts_new_rows(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)

    files = [("files", _csv(COMPANIES_CSV, "companies.csv"))]
    data = {
        "file_specs_json": json.dumps(
            [_spec_companies({"Název": "name", "IČO": "ico", "E-mail": "email"})]
        ),
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

    files = [("files", _csv(COMPANIES_CSV, "companies.csv"))]
    data = {
        "file_specs_json": json.dumps(
            [_spec_companies({"Název": "name", "IČO": "ico", "E-mail": "email"})]
        ),
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

    files = [("files", _csv(COMPANIES_CSV, "companies.csv"))]
    data = {
        "file_specs_json": json.dumps([_spec_companies({"Název": "name", "IČO": "ico"})]),
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

    files = [("files", _csv(COMPANIES_CSV, "companies.csv"))]
    data = {
        "file_specs_json": json.dumps(
            [_spec_companies({"Název": "name", "IČO": "ico", "E-mail": "email"})]
        ),
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

    files = [("files", _csv(COMBINED_CSV, "combined.csv"))]
    data = {
        "file_specs_json": json.dumps(
            [
                _spec_combined(
                    company_mapping={"FirmaNázev": "name", "FirmaIČO": "ico"},
                    contact_mapping={"Jméno": "first_name", "Příjmení": "last_name"},
                    match_key_contact="FirmaIČO",
                )
            ]
        ),
        "match_source": "ico",
    }
    r = await client.post(
        "/api/v1/admin/imports/preview", headers=_auth(admin), files=files, data=data
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["counts"]["companies_to_create"] == 2
    assert body["counts"]["contacts_to_create"] == 3
    assert body["counts"]["unmatched_contacts"] == 0


async def test_commit_separate_files_link_contacts_to_companies(
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
    files = [
        ("files", _csv(companies_csv, "companies.csv")),
        ("files", _csv(contacts_csv, "contacts.csv")),
    ]
    data = {
        "file_specs_json": json.dumps(
            [
                _spec_companies({"Název": "name", "IČO": "ico"}),
                _spec_contacts(
                    {"Jméno": "first_name", "Příjmení": "last_name"},
                    match_key_contact="FirmaIČO",
                ),
            ]
        ),
        "match_source": "ico",
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
        assert all(c.company_id is not None for c in contacts)


async def test_commit_contacts_only_links_to_existing_company(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """A contacts-only file attaches to a firm that already exists in the
    DB — no company file needed in the batch."""
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    existing = Company(organization_id=org.id, name="Acme s.r.o.", ico="12345678")
    db_session.add(existing)
    await db_session.commit()
    await db_session.refresh(existing)

    contacts_csv = "Jméno,Příjmení,FirmaIČO\nAnna,Nováková,12345678\n"
    files = [("files", _csv(contacts_csv, "contacts.csv"))]
    data = {
        "file_specs_json": json.dumps(
            [
                _spec_contacts(
                    {"Jméno": "first_name", "Příjmení": "last_name"},
                    match_key_contact="FirmaIČO",
                )
            ]
        ),
        "match_source": "ico",
        "skip_unmatched": "true",
    }
    r = await client.post(
        "/api/v1/admin/imports/commit", headers=_auth(admin), files=files, data=data
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["created_company_ids"]) == 0
    assert len(body["created_contact_ids"]) == 1

    async with AsyncSessionLocal() as s:
        contacts = (
            (await s.execute(select(Contact).where(Contact.organization_id == org.id)))
            .scalars()
            .all()
        )
        assert len(contacts) == 1
        assert contacts[0].company_id == existing.id


async def test_commit_combined_reupload_of_existing_company_links_contact(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """Combined row whose company already exists updates that firm and
    attaches the contact — the old double-match no longer fires."""
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    existing = Company(organization_id=org.id, name="Acme s.r.o.", ico="12345678")
    db_session.add(existing)
    await db_session.commit()
    await db_session.refresh(existing)

    combined_csv = "Název,IČO,Jméno,Příjmení\nAcme s.r.o.,12345678,Anna,Nováková\n"
    files = [("files", _csv(combined_csv, "combined.csv"))]
    data = {
        "file_specs_json": json.dumps(
            [
                _spec_combined(
                    {"Název": "name", "IČO": "ico"},
                    {"Jméno": "first_name", "Příjmení": "last_name"},
                    match_key_contact="IČO",
                )
            ]
        ),
        "match_source": "ico",
        "skip_unmatched": "false",
    }
    r = await client.post(
        "/api/v1/admin/imports/commit", headers=_auth(admin), files=files, data=data
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["counts"]["unmatched_contacts"] == 0
    assert not any(e["code"] == "ambiguous_match" for e in body["errors"])
    assert len(body["created_company_ids"]) == 0  # matched existing, not duplicated
    assert len(body["created_contact_ids"]) == 1

    async with AsyncSessionLocal() as s:
        companies = (
            (await s.execute(select(Company).where(Company.organization_id == org.id)))
            .scalars()
            .all()
        )
        assert len(companies) == 1  # no duplicate firm
        contacts = (
            (await s.execute(select(Contact).where(Contact.organization_id == org.id)))
            .scalars()
            .all()
        )
        assert len(contacts) == 1
        assert contacts[0].company_id == existing.id


async def test_preview_concatenates_two_companies_files(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)

    first = "Název,IČO\nFirst Co,11111118\n"
    second = "Název,IČO\nSecond Co,22222226\n"
    files = [
        ("files", _csv(first, "a.csv")),
        ("files", _csv(second, "b.csv")),
    ]
    data = {
        "file_specs_json": json.dumps(
            [
                _spec_companies({"Název": "name", "IČO": "ico"}),
                _spec_companies({"Název": "name", "IČO": "ico"}),
            ]
        ),
    }
    r = await client.post(
        "/api/v1/admin/imports/preview", headers=_auth(admin), files=files, data=data
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["counts"]["companies_to_create"] == 2


async def test_salesperson_cannot_import(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)

    files = [("files", _csv(COMPANIES_CSV, "companies.csv"))]
    data = {
        "file_specs_json": json.dumps([_spec_companies({"Název": "name"})]),
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
        f"Beta a.s.,87654321,{sales.email.upper()}\n"
    )
    files = [("files", _csv(csv, "companies.csv"))]
    data = {
        "file_specs_json": json.dumps(
            [_spec_companies({"Název": "name", "IČO": "ico", "Obchodník": "owner"})]
        ),
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
        assert all(c.owner_user_id == sales.id for c in companies)


async def test_preview_flags_owner_unknown(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)

    csv = "Název,IČO,Obchodník\nAcme s.r.o.,12345678,ghost@nikde.cz\n"
    files = [("files", _csv(csv, "companies.csv"))]
    data = {
        "file_specs_json": json.dumps(
            [_spec_companies({"Název": "name", "IČO": "ico", "Obchodník": "owner"})]
        ),
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

    files = [("files", _csv(COMPANIES_CSV, "companies.csv"))]
    data = {
        "file_specs_json": json.dumps(
            [_spec_companies({"Název": "name", "IČO": "ico", "E-mail": "email"})]
        ),
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
    files = [("files", _csv(csv, "companies.csv"))]
    data = {
        "file_specs_json": json.dumps(
            [_spec_companies({"Název": "name", "IČO": "ico", "Obchodník": "owner"})]
        ),
    }
    r = await client.post(
        "/api/v1/admin/imports/preview", headers=_auth(admin), files=files, data=data
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["counts"]["companies_to_create"] == 1
    assert body["counts"]["invalid_rows"] == 1
    assert any(e["code"] == "owner_cap_reached" for e in body["errors"])


async def test_invalid_mapping_returns_400_with_clear_message(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)

    files = [("files", _csv(COMPANIES_CSV, "companies.csv"))]
    data = {
        "file_specs_json": json.dumps([_spec_companies({"Název": "made_up_field"})]),
    }
    r = await client.post(
        "/api/v1/admin/imports/preview", headers=_auth(admin), files=files, data=data
    )
    assert r.status_code == 400
    assert "made_up_field" in r.json()["detail"]


async def test_file_specs_length_mismatch_returns_400(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)

    files = [("files", _csv(COMPANIES_CSV, "a.csv"))]
    # Two specs but only one file uploaded.
    data = {
        "file_specs_json": json.dumps(
            [
                _spec_companies({"Název": "name"}),
                _spec_companies({"Název": "name"}),
            ]
        ),
    }
    r = await client.post(
        "/api/v1/admin/imports/preview", headers=_auth(admin), files=files, data=data
    )
    assert r.status_code == 400
    assert "2 entries" in r.json()["detail"]


# --------------------------------------------------------------------------
# Deals (phase 1 of the Pipedrive migration). The synthetic Pipedrive
# fixtures under tests/fixtures/pipedrive/ are the inputs; they double as
# the phase-4 regression corpus.
# --------------------------------------------------------------------------


def _fixture_upload(name: str) -> tuple[str, io.BytesIO, str]:
    return (name, io.BytesIO(FIXTURES.joinpath(name).read_bytes()), "text/csv")


async def _seed_pipeline(org: Organization) -> dict[str, uuid.UUID]:
    """Default pipeline (3 open stages + 1 won) → `{stage name: id}`."""
    async with AsyncSessionLocal() as s:
        pipeline = await create_default_pipeline(s, org.id)
        await s.commit()
        stages = (
            (await s.execute(select(Stage).where(Stage.pipeline_id == pipeline.id))).scalars().all()
        )
        return {stage.name: stage.id for stage in stages}


_DEAL_MAPPING_EN = {
    "Deal - Title*": "name",
    "Deal - Value": "value",
    "Deal - Currency of value": "currency",
    "Deal - Status": "status",
    "Deal - Stage (pipeline)": "stage",
    "Deal - Expected close date": "expected_close_date",
    "Deal - Won time": "won_time",
    "Deal - Lost time": "lost_time",
    "Deal - Closed on": "closed_on",
    "Deal - Lost reason": "lost_reason",
    "Organization": "company",
    "Contact person": "contact",
    "Deal - Owner": "owner",
    "Deal - Pipedrive System ID": "external_id",
}


def _deals_form(
    stage_mapping: dict[str, uuid.UUID],
    *,
    mapping: dict[str, str] | None = None,
) -> dict[str, str]:
    return {
        "file_specs_json": json.dumps(
            [{"role": "deals", "mapping_deal": mapping or _DEAL_MAPPING_EN}]
        ),
        "stage_mapping_json": json.dumps({k: str(v) for k, v in stage_mapping.items()}),
    }


async def test_fields_catalog_includes_the_deal_side(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)

    r = await client.get("/api/v1/admin/imports/fields", headers=_auth(admin))
    assert r.status_code == 200
    keys = {f["key"] for f in r.json()["deal"]}
    assert {
        "name",
        "value",
        "currency",
        "expected_close_date",
        "stage",
        "status",
        "lost_reason",
        "company",
        "contact",
        "owner",
        "external_id",
        "note",
    }.issubset(keys)
    # `deals.note` landed in phase 2b, so every side can park a custom column.
    assert "note_append" in {f["key"] for f in r.json()["company"]}
    assert "note_append" in keys


async def test_providers_endpoint_lists_pipedrive_and_generic(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)

    r = await client.get("/api/v1/admin/imports/providers", headers=_auth(admin))
    assert r.status_code == 200
    providers = {p["key"]: p for p in r.json()["providers"]}
    assert providers["pipedrive"]["label"] == "Pipedrive"
    assert "deals" in providers["pipedrive"]["roles"]
    assert "generic" in providers


async def test_analyze_detects_role_and_prefills_mapping(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    await _seed_pipeline(org)

    r = await client.post(
        "/api/v1/admin/imports/analyze",
        headers=_auth(admin),
        files=[("files", _fixture_upload("deals_cs.csv"))],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["provider"] == "pipedrive"
    (file_out,) = body["files"]
    assert file_out["detected_role"] == "deals"
    assert file_out["suggested_mappings"]["deal"]["Obchod - Název*"] == "name"
    assert file_out["stage_header"] == "Obchod - Fáze"
    assert set(file_out["stage_values"]) == {"Kvalifikace", "Jednání"}
    # "Jednání" is a default stage name, so it is pre-guessed; "Kvalifikace"
    # is not, so the wizard must make the admin pick.
    suggestions = body["stage_suggestions"]
    assert suggestions["Jednání"] is not None
    assert {s["name"] for s in body["stages"]} >= {"Nový lead", "Jednání", "Vyhráno"}


async def test_stage_suggestions_endpoint_matches_by_name(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    stages = await _seed_pipeline(org)

    r = await client.post(
        "/api/v1/admin/imports/stage-suggestions",
        headers=_auth(admin),
        json={"values": ["novy lead", "Won", "Zcela neznámá fáze"]},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["suggestions"]["novy lead"] == str(stages["Nový lead"])
    assert body["suggestions"]["Won"] == str(stages["Vyhráno"])
    assert body["suggestions"]["Zcela neznámá fáze"] is None


async def test_deal_status_semantics_land_in_the_database(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """The regression the spec singles out: a LOST deal must keep an
    open-type stage and carry closed_at + lost_reason, or `status=lost`
    filtering, the forecast and the funnel all silently break."""
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    stages = await _seed_pipeline(org)

    data = _deals_form({"Qualified": stages["Nový lead"], "Negotiation": stages["Jednání"]})
    r = await client.post(
        "/api/v1/admin/imports/commit",
        headers=_auth(admin),
        files=[("files", _fixture_upload("deals_en.csv"))],
        data=data,
    )
    assert r.status_code == 200, r.text
    assert len(r.json()["created_deal_ids"]) == 3

    async with AsyncSessionLocal() as s:
        rows = (
            (
                await s.execute(
                    select(Deal).where(Deal.organization_id == org.id).order_by(Deal.name)
                )
            )
            .scalars()
            .all()
        )
        by_name = {d.name: d for d in rows}
        stage_types = {}
        for deal in rows:
            stage = await s.get(Stage, deal.stage_id)
            assert stage is not None
            stage_types[deal.name] = stage.stage_type

        open_deal = by_name["New website"]
        assert stage_types["New website"] is StageType.open
        assert open_deal.closed_at is None
        assert open_deal.lost_reason is None
        assert open_deal.stage_id == stages["Nový lead"]
        assert open_deal.value == Decimal("120000.00")
        assert open_deal.expected_close_date == date(2026, 9, 30)

        won = by_name["Rollout phase 2"]
        # Mapped to an OPEN stage in the file; the Won status wins.
        assert stage_types["Rollout phase 2"] is StageType.won
        assert won.stage_id == stages["Vyhráno"]
        assert won.closed_at is not None
        assert won.closed_at.date() == date(2026, 6, 15)
        assert won.lost_reason is None

        lost = by_name["Support renewal"]
        assert stage_types["Support renewal"] is StageType.open
        assert lost.stage_id == stages["Nový lead"]
        assert lost.closed_at is not None
        assert lost.closed_at.date() == date(2026, 5, 20)
        assert lost.lost_reason == "Too expensive"

        # No fabricated timeline entries for imported deals — an import
        # deliberately does NOT mirror mark-won/mark-lost activity writes.
        activities = (
            (await s.execute(select(Activity).where(Activity.organization_id == org.id)))
            .scalars()
            .all()
        )
        assert activities == []


async def test_unmapped_stage_blocks_the_row_and_is_reported(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    stages = await _seed_pipeline(org)

    # "Qualified" deliberately left out of the mapping.
    data = _deals_form({"Negotiation": stages["Jednání"]})
    r = await client.post(
        "/api/v1/admin/imports/preview",
        headers=_auth(admin),
        files=[("files", _fixture_upload("deals_en.csv"))],
        data=data,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["unmapped_stage_values"] == ["Qualified"]
    assert body["counts"]["invalid_rows"] == 2
    assert body["counts"]["deals_to_create"] == 1
    assert {e["code"] for e in body["errors"] if e["side"] == "deal"} == {"stage_unmapped"}
    # Only the surviving deal's company is invented; a blocked row must not
    # leave an orphan company behind ("Gamma GmbH" belongs to a blocked row).
    assert body["counts"]["companies_from_deals_to_create"] == 1


async def test_deal_creates_the_company_it_names(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """A deals-only export must not fail because nobody exported the
    organizations file — `deals.company_id` is NOT NULL."""
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    stages = await _seed_pipeline(org)
    db_session.add(Company(organization_id=org.id, name="Acme Ltd"))
    await db_session.commit()

    data = _deals_form({"Qualified": stages["Nový lead"], "Negotiation": stages["Jednání"]})
    preview = await client.post(
        "/api/v1/admin/imports/preview",
        headers=_auth(admin),
        files=[("files", _fixture_upload("deals_en.csv"))],
        data=data,
    )
    assert preview.status_code == 200, preview.text
    # Acme Ltd already exists; only Gamma GmbH is invented from a deal row.
    assert preview.json()["counts"]["companies_from_deals_to_create"] == 1

    commit = await client.post(
        "/api/v1/admin/imports/commit",
        headers=_auth(admin),
        files=[("files", _fixture_upload("deals_en.csv"))],
        data=data,
    )
    assert commit.status_code == 200, commit.text

    async with AsyncSessionLocal() as s:
        names = set(
            (await s.execute(select(Company.name).where(Company.organization_id == org.id)))
            .scalars()
            .all()
        )
        assert names == {"Acme Ltd", "Gamma GmbH"}
        gamma = (
            (
                await s.execute(
                    select(Company).where(
                        Company.organization_id == org.id, Company.name == "Gamma GmbH"
                    )
                )
            )
            .scalars()
            .one()
        )
        # Auto-created companies stay unowned — the per-user cap arithmetic
        # runs on the company phase, before deals are resolved.
        assert gamma.owner_user_id is None
        lost = (
            (
                await s.execute(
                    select(Deal).where(
                        Deal.organization_id == org.id, Deal.name == "Support renewal"
                    )
                )
            )
            .scalars()
            .one()
        )
        assert lost.company_id == gamma.id


async def test_currency_mismatch_warns_once_with_a_count(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    stages = await _seed_pipeline(org)

    csv_text = "Title,Value,Currency,Company\nA,100,USD,Acme\nB,200,USD,Acme\nC,300,CZK,Acme\n"
    data = {
        "file_specs_json": json.dumps(
            [
                {
                    "role": "deals",
                    "mapping_deal": {
                        "Title": "name",
                        "Value": "value",
                        "Currency": "currency",
                        "Company": "company",
                    },
                }
            ]
        ),
        "stage_mapping_json": json.dumps({}),
    }
    assert stages  # pipeline must exist for the default open stage
    r = await client.post(
        "/api/v1/admin/imports/preview",
        headers=_auth(admin),
        files=[("files", _csv(csv_text, "deals.csv"))],
        data=data,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["org_currency"] == "CZK"
    assert body["currency_mismatches"] == [{"currency": "USD", "count": 2}]
    assert body["counts"]["deals_to_create"] == 3


async def test_deal_contact_link_is_optional_and_only_warns(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    stages = await _seed_pipeline(org)
    company = Company(organization_id=org.id, name="Acme Ltd")
    db_session.add(company)
    await db_session.commit()
    await db_session.refresh(company)
    db_session.add(
        Contact(
            organization_id=org.id,
            company_id=company.id,
            first_name="Anna",
            last_name="Novakova",
            email="anna@acme.cz",
        )
    )
    await db_session.commit()

    data = _deals_form({"Qualified": stages["Nový lead"], "Negotiation": stages["Jednání"]})
    r = await client.post(
        "/api/v1/admin/imports/commit",
        headers=_auth(admin),
        files=[("files", _fixture_upload("deals_en.csv"))],
        data=data,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # All three deals land even though two name no contact at all.
    assert len(body["created_deal_ids"]) == 3

    async with AsyncSessionLocal() as s:
        website = (
            (
                await s.execute(
                    select(Deal).where(Deal.organization_id == org.id, Deal.name == "New website")
                )
            )
            .scalars()
            .one()
        )
        assert website.primary_contact_id is not None
        rollout = (
            (
                await s.execute(
                    select(Deal).where(
                        Deal.organization_id == org.id, Deal.name == "Rollout phase 2"
                    )
                )
            )
            .scalars()
            .one()
        )
        assert rollout.primary_contact_id is None


async def test_unknown_deal_contact_is_a_warning_not_a_blocked_row(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    stages = await _seed_pipeline(org)
    assert stages

    csv_text = "Title,Company,Contact\nA,Acme,nikdo@nikde.cz\n"
    data = {
        "file_specs_json": json.dumps(
            [
                {
                    "role": "deals",
                    "mapping_deal": {"Title": "name", "Company": "company", "Contact": "contact"},
                }
            ]
        ),
    }
    r = await client.post(
        "/api/v1/admin/imports/preview",
        headers=_auth(admin),
        files=[("files", _csv(csv_text, "deals.csv"))],
        data=data,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["counts"]["deals_to_create"] == 1
    assert body["counts"]["invalid_rows"] == 0
    assert [e["code"] for e in body["errors"]] == ["contact_unmatched"]


async def test_deal_without_a_company_is_blocked(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    assert await _seed_pipeline(org)

    csv_text = "Title,Company\nA,\n"
    data = {
        "file_specs_json": json.dumps(
            [{"role": "deals", "mapping_deal": {"Title": "name", "Company": "company"}}]
        ),
    }
    r = await client.post(
        "/api/v1/admin/imports/preview",
        headers=_auth(admin),
        files=[("files", _csv(csv_text, "deals.csv"))],
        data=data,
    )
    body = r.json()
    assert body["counts"]["deals_to_create"] == 0
    assert body["counts"]["invalid_rows"] == 1
    assert [e["code"] for e in body["errors"]] == ["company_missing"]


async def test_stage_mapping_pointing_outside_the_org_is_a_400(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    assert await _seed_pipeline(org)

    data = _deals_form({"Qualified": uuid.uuid4(), "Negotiation": uuid.uuid4()})
    r = await client.post(
        "/api/v1/admin/imports/preview",
        headers=_auth(admin),
        files=[("files", _fixture_upload("deals_en.csv"))],
        data=data,
    )
    assert r.status_code == 400
    assert "outside this organization" in r.json()["detail"]


async def test_note_append_lands_on_the_imported_company(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)

    data = {
        "file_specs_json": json.dumps(
            [
                {
                    "role": "companies",
                    "mapping_company": {
                        "Organization - Name*": "name",
                        "Organization - Address": "address_street",
                        "Organization - Label": "note_append",
                        "Organization - Pipedrive System ID": "note_append",
                    },
                }
            ]
        ),
    }
    r = await client.post(
        "/api/v1/admin/imports/commit",
        headers=_auth(admin),
        files=[("files", _fixture_upload("organizations_en.csv"))],
        data=data,
    )
    assert r.status_code == 200, r.text

    async with AsyncSessionLocal() as s:
        acme = (
            (
                await s.execute(
                    select(Company).where(
                        Company.organization_id == org.id, Company.name == "Acme Ltd"
                    )
                )
            )
            .scalars()
            .one()
        )
        assert acme.note is not None
        assert acme.note.splitlines() == [
            "Organization - Label: Customer",
            "Organization - Pipedrive System ID: 101",
        ]


async def test_deal_custom_columns_land_in_the_deal_note(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """Phase 2b: the deal side gained `note_append` along with `deals.note`.

    The two unmapped Pipedrive custom columns are record *attributes*, so
    they belong in the column — not in the activity log, which would dress
    them up as things that happened at migration time.
    """
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    stages = await _seed_pipeline(org)

    mapping = {
        **_DEAL_MAPPING_EN,
        "Deal - Label": "note_append",
        "Deal - Probability": "note_append",
    }
    data = _deals_form(
        {"Qualified": stages["Nový lead"], "Negotiation": stages["Jednání"]},
        mapping=mapping,
    )
    r = await client.post(
        "/api/v1/admin/imports/commit",
        headers=_auth(admin),
        files=[("files", _fixture_upload("deals_en.csv"))],
        data=data,
    )
    assert r.status_code == 200, r.text

    async with AsyncSessionLocal() as s:
        rows = (
            (
                await s.execute(
                    select(Deal).where(Deal.organization_id == org.id).order_by(Deal.name)
                )
            )
            .scalars()
            .all()
        )
        by_name = {d.name: d for d in rows}
        assert by_name["New website"].note is not None
        assert by_name["New website"].note.splitlines() == [
            "Deal - Label: Hot",
            "Deal - Probability: 70",
        ]
        # An empty custom cell contributes no line.
        assert by_name["Support renewal"].note == "Deal - Probability: 10"

        # And nothing became a timeline event: the column is the field, the
        # `ActivityType.note` rows are the running commentary.
        activities = (
            (await s.execute(select(Activity).where(Activity.organization_id == org.id)))
            .scalars()
            .all()
        )
        assert activities == []
