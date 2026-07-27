"""Integration tests for /api/v1/contacts/*."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import Company, Contact, Deal, Organization, Stage, StageType, User, UserRole
from app.db.session import AsyncSessionLocal
from app.services.pipeline import create_default_pipeline


@pytest.fixture
async def owned_cleanup() -> AsyncIterator[dict[str, list]]:
    tracked: dict[str, list] = {"orgs": [], "emails": []}
    yield tracked
    async with AsyncSessionLocal() as session:
        if tracked["emails"]:
            await session.execute(delete(User).where(User.email.in_(tracked["emails"])))
        if tracked["orgs"]:
            await session.execute(delete(Organization).where(Organization.id.in_(tracked["orgs"])))
        await session.commit()


async def _seed_org(session: AsyncSession, owned_cleanup: dict[str, list]) -> Organization:
    org = Organization(name=f"Org-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.commit()
    await session.refresh(org)
    owned_cleanup["orgs"].append(org.id)
    return org


async def _seed_user(
    session: AsyncSession,
    owned_cleanup: dict[str, list],
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
    return {
        "Authorization": f"Bearer {create_access_token(user.id, user.organization_id, user.role)}"
    }


async def _seed_stages(session: AsyncSession, org: Organization) -> tuple[Stage, Stage]:
    """Provision the org's default pipeline and return (open_stage, won_stage)."""
    pipeline = await create_default_pipeline(session, org.id)
    await session.commit()
    await session.refresh(pipeline, attribute_names=["stages"])
    open_stage = next(s for s in pipeline.stages if s.stage_type == StageType.open)
    won_stage = next(s for s in pipeline.stages if s.stage_type == StageType.won)
    return open_stage, won_stage


# list_contacts ------------------------------------------------------------


async def test_list_contacts_happy(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    db_session.add_all(
        [
            Contact(
                organization_id=org.id,
                first_name="Jan",
                last_name="Novák",
                email=f"a-{uuid.uuid4().hex[:6]}@ex.cz",
            ),
            Contact(
                organization_id=org.id,
                first_name="Jana",
                last_name="Svobodová",
                email=f"b-{uuid.uuid4().hex[:6]}@ex.cz",
            ),
        ]
    )
    await db_session.commit()
    response = await client.get("/api/v1/contacts", headers=_auth(user))
    assert response.status_code == 200
    assert response.json()["total"] == 2


async def test_list_contacts_cross_org_isolated(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    first = await _seed_org(db_session, owned_cleanup)
    second = await _seed_org(db_session, owned_cleanup)
    first_user = await _seed_user(db_session, owned_cleanup, first, UserRole.admin)
    db_session.add(
        Contact(
            organization_id=second.id,
            first_name="Not",
            last_name="Visible",
            email=f"hidden-{uuid.uuid4().hex[:6]}@ex.cz",
        )
    )
    await db_session.commit()
    response = await client.get("/api/v1/contacts", headers=_auth(first_user))
    assert response.status_code == 200
    assert response.json()["total"] == 0


async def test_list_contacts_rejects_missing_token(client: AsyncClient) -> None:
    response = await client.get("/api/v1/contacts")
    assert response.status_code == 401


# get_contact --------------------------------------------------------------


async def test_get_contact_happy(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    contact = Contact(
        organization_id=org.id,
        first_name="Jan",
        last_name="Novák",
        email=f"j-{uuid.uuid4().hex[:6]}@ex.cz",
    )
    db_session.add(contact)
    await db_session.commit()
    response = await client.get(f"/api/v1/contacts/{contact.id}", headers=_auth(user))
    assert response.status_code == 200
    assert response.json()["first_name"] == "Jan"


async def test_get_contact_cross_org_denied(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    first = await _seed_org(db_session, owned_cleanup)
    second = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, first, UserRole.admin)
    contact = Contact(
        organization_id=second.id,
        first_name="Alien",
        last_name="Visitor",
        email=f"x-{uuid.uuid4().hex[:6]}@ex.cz",
    )
    db_session.add(contact)
    await db_session.commit()
    response = await client.get(f"/api/v1/contacts/{contact.id}", headers=_auth(user))
    assert response.status_code == 404


async def test_get_contact_missing_returns_404(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    response = await client.get(f"/api/v1/contacts/{uuid.uuid4()}", headers=_auth(user))
    assert response.status_code == 404


# create_contact -----------------------------------------------------------


async def test_create_contact_happy(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    email = f"new-{uuid.uuid4().hex[:6]}@ex.cz"
    response = await client.post(
        "/api/v1/contacts",
        headers=_auth(user),
        json={"first_name": "Petr", "last_name": "Svoboda", "email": email},
    )
    assert response.status_code == 201


async def test_create_contact_validation_error(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    response = await client.post(
        "/api/v1/contacts",
        headers=_auth(user),
        json={"first_name": "", "last_name": "X", "email": "not-an-email"},
    )
    assert response.status_code == 422


async def test_create_contact_duplicate_email_409(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    email = f"dup-{uuid.uuid4().hex[:6]}@ex.cz"
    db_session.add(Contact(organization_id=org.id, first_name="A", last_name="B", email=email))
    await db_session.commit()
    response = await client.post(
        "/api/v1/contacts",
        headers=_auth(user),
        json={"first_name": "C", "last_name": "D", "email": email},
    )
    assert response.status_code == 409


async def test_create_contact_rejects_cross_org_company(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    first = await _seed_org(db_session, owned_cleanup)
    second = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, first, UserRole.salesperson)
    foreign = Company(organization_id=second.id, name="Cizí")
    db_session.add(foreign)
    await db_session.commit()
    response = await client.post(
        "/api/v1/contacts",
        headers=_auth(user),
        json={
            "first_name": "Eva",
            "last_name": "Nová",
            "email": f"eva-{uuid.uuid4().hex[:6]}@ex.cz",
            "company_id": str(foreign.id),
        },
    )
    assert response.status_code == 400


# update_contact -----------------------------------------------------------


async def test_update_contact_happy(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    contact = Contact(
        organization_id=org.id,
        first_name="Jan",
        last_name="Starý",
        email=f"old-{uuid.uuid4().hex[:6]}@ex.cz",
    )
    db_session.add(contact)
    await db_session.commit()
    response = await client.put(
        f"/api/v1/contacts/{contact.id}",
        headers=_auth(user),
        json={"last_name": "Nový"},
    )
    assert response.status_code == 200
    assert response.json()["last_name"] == "Nový"


async def test_update_contact_validation_error(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    contact = Contact(
        organization_id=org.id,
        first_name="Jan",
        last_name="N",
        email=f"u-{uuid.uuid4().hex[:6]}@ex.cz",
    )
    db_session.add(contact)
    await db_session.commit()
    response = await client.put(
        f"/api/v1/contacts/{contact.id}",
        headers=_auth(user),
        json={"email": "not-valid"},
    )
    assert response.status_code == 422


async def test_update_contact_cross_org_denied(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    first = await _seed_org(db_session, owned_cleanup)
    second = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, first, UserRole.admin)
    contact = Contact(
        organization_id=second.id,
        first_name="X",
        last_name="Y",
        email=f"c-{uuid.uuid4().hex[:6]}@ex.cz",
    )
    db_session.add(contact)
    await db_session.commit()
    response = await client.put(
        f"/api/v1/contacts/{contact.id}",
        headers=_auth(user),
        json={"first_name": "Hijack"},
    )
    assert response.status_code == 404


# delete_contact -----------------------------------------------------------


async def test_delete_contact_admin_ok(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    contact = Contact(
        organization_id=org.id,
        first_name="D",
        last_name="D",
        email=f"d-{uuid.uuid4().hex[:6]}@ex.cz",
    )
    db_session.add(contact)
    await db_session.commit()
    response = await client.delete(f"/api/v1/contacts/{contact.id}", headers=_auth(admin))
    assert response.status_code == 204


async def test_delete_contact_non_admin_forbidden(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    contact = Contact(
        organization_id=org.id,
        first_name="N",
        last_name="N",
        email=f"n-{uuid.uuid4().hex[:6]}@ex.cz",
    )
    db_session.add(contact)
    await db_session.commit()
    response = await client.delete(f"/api/v1/contacts/{contact.id}", headers=_auth(sales))
    assert response.status_code == 403


async def test_delete_contact_rejects_missing_token(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    contact = Contact(
        organization_id=org.id,
        first_name="M",
        last_name="M",
        email=f"m-{uuid.uuid4().hex[:6]}@ex.cz",
    )
    db_session.add(contact)
    await db_session.commit()
    response = await client.delete(f"/api/v1/contacts/{contact.id}")
    assert response.status_code == 401


async def test_delete_contact_company_owner_salesperson_ok(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """A salesperson who owns the contact's company may delete it."""
    org = await _seed_org(db_session, owned_cleanup)
    owner = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    company = Company(organization_id=org.id, name="Owned", owner_user_id=owner.id)
    db_session.add(company)
    await db_session.commit()
    contact = Contact(
        organization_id=org.id,
        company_id=company.id,
        first_name="X",
        last_name="Y",
        email=f"co-{uuid.uuid4().hex[:6]}@ex.cz",
    )
    db_session.add(contact)
    await db_session.commit()
    response = await client.delete(f"/api/v1/contacts/{contact.id}", headers=_auth(owner))
    assert response.status_code == 204


async def test_delete_contact_non_owner_salesperson_forbidden(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """A salesperson who does NOT own the contact's company is rejected."""
    org = await _seed_org(db_session, owned_cleanup)
    owner = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    other = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    company = Company(organization_id=org.id, name="Owned", owner_user_id=owner.id)
    db_session.add(company)
    await db_session.commit()
    contact = Contact(
        organization_id=org.id,
        company_id=company.id,
        first_name="X",
        last_name="Y",
        email=f"no-{uuid.uuid4().hex[:6]}@ex.cz",
    )
    db_session.add(contact)
    await db_session.commit()
    response = await client.delete(f"/api/v1/contacts/{contact.id}", headers=_auth(other))
    assert response.status_code == 403
    assert "owner of the contact's company" in response.json()["detail"]


async def test_delete_contact_company_less_salesperson_forbidden(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """A company-less contact is admin-only — a salesperson cannot delete it."""
    org = await _seed_org(db_session, owned_cleanup)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    contact = Contact(
        organization_id=org.id,
        company_id=None,
        first_name="Or",
        last_name="Phan",
        email=f"orph-{uuid.uuid4().hex[:6]}@ex.cz",
    )
    db_session.add(contact)
    await db_session.commit()
    response = await client.delete(f"/api/v1/contacts/{contact.id}", headers=_auth(sales))
    assert response.status_code == 403


# has_open_deals filter + company_name -------------------------------------


async def test_list_contacts_has_open_deals_filter(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    open_stage, won_stage = await _seed_stages(db_session, org)

    open_co = Company(organization_id=org.id, name="OpenCo", owner_user_id=admin.id)
    won_co = Company(organization_id=org.id, name="WonCo", owner_user_id=admin.id)
    lost_co = Company(organization_id=org.id, name="LostCo", owner_user_id=admin.id)
    none_co = Company(organization_id=org.id, name="NoneCo", owner_user_id=admin.id)
    db_session.add_all([open_co, won_co, lost_co, none_co])
    await db_session.commit()

    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=open_co.id,
                stage_id=open_stage.id,
                name="D-open",
                value=Decimal("1"),
                currency="CZK",
            ),
            Deal(
                organization_id=org.id,
                company_id=won_co.id,
                stage_id=won_stage.id,
                name="D-won",
                value=Decimal("1"),
                currency="CZK",
            ),
            # Lost deal: open-type stage but closed (closed_at + lost_reason).
            # Its contact must NOT surface under the open-deals filter.
            Deal(
                organization_id=org.id,
                company_id=lost_co.id,
                stage_id=open_stage.id,
                name="D-lost",
                value=Decimal("1"),
                currency="CZK",
                closed_at=datetime.now(tz=UTC),
                lost_reason="Konkurence",
            ),
        ]
    )
    db_session.add_all(
        [
            Contact(
                organization_id=org.id,
                company_id=open_co.id,
                first_name="A",
                last_name="Open",
                email=f"open-{uuid.uuid4().hex[:6]}@ex.cz",
            ),
            Contact(
                organization_id=org.id,
                company_id=won_co.id,
                first_name="B",
                last_name="Won",
                email=f"won-{uuid.uuid4().hex[:6]}@ex.cz",
            ),
            Contact(
                organization_id=org.id,
                company_id=lost_co.id,
                first_name="E",
                last_name="Lost",
                email=f"lost-{uuid.uuid4().hex[:6]}@ex.cz",
            ),
            Contact(
                organization_id=org.id,
                company_id=none_co.id,
                first_name="C",
                last_name="None",
                email=f"none-{uuid.uuid4().hex[:6]}@ex.cz",
            ),
            Contact(
                organization_id=org.id,
                company_id=None,
                first_name="D",
                last_name="Orphan",
                email=f"orphan-{uuid.uuid4().hex[:6]}@ex.cz",
            ),
        ]
    )
    await db_session.commit()

    filtered = await client.get("/api/v1/contacts?has_open_deals=true", headers=_auth(admin))
    assert filtered.status_code == 200
    body = filtered.json()
    assert body["total"] == 1
    assert {it["last_name"] for it in body["items"]} == {"Open"}
    # The surfaced contact carries its company name.
    assert body["items"][0]["company_name"] == "OpenCo"

    # Omitted filter -> all five contacts visible.
    unfiltered = await client.get("/api/v1/contacts", headers=_auth(admin))
    assert unfiltered.json()["total"] == 5


async def test_contact_company_name_in_list_and_detail(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = Company(organization_id=org.id, name="Acme s.r.o.", owner_user_id=admin.id)
    db_session.add(company)
    await db_session.commit()
    linked = Contact(
        organization_id=org.id,
        company_id=company.id,
        first_name="Lin",
        last_name="Ked",
        email=f"lin-{uuid.uuid4().hex[:6]}@ex.cz",
    )
    orphan = Contact(
        organization_id=org.id,
        company_id=None,
        first_name="Or",
        last_name="Phan",
        email=f"orph-{uuid.uuid4().hex[:6]}@ex.cz",
    )
    db_session.add_all([linked, orphan])
    await db_session.commit()

    listed = await client.get("/api/v1/contacts", headers=_auth(admin))
    assert listed.status_code == 200
    rows = {it["id"]: it for it in listed.json()["items"]}
    assert rows[str(linked.id)]["company_name"] == "Acme s.r.o."
    assert rows[str(orphan.id)]["company_name"] is None

    detail = await client.get(f"/api/v1/contacts/{linked.id}", headers=_auth(admin))
    assert detail.status_code == 200
    assert detail.json()["company_name"] == "Acme s.r.o."

    detail_orphan = await client.get(f"/api/v1/contacts/{orphan.id}", headers=_auth(admin))
    assert detail_orphan.status_code == 200
    assert detail_orphan.json()["company_name"] is None


async def test_create_and_update_contact_return_company_name(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = Company(organization_id=org.id, name="Globex", owner_user_id=admin.id)
    db_session.add(company)
    await db_session.commit()

    created = await client.post(
        "/api/v1/contacts",
        headers=_auth(admin),
        json={
            "first_name": "New",
            "last_name": "Person",
            "email": f"np-{uuid.uuid4().hex[:6]}@ex.cz",
            "company_id": str(company.id),
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["company_name"] == "Globex"

    contact_id = created.json()["id"]
    updated = await client.put(
        f"/api/v1/contacts/{contact_id}",
        headers=_auth(admin),
        json={"company_id": None},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["company_name"] is None


# export.csv -----------------------------------------------------------------


async def test_export_contacts_csv_happy(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    contact = Contact(
        organization_id=org.id,
        first_name="Export",
        last_name="Mě",
        email=f"exp-{uuid.uuid4().hex[:6]}@ex.cz",
    )
    db_session.add(contact)
    await db_session.commit()

    r = await client.get("/api/v1/contacts/export.csv", headers=_auth(admin))
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    text = r.content.decode("utf-8")
    assert text.startswith("﻿"), "expected UTF-8 BOM for Excel"
    header_row = text.lstrip("﻿").splitlines()[0]
    assert header_row.split(",")[0] == "jméno"
    assert "Export" in text and "Mě" in text

    today = datetime.now(tz=UTC).date().isoformat()
    assert f'filename="simplecrm-contacts-{today}.csv"' in r.headers["content-disposition"]
    assert "attachment" in r.headers["content-disposition"]


async def test_export_contacts_csv_respects_company_id_filter(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company_a = Company(organization_id=org.id, name="A co")
    company_b = Company(organization_id=org.id, name="B co")
    db_session.add_all([company_a, company_b])
    await db_session.commit()
    db_session.add_all(
        [
            Contact(
                organization_id=org.id,
                company_id=company_a.id,
                first_name="Alfa-unique",
                last_name="Contact",
                email=f"a-{uuid.uuid4().hex[:6]}@ex.cz",
            ),
            Contact(
                organization_id=org.id,
                company_id=company_b.id,
                first_name="Beta-unique",
                last_name="Contact",
                email=f"b-{uuid.uuid4().hex[:6]}@ex.cz",
            ),
        ]
    )
    await db_session.commit()

    r = await client.get(
        f"/api/v1/contacts/export.csv?company_id={company_a.id}", headers=_auth(admin)
    )
    assert r.status_code == 200
    text = r.content.decode("utf-8")
    assert "Alfa-unique" in text
    assert "Beta-unique" not in text


async def test_export_contacts_csv_respects_has_open_deals_filter(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    open_stage, _won_stage = await _seed_stages(db_session, org)
    open_co = Company(organization_id=org.id, name="OpenCo export")
    none_co = Company(organization_id=org.id, name="NoneCo export")
    db_session.add_all([open_co, none_co])
    await db_session.commit()
    db_session.add(
        Deal(
            organization_id=org.id,
            company_id=open_co.id,
            stage_id=open_stage.id,
            name="D-open",
            value=Decimal("1"),
            currency="CZK",
        )
    )
    db_session.add_all(
        [
            Contact(
                organization_id=org.id,
                company_id=open_co.id,
                first_name="Has-open-unique",
                last_name="Contact",
                email=f"ho-{uuid.uuid4().hex[:6]}@ex.cz",
            ),
            Contact(
                organization_id=org.id,
                company_id=none_co.id,
                first_name="No-deal-unique",
                last_name="Contact",
                email=f"nd-{uuid.uuid4().hex[:6]}@ex.cz",
            ),
        ]
    )
    await db_session.commit()

    r = await client.get("/api/v1/contacts/export.csv?has_open_deals=true", headers=_auth(admin))
    assert r.status_code == 200
    text = r.content.decode("utf-8")
    assert "Has-open-unique" in text
    assert "No-deal-unique" not in text
