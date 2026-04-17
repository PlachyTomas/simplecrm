"""Integration tests for /api/v1/organizations/*.

These tests commit to the DB because the PUT endpoint uses its own
`session.commit()`, which defeats the rollback fixture. To avoid cross-test
leakage, each test seeds users with unique UUID-suffixed emails. Teardown
happens via the `organization_scope` fixture that deletes the rows it
created.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import Organization, User, UserRole
from app.db.session import AsyncSessionLocal


@pytest.fixture
async def owned_emails() -> AsyncIterator[list[str]]:
    tracked: list[str] = []
    yield tracked
    # Teardown: delete everything we created. Uses its own session so the
    # test's session is already gone by now.
    async with AsyncSessionLocal() as session:
        await session.execute(delete(User).where(User.email.in_(tracked)))
        # Orphaned organizations — delete any whose name starts with our
        # fixture marker.
        await session.execute(delete(Organization).where(Organization.name == "Placeholder Alfa"))
        await session.commit()


async def _seed_user(
    session: AsyncSession,
    owned_emails: list[str],
    *,
    role: UserRole = UserRole.admin,
    ico: str | None = None,
    email: str | None = None,
) -> User:
    final_email = email or f"u-{uuid.uuid4().hex[:8]}@alfa.cz"
    owned_emails.append(final_email)
    org = Organization(name="Placeholder Alfa", ico=ico)
    session.add(org)
    await session.flush()
    user = User(
        email=final_email,
        name="Majitel",
        role=role,
        organization_id=org.id,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user, attribute_names=["organization"])
    return user


async def test_get_current_organization_returns_user_org(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    user = await _seed_user(db_session, owned_emails)
    token = create_access_token(user.id, user.organization_id, user.role)
    response = await client.get(
        "/api/v1/organizations/current",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["id"] == str(user.organization_id)
    assert response.json()["name"] == "Placeholder Alfa"
    assert response.json()["ico"] is None


async def test_get_current_organization_rejects_missing_token(client: AsyncClient) -> None:
    response = await client.get("/api/v1/organizations/current")
    assert response.status_code == 401


async def test_update_current_organization_happy_path(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    user = await _seed_user(db_session, owned_emails)
    token = create_access_token(user.id, user.organization_id, user.role)
    response = await client.put(
        "/api/v1/organizations/current",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Alza a.s.", "ico": "27082440", "address_city": "Praha"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Alza a.s."
    assert body["ico"] == "27082440"
    assert body["address_city"] == "Praha"


async def test_update_current_organization_rejects_non_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    user = await _seed_user(db_session, owned_emails, role=UserRole.salesperson)
    token = create_access_token(user.id, user.organization_id, user.role)
    response = await client.put(
        "/api/v1/organizations/current",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Beta s.r.o."},
    )
    assert response.status_code == 403


async def test_update_current_organization_validates_ico(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    user = await _seed_user(db_session, owned_emails)
    token = create_access_token(user.id, user.organization_id, user.role)
    response = await client.put(
        "/api/v1/organizations/current",
        headers={"Authorization": f"Bearer {token}"},
        json={"ico": "abcdefgh"},
    )
    assert response.status_code == 422


async def test_update_current_organization_isolates_by_user(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    first = await _seed_user(db_session, owned_emails)
    second = await _seed_user(db_session, owned_emails)
    assert first.organization_id != second.organization_id

    second_token = create_access_token(second.id, second.organization_id, second.role)
    response = await client.get(
        "/api/v1/organizations/current",
        headers={"Authorization": f"Bearer {second_token}"},
    )
    assert response.status_code == 200
    assert response.json()["id"] == str(second.organization_id)
