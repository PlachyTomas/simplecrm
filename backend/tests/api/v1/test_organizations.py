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
from app.db.models import (
    Organization,
    SuperAdminAction,
    SuperAdminAuditLog,
    User,
    UserRole,
)
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
        await session.execute(
            delete(SuperAdminAuditLog).where(SuperAdminAuditLog.super_admin_email.in_(tracked))
        )
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


# ---------------------------------------------------------------------------
# Configurable ownership-release window
# ---------------------------------------------------------------------------


async def test_get_current_org_returns_default_ownership_window(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    user = await _seed_user(db_session, owned_emails)
    token = create_access_token(user.id, user.organization_id, user.role)
    response = await client.get(
        "/api/v1/organizations/current",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["ownership_window_days"] == 365


async def test_update_ownership_window_persists(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    user = await _seed_user(db_session, owned_emails)
    token = create_access_token(user.id, user.organization_id, user.role)
    response = await client.put(
        "/api/v1/organizations/current",
        headers={"Authorization": f"Bearer {token}"},
        json={"ownership_window_days": 180},
    )
    assert response.status_code == 200
    assert response.json()["ownership_window_days"] == 180


async def test_update_ownership_window_rejects_out_of_bounds(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    user = await _seed_user(db_session, owned_emails)
    token = create_access_token(user.id, user.organization_id, user.role)
    too_low = await client.put(
        "/api/v1/organizations/current",
        headers={"Authorization": f"Bearer {token}"},
        json={"ownership_window_days": 0},
    )
    assert too_low.status_code == 422
    too_high = await client.put(
        "/api/v1/organizations/current",
        headers={"Authorization": f"Bearer {token}"},
        json={"ownership_window_days": 4000},
    )
    assert too_high.status_code == 422


async def test_create_company_uses_configured_window(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    """Org with a 60-day window → new companies get +60d expiry, not +365d."""
    from datetime import UTC, datetime, timedelta

    user = await _seed_user(db_session, owned_emails)
    token = create_access_token(user.id, user.organization_id, user.role)

    # Lower the org's window to 60 days.
    put_resp = await client.put(
        "/api/v1/organizations/current",
        headers={"Authorization": f"Bearer {token}"},
        json={"ownership_window_days": 60},
    )
    assert put_resp.status_code == 200

    before = datetime.now(tz=UTC)
    create_resp = await client.post(
        "/api/v1/companies",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Test Window s.r.o.", "ico": "12345678"},
    )
    after = datetime.now(tz=UTC)
    assert create_resp.status_code == 201
    expires_at = datetime.fromisoformat(create_resp.json()["ownership_expires_at"])
    # Expect ownership_expires_at ≈ now + 60d, not now + 365d.
    expected_low = before + timedelta(days=60) - timedelta(seconds=5)
    expected_high = after + timedelta(days=60) + timedelta(seconds=5)
    assert expected_low <= expires_at <= expected_high, f"expected ~+60d window, got {expires_at!s}"


# ---------------------------------------------------------------------------
# GET /organizations/me/admin-access-log
# ---------------------------------------------------------------------------


async def test_admin_access_log_returns_rows_for_caller_org(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    user = await _seed_user(db_session, owned_emails)
    # Seed two audit rows: one for this org, one for some other org (must
    # not leak into the response).
    db_session.add(
        SuperAdminAuditLog(
            super_admin_email="ops@simplecrm.cz",
            target_organization_id=user.organization_id,
            action=SuperAdminAction.impersonate,
            target_user_email=user.email,
            payload={"target_role": "admin"},
        )
    )
    other_org = Organization(name="Other Org")
    db_session.add(other_org)
    await db_session.flush()
    db_session.add(
        SuperAdminAuditLog(
            super_admin_email="ops@simplecrm.cz",
            target_organization_id=other_org.id,
            action=SuperAdminAction.view_invoices,
        )
    )
    await db_session.commit()

    token = create_access_token(user.id, user.organization_id, user.role)
    resp = await client.get(
        "/api/v1/organizations/me/admin-access-log",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["action"] == "impersonate"
    assert body["items"][0]["target_user_email"] == user.email

    # Cleanup the manual fixture rows + org.
    await db_session.execute(
        delete(SuperAdminAuditLog).where(
            SuperAdminAuditLog.target_organization_id.in_([user.organization_id, other_org.id])
        )
    )
    await db_session.execute(delete(Organization).where(Organization.id == other_org.id))
    await db_session.commit()


async def test_admin_access_log_rejects_non_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    user = await _seed_user(db_session, owned_emails, role=UserRole.salesperson)
    token = create_access_token(user.id, user.organization_id, user.role)
    resp = await client.get(
        "/api/v1/organizations/me/admin-access-log",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
