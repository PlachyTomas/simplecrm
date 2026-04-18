"""Integration tests for /api/v1/contacts/*."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import Company, Contact, Organization, User, UserRole
from app.db.session import AsyncSessionLocal


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
