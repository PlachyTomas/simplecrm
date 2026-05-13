"""Integration tests for /api/v1/admin/blocked-companies/* and the
related guard in POST /api/v1/companies."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import BlockedCompany, Organization, User, UserRole
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
    token = create_access_token(user.id, user.organization_id, user.role)
    return {"Authorization": f"Bearer {token}"}


async def test_admin_can_add_list_and_delete_blocked_company(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)

    create = await client.post(
        "/api/v1/admin/blocked-companies",
        headers=_auth(admin),
        json={"ico": "12345678", "reason_category": "competitor", "note": "Big rival"},
    )
    assert create.status_code == 201, create.text
    row_id = create.json()["id"]
    assert create.json()["ico"] == "12345678"
    assert create.json()["reason_category"] == "competitor"
    assert create.json()["note"] == "Big rival"

    listing = await client.get("/api/v1/admin/blocked-companies", headers=_auth(admin))
    assert listing.status_code == 200
    assert {r["ico"] for r in listing.json()["items"]} == {"12345678"}

    delete_resp = await client.delete(
        f"/api/v1/admin/blocked-companies/{row_id}", headers=_auth(admin)
    )
    assert delete_resp.status_code == 204

    listing = await client.get("/api/v1/admin/blocked-companies", headers=_auth(admin))
    assert listing.json()["items"] == []


async def test_blocked_ico_rejects_company_create(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    db_session.add(
        BlockedCompany(
            organization_id=org.id,
            ico="87654321",
            reason_category="bankrupt",
        )
    )
    await db_session.commit()

    resp = await client.post(
        "/api/v1/companies",
        headers=_auth(admin),
        json={"name": "Insolventní s.r.o.", "ico": "87654321"},
    )
    assert resp.status_code == 409
    assert "blocked" in resp.json()["detail"].lower()


async def test_blocked_list_is_scoped_per_org(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org_a = await _seed_org(db_session, owned_cleanup)
    org_b = await _seed_org(db_session, owned_cleanup)
    await _seed_user(db_session, owned_cleanup, org_a, UserRole.admin)
    admin_b = await _seed_user(db_session, owned_cleanup, org_b, UserRole.admin)
    db_session.add(
        BlockedCompany(organization_id=org_a.id, ico="11112222", reason_category="competitor")
    )
    await db_session.commit()

    # org B doesn't see org A's blocklist
    listing_b = await client.get("/api/v1/admin/blocked-companies", headers=_auth(admin_b))
    assert listing_b.status_code == 200
    assert listing_b.json()["items"] == []
    # ...and can create a company with the IČO org A blocked
    create_b = await client.post(
        "/api/v1/companies",
        headers=_auth(admin_b),
        json={"name": "Same IČO, different org", "ico": "11112222"},
    )
    assert create_b.status_code == 201, create_b.text


async def test_salesperson_cannot_manage_blocked_list(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    r = await client.get("/api/v1/admin/blocked-companies", headers=_auth(sales))
    assert r.status_code == 403
    r = await client.post(
        "/api/v1/admin/blocked-companies",
        headers=_auth(sales),
        json={"ico": "12345678", "reason_category": "competitor"},
    )
    assert r.status_code == 403


async def test_duplicate_blocked_ico_returns_409(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    db_session.add(
        BlockedCompany(organization_id=org.id, ico="33334444", reason_category="competitor")
    )
    await db_session.commit()

    r = await client.post(
        "/api/v1/admin/blocked-companies",
        headers=_auth(admin),
        json={"ico": "33334444", "reason_category": "other"},
    )
    assert r.status_code == 409
