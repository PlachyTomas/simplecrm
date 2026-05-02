"""Integration tests for /api/v1/admin/* (super-admin surface)."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import (
    BillingSettings,
    Organization,
    Plan,
    Subscription,
    User,
    UserRole,
)
from app.db.session import AsyncSessionLocal


@pytest.fixture
async def owned_emails() -> AsyncIterator[list[str]]:
    tracked: list[str] = []
    yield tracked
    async with AsyncSessionLocal() as session:
        if tracked:
            await session.execute(delete(User).where(User.email.in_(tracked)))
            await session.execute(
                delete(Organization).where(Organization.name == "Admin Test Org")
            )
            # Reset is_vat_payer back to default in case a test mutated it.
            settings = (
                await session.execute(select(BillingSettings))
            ).scalar_one()
            settings.is_vat_payer = False
            await session.commit()


async def _seed_org_with_super_admin(
    session: AsyncSession, owned_emails: list[str], *, super_admin: bool = True
) -> tuple[Organization, User]:
    org = Organization(name="Admin Test Org")
    session.add(org)
    await session.flush()

    email = f"sa-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_emails.append(email)
    user = User(
        email=email,
        name="Super",
        role=UserRole.admin,
        organization_id=org.id,
        is_super_admin=super_admin,
    )
    session.add(user)
    trial_plan_id = (
        await session.execute(select(Plan.id).where(Plan.code == "trial"))
    ).scalar_one()
    sub = Subscription(
        organization_id=org.id,
        plan_id=trial_plan_id,
        status="trialing",
        started_at=org.created_at,
        current_period_ends_at=org.trial_ends_at,
    )
    session.add(sub)
    await session.commit()
    return org, user


# ---------------------------------------------------------------------------
# /admin/organizations
# ---------------------------------------------------------------------------


async def test_list_orgs_super_admin_sees_paginated(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.get(
        "/api/v1/admin/organizations?q=Admin Test Org",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    found = next(item for item in body["items"] if item["name"] == "Admin Test Org")
    assert found["plan_code"] == "trial"
    assert found["status"] == "trialing"


async def test_list_orgs_rejects_non_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, user = await _seed_org_with_super_admin(
        db_session, owned_emails, super_admin=False
    )
    token = create_access_token(user.id, user.organization_id, user.role)
    response = await client.get(
        "/api/v1/admin/organizations",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Subscription mutations
# ---------------------------------------------------------------------------


async def test_activate_subscription_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        f"/api/v1/admin/organizations/{org.id}/subscription/activate",
        headers={"Authorization": f"Bearer {token}"},
        json={"plan_code": "monthly"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "active"
    assert body["plan"]["code"] == "monthly"


async def test_activate_enterprise_requires_override_returns_422(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        f"/api/v1/admin/organizations/{org.id}/subscription/activate",
        headers={"Authorization": f"Bearer {token}"},
        json={"plan_code": "enterprise", "period_months": 12},
    )
    assert response.status_code == 422


async def test_set_comp_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        f"/api/v1/admin/organizations/{org.id}/subscription/set-comp",
        headers={"Authorization": f"Bearer {token}"},
        json={"reason": "podcast partnership"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["is_comp"] is True
    assert body["plan"]["code"] == "comp"
    assert body["access_status"] == "comp"


async def test_set_enterprise_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        f"/api/v1/admin/organizations/{org.id}/subscription/set-enterprise",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "override_price_per_user_minor": 49900,
            "period_months": 12,
            "notes": "negotiated",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["plan"]["code"] == "enterprise"
    assert body["effective_price_per_user_minor"] == 49900


async def test_extend_trial_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        f"/api/v1/admin/organizations/{org.id}/subscription/extend-trial",
        headers={"Authorization": f"Bearer {token}"},
        json={"days": 14},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "trialing"


async def test_cancel_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        f"/api/v1/admin/organizations/{org.id}/subscription/cancel",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "canceled"
    assert body["access_status"] == "gated"


async def test_set_comp_rejects_non_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(
        db_session, owned_emails, super_admin=False
    )
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        f"/api/v1/admin/organizations/{org.id}/subscription/set-comp",
        headers={"Authorization": f"Bearer {token}"},
        json={"reason": "free for friends"},
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# /admin/billing-settings
# ---------------------------------------------------------------------------


async def test_get_billing_settings_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.get(
        "/api/v1/admin/billing-settings",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["is_vat_payer"] is False
    assert body["contact_email"] == "podpora@simplecrm.cz"


async def test_put_billing_settings_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.put(
        "/api/v1/admin/billing-settings",
        headers={"Authorization": f"Bearer {token}"},
        json={"is_vat_payer": True, "seller_iban": "CZ6508000000192000145399"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["is_vat_payer"] is True
    assert body["seller_iban"] == "CZ6508000000192000145399"


async def test_put_billing_settings_rejects_non_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_org_with_super_admin(
        db_session, owned_emails, super_admin=False
    )
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.put(
        "/api/v1/admin/billing-settings",
        headers={"Authorization": f"Bearer {token}"},
        json={"is_vat_payer": True},
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# /admin/organizations/:id/activity
# ---------------------------------------------------------------------------


async def test_org_activity_super_admin_returns_subscription_rows(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    # Generate at least one subscription Activity row by exercising a
    # mutation. set-comp writes an Activity row per BillingService.
    set_comp = await client.post(
        f"/api/v1/admin/organizations/{org.id}/subscription/set-comp",
        headers={"Authorization": f"Bearer {token}"},
        json={"reason": "free for the test"},
    )
    assert set_comp.status_code == 200

    response = await client.get(
        f"/api/v1/admin/organizations/{org.id}/activity",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    assert len(body["items"]) >= 1
    row = body["items"][0]
    assert "activity_type" in row
    assert "payload" in row
    assert "created_at" in row
    assert row["actor"] is not None
    assert row["actor"]["id"] == str(admin.id)


async def test_org_activity_rejects_non_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, user = await _seed_org_with_super_admin(
        db_session, owned_emails, super_admin=False
    )
    token = create_access_token(user.id, user.organization_id, user.role)
    response = await client.get(
        f"/api/v1/admin/organizations/{org.id}/activity",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


async def test_org_activity_respects_pagination(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    # Two writes → two activity rows.
    for days in (10, 20):
        await client.post(
            f"/api/v1/admin/organizations/{org.id}/subscription/extend-trial",
            headers={"Authorization": f"Bearer {token}"},
            json={"days": days},
        )
    response = await client.get(
        f"/api/v1/admin/organizations/{org.id}/activity?limit=1&offset=0",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 2
    assert len(body["items"]) == 1
