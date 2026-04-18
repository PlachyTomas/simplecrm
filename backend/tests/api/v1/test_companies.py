"""Integration tests for /api/v1/companies/*.

Endpoint commits mean the rollback fixture can't isolate data. Each test
seeds with UUID-suffixed names/emails and tears down via `owned_cleanup`.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import Company, Organization, Team, User, UserRole
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


async def _seed_org(
    session: AsyncSession,
    owned_cleanup: dict[str, list],
    *,
    name: str | None = None,
) -> Organization:
    org = Organization(name=name or f"Org-{uuid.uuid4().hex[:6]}")
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
    *,
    team_id: uuid.UUID | None = None,
) -> User:
    email = f"u-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    user = User(
        email=email,
        name="User",
        role=role,
        organization_id=org.id,
        team_id=team_id,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


def _auth(user: User) -> dict[str, str]:
    token = create_access_token(user.id, user.organization_id, user.role)
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# list_companies
# ---------------------------------------------------------------------------


async def test_list_companies_happy_admin_sees_all_in_org(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    db_session.add_all(
        [
            Company(organization_id=org.id, name="Mine", owner_user_id=admin.id),
            Company(organization_id=org.id, name="Sales", owner_user_id=sales.id),
            Company(organization_id=org.id, name="Pool", owner_user_id=None),
        ]
    )
    await db_session.commit()

    response = await client.get("/api/v1/companies", headers=_auth(admin))
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3
    names = {it["name"] for it in body["items"]}
    assert names == {"Mine", "Sales", "Pool"}


async def test_list_companies_permission_salesperson_scoped(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    team = Team(organization_id=org.id, name="T1")
    db_session.add(team)
    await db_session.commit()
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson, team_id=team.id)
    other = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    db_session.add_all(
        [
            Company(organization_id=org.id, name="Mine", owner_user_id=sales.id),
            Company(organization_id=org.id, name="Theirs", owner_user_id=other.id),
            Company(organization_id=org.id, name="Pool"),
        ]
    )
    await db_session.commit()

    response = await client.get("/api/v1/companies", headers=_auth(sales))
    assert response.status_code == 200
    names = {it["name"] for it in response.json()["items"]}
    assert names == {"Mine", "Pool"}


async def test_list_companies_validation_bad_limit(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    response = await client.get("/api/v1/companies?limit=999", headers=_auth(admin))
    assert response.status_code == 422


async def test_list_companies_rejects_missing_token(client: AsyncClient) -> None:
    response = await client.get("/api/v1/companies")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# get_company
# ---------------------------------------------------------------------------


async def test_get_company_happy(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = Company(organization_id=org.id, name="Target", owner_user_id=admin.id)
    db_session.add(company)
    await db_session.commit()

    response = await client.get(f"/api/v1/companies/{company.id}", headers=_auth(admin))
    assert response.status_code == 200
    assert response.json()["name"] == "Target"


async def test_get_company_cross_org_denied(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    first = await _seed_org(db_session, owned_cleanup, name="First")
    second = await _seed_org(db_session, owned_cleanup, name="Second")
    user_first = await _seed_user(db_session, owned_cleanup, first, UserRole.admin)
    company_second = Company(organization_id=second.id, name="Secret")
    db_session.add(company_second)
    await db_session.commit()

    response = await client.get(f"/api/v1/companies/{company_second.id}", headers=_auth(user_first))
    assert response.status_code == 404


async def test_get_company_missing_returns_404(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    response = await client.get(f"/api/v1/companies/{uuid.uuid4()}", headers=_auth(admin))
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# create_company
# ---------------------------------------------------------------------------


async def test_create_company_happy(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    response = await client.post(
        "/api/v1/companies",
        headers=_auth(admin),
        json={"name": "Alza.cz a.s.", "ico": "27082440"},
    )
    assert response.status_code == 201
    assert response.json()["name"] == "Alza.cz a.s."


async def test_create_company_validation_error(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    response = await client.post(
        "/api/v1/companies",
        headers=_auth(admin),
        json={"name": "", "ico": "abc"},
    )
    assert response.status_code == 422


async def test_create_company_salesperson_cannot_assign_other(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    other = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    response = await client.post(
        "/api/v1/companies",
        headers=_auth(sales),
        json={"name": "Out of scope", "owner_user_id": str(other.id)},
    )
    assert response.status_code == 403


async def test_create_company_duplicate_ico_returns_409(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    db_session.add(Company(organization_id=org.id, name="First", ico="27082440"))
    await db_session.commit()
    response = await client.post(
        "/api/v1/companies",
        headers=_auth(admin),
        json={"name": "Duplicate", "ico": "27082440"},
    )
    assert response.status_code == 409


# ---------------------------------------------------------------------------
# update_company
# ---------------------------------------------------------------------------


async def test_update_company_happy(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = Company(organization_id=org.id, name="Old", owner_user_id=admin.id)
    db_session.add(company)
    await db_session.commit()

    response = await client.put(
        f"/api/v1/companies/{company.id}",
        headers=_auth(admin),
        json={"name": "New", "website": "https://new.cz"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "New"
    assert response.json()["website"] == "https://new.cz"


async def test_update_company_validation_error(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = Company(organization_id=org.id, name="X", owner_user_id=admin.id)
    db_session.add(company)
    await db_session.commit()
    response = await client.put(
        f"/api/v1/companies/{company.id}",
        headers=_auth(admin),
        json={"ico": "not8"},
    )
    assert response.status_code == 422


async def test_update_company_salesperson_cannot_edit_foreign(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    other = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    target = Company(organization_id=org.id, name="Theirs", owner_user_id=other.id)
    db_session.add(target)
    await db_session.commit()
    response = await client.put(
        f"/api/v1/companies/{target.id}",
        headers=_auth(sales),
        json={"name": "Hijack"},
    )
    # Salesperson can't see the row, so 404 (visibility-first).
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# delete_company
# ---------------------------------------------------------------------------


async def test_delete_company_admin_ok(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = Company(organization_id=org.id, name="Doomed")
    db_session.add(company)
    await db_session.commit()
    response = await client.delete(f"/api/v1/companies/{company.id}", headers=_auth(admin))
    assert response.status_code == 204


async def test_delete_company_non_admin_forbidden(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    company = Company(organization_id=org.id, name="Safe", owner_user_id=sales.id)
    db_session.add(company)
    await db_session.commit()
    response = await client.delete(f"/api/v1/companies/{company.id}", headers=_auth(sales))
    assert response.status_code == 403


async def test_delete_company_rejects_missing_token(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    company = Company(organization_id=org.id, name="X")
    db_session.add(company)
    await db_session.commit()
    response = await client.delete(f"/api/v1/companies/{company.id}")
    assert response.status_code == 401
