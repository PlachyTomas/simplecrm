"""Integration tests for /api/v1/users/*."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import delete
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


async def _seed(
    session: AsyncSession, owned_cleanup: dict[str, list]
) -> tuple[Organization, User, User]:
    org = Organization(name=f"Org-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.commit()
    await session.refresh(org)
    owned_cleanup["orgs"].append(org.id)

    admin_email = f"a-{uuid.uuid4().hex[:8]}@ex.cz"
    sales_email = f"s-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].extend([admin_email, sales_email])

    admin = User(email=admin_email, name="Admin", role=UserRole.admin, organization_id=org.id)
    sales = User(email=sales_email, name="Sales", role=UserRole.salesperson, organization_id=org.id)
    session.add_all([admin, sales])
    await session.commit()
    await session.refresh(admin)
    await session.refresh(sales)
    return org, admin, sales


def _auth(user: User) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {create_access_token(user.id, user.organization_id, user.role)}"
    }


async def test_list_users_returns_org_members(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _org, admin, sales = await _seed(db_session, owned_cleanup)
    response = await client.get("/api/v1/users", headers=_auth(admin))
    assert response.status_code == 200
    body = response.json()
    emails = {row["email"] for row in body["items"]}
    assert admin.email in emails
    assert sales.email in emails


async def test_admin_can_promote_salesperson(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _org, admin, sales = await _seed(db_session, owned_cleanup)
    response = await client.patch(
        f"/api/v1/users/{sales.id}",
        headers=_auth(admin),
        json={"role": "manager"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["role"] == "manager"


async def test_non_admin_cannot_update_user(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _org, admin, sales = await _seed(db_session, owned_cleanup)
    response = await client.patch(
        f"/api/v1/users/{admin.id}",
        headers=_auth(sales),
        json={"role": "salesperson"},
    )
    assert response.status_code == 403


async def test_cannot_demote_last_active_admin(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _org, admin, _sales = await _seed(db_session, owned_cleanup)
    response = await client.patch(
        f"/api/v1/users/{admin.id}",
        headers=_auth(admin),
        json={"role": "salesperson"},
    )
    assert response.status_code == 400


async def test_can_assign_team(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, admin, sales = await _seed(db_session, owned_cleanup)
    team = Team(organization_id=org.id, name="Sever")
    db_session.add(team)
    await db_session.commit()
    await db_session.refresh(team)
    response = await client.patch(
        f"/api/v1/users/{sales.id}",
        headers=_auth(admin),
        json={"team_id": str(team.id)},
    )
    assert response.status_code == 200, response.text
    assert response.json()["team_id"] == str(team.id)


# ---- PATCH /users/me/preferences ----


async def test_preferences_default_to_empty_dict_on_me(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, _, sales = await _seed(db_session, owned_cleanup)
    r = await client.get("/api/v1/auth/me", headers=_auth(sales))
    assert r.status_code == 200, r.text
    assert r.json()["preferences"] == {}


async def test_patch_preferences_writes_then_round_trips_via_me(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, _, sales = await _seed(db_session, owned_cleanup)
    r = await client.patch(
        "/api/v1/users/me/preferences",
        headers=_auth(sales),
        json={"tutorial_step_index": 2},
    )
    assert r.status_code == 200, r.text
    assert r.json()["tutorial_step_index"] == 2

    me = await client.get("/api/v1/auth/me", headers=_auth(sales))
    assert me.json()["preferences"]["tutorial_step_index"] == 2


async def test_patch_preferences_is_merge_not_replace(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, _, sales = await _seed(db_session, owned_cleanup)
    await client.patch(
        "/api/v1/users/me/preferences",
        headers=_auth(sales),
        json={"tutorial_step_index": 3, "tutorial_completed_at": "2026-05-17T22:00:00+00:00"},
    )
    r = await client.patch(
        "/api/v1/users/me/preferences",
        headers=_auth(sales),
        json={"tutorial_step_index": 5},
    )
    body = r.json()
    assert body["tutorial_step_index"] == 5
    # The completed_at key was NOT touched by the second PATCH — must persist.
    assert "tutorial_completed_at" in body


async def test_patch_preferences_null_deletes_key(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, _, sales = await _seed(db_session, owned_cleanup)
    await client.patch(
        "/api/v1/users/me/preferences",
        headers=_auth(sales),
        json={"tutorial_completed_at": "2026-05-17T22:00:00+00:00"},
    )
    r = await client.patch(
        "/api/v1/users/me/preferences",
        headers=_auth(sales),
        json={"tutorial_completed_at": None},
    )
    assert r.status_code == 200
    assert "tutorial_completed_at" not in r.json()


async def test_patch_preferences_rejects_unknown_key(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, _, sales = await _seed(db_session, owned_cleanup)
    r = await client.patch(
        "/api/v1/users/me/preferences",
        headers=_auth(sales),
        json={"something_made_up": 42},
    )
    assert r.status_code == 422


async def test_patch_preferences_requires_auth(client: AsyncClient) -> None:
    r = await client.patch("/api/v1/users/me/preferences", json={"tutorial_step_index": 0})
    assert r.status_code == 401


async def test_patch_preferences_rejects_negative_step(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, _, sales = await _seed(db_session, owned_cleanup)
    r = await client.patch(
        "/api/v1/users/me/preferences",
        headers=_auth(sales),
        json={"tutorial_step_index": -1},
    )
    assert r.status_code == 422
