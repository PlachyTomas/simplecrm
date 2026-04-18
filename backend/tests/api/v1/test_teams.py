"""Integration tests for /api/v1/teams/*."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import Organization, Team, User, UserRole
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


async def test_create_team_admin_happy(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    response = await client.post("/api/v1/teams", headers=_auth(admin), json={"name": "Sever"})
    assert response.status_code == 201
    assert response.json()["name"] == "Sever"


async def test_create_team_non_admin_forbidden(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    response = await client.post("/api/v1/teams", headers=_auth(sales), json={"name": "Nope"})
    assert response.status_code == 403


async def test_create_team_validation_error(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    response = await client.post("/api/v1/teams", headers=_auth(admin), json={"name": ""})
    assert response.status_code == 422


async def test_create_team_rejects_cross_org_manager(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    first = await _seed_org(db_session, owned_cleanup)
    second = await _seed_org(db_session, owned_cleanup)
    first_admin = await _seed_user(db_session, owned_cleanup, first, UserRole.admin)
    foreign = await _seed_user(db_session, owned_cleanup, second, UserRole.manager)
    response = await client.post(
        "/api/v1/teams",
        headers=_auth(first_admin),
        json={"name": "Bad", "manager_user_id": str(foreign.id)},
    )
    assert response.status_code == 400


async def test_list_and_get_team(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    db_session.add(Team(organization_id=org.id, name="Sever"))
    await db_session.commit()

    list_resp = await client.get("/api/v1/teams", headers=_auth(user))
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 1
    team_id = list_resp.json()["items"][0]["id"]

    get_resp = await client.get(f"/api/v1/teams/{team_id}", headers=_auth(user))
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "Sever"


async def test_update_team_manager_can_edit_own(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    manager = await _seed_user(db_session, owned_cleanup, org, UserRole.manager)
    team = Team(organization_id=org.id, name="Team", manager_user_id=manager.id)
    db_session.add(team)
    await db_session.commit()
    response = await client.put(
        f"/api/v1/teams/{team.id}", headers=_auth(manager), json={"name": "Přejmenovaný"}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Přejmenovaný"


async def test_update_team_manager_cannot_edit_foreign(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    other_manager = await _seed_user(db_session, owned_cleanup, org, UserRole.manager)
    random_manager = await _seed_user(db_session, owned_cleanup, org, UserRole.manager)
    team = Team(organization_id=org.id, name="T", manager_user_id=other_manager.id)
    db_session.add(team)
    await db_session.commit()
    response = await client.put(
        f"/api/v1/teams/{team.id}",
        headers=_auth(random_manager),
        json={"name": "Hijack"},
    )
    assert response.status_code == 403


async def test_replace_members_admin(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    alice = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    bob = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    team = Team(organization_id=org.id, name="T")
    db_session.add(team)
    await db_session.commit()

    response = await client.put(
        f"/api/v1/teams/{team.id}/members",
        headers=_auth(admin),
        json={"member_ids": [str(alice.id), str(bob.id)]},
    )
    assert response.status_code == 200

    # Verify.
    async with AsyncSessionLocal() as fresh:
        members = (await fresh.execute(select(User).where(User.team_id == team.id))).scalars().all()
    assert {m.id for m in members} == {alice.id, bob.id}


async def test_replace_members_rejects_cross_org_user(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org_a = await _seed_org(db_session, owned_cleanup)
    org_b = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org_a, UserRole.admin)
    foreigner = await _seed_user(db_session, owned_cleanup, org_b, UserRole.salesperson)
    team = Team(organization_id=org_a.id, name="T")
    db_session.add(team)
    await db_session.commit()
    response = await client.put(
        f"/api/v1/teams/{team.id}/members",
        headers=_auth(admin),
        json={"member_ids": [str(foreigner.id)]},
    )
    assert response.status_code == 400


async def test_delete_team_admin(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    team = Team(organization_id=org.id, name="T")
    db_session.add(team)
    await db_session.commit()
    response = await client.delete(f"/api/v1/teams/{team.id}", headers=_auth(admin))
    assert response.status_code == 204


async def test_rejects_missing_token(client: AsyncClient) -> None:
    response = await client.get("/api/v1/teams")
    assert response.status_code == 401
