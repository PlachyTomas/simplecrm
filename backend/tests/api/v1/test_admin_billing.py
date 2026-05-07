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


async def test_activate_applies_queued_user_deactivations(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    """Queued downsize from PUT /seat-count gets applied at activation:
    queued users flip is_active=False, seat_count drops to pending_seat_count,
    pending fields clear."""
    from sqlalchemy import select as _select

    from app.db.models import Subscription, User as _User

    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    # Capture ids before any expire_all() calls; accessing org.id from a
    # sync context after expiration triggers a MissingGreenlet.
    org_id = org.id
    extra_email = f"x-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_emails.append(extra_email)
    db_session.add(
        _User(
            email=extra_email,
            name="Extra",
            role=UserRole.salesperson,
            organization_id=org_id,
        )
    )
    await db_session.commit()
    extra_id = (
        await db_session.execute(_select(_User.id).where(_User.email == extra_email))
    ).scalar_one()

    token = create_access_token(admin.id, admin.organization_id, admin.role)

    # Bump to 2 then queue a downsize back to 1 with extra as the victim.
    await client.put(
        "/api/v1/organizations/current/subscription/seat-count",
        headers={"Authorization": f"Bearer {token}"},
        json={"seat_count": 2},
    )
    await client.put(
        "/api/v1/organizations/current/subscription/seat-count",
        headers={"Authorization": f"Bearer {token}"},
        json={"seat_count": 1, "deactivate_user_ids": [str(extra_id)]},
    )

    # Sanity: extra is still active, queue is set.
    db_session.expire_all()
    extra = (
        await db_session.execute(_select(_User).where(_User.id == extra_id))
    ).scalar_one()
    assert extra.is_active is True

    # Activate the subscription (super-admin path).
    activate = await client.post(
        f"/api/v1/admin/organizations/{org_id}/subscription/activate",
        headers={"Authorization": f"Bearer {token}"},
        json={"plan_code": "monthly"},
    )
    assert activate.status_code == 200, activate.text
    body = activate.json()
    assert body["seat_count"] == 1
    assert body["pending_seat_count"] is None
    assert body["pending_user_deactivations"] is None

    db_session.expire_all()
    extra_after = (
        await db_session.execute(_select(_User).where(_User.id == extra_id))
    ).scalar_one()
    assert extra_after.is_active is False

    # Sanity check the Subscription row itself reflects the same.
    sub = (
        await db_session.execute(
            _select(Subscription).where(Subscription.organization_id == org_id)
        )
    ).scalar_one()
    assert sub.seat_count == 1
    assert sub.pending_seat_count is None
    assert sub.pending_user_deactivations is None


# ---------------------------------------------------------------------------
# Impersonation
# ---------------------------------------------------------------------------


async def _add_member(
    session: AsyncSession,
    org: Organization,
    owned_emails: list[str],
    *,
    is_super_admin: bool = False,
    is_active: bool = True,
    role: UserRole = UserRole.salesperson,
) -> User:
    email = f"member-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_emails.append(email)
    user = User(
        email=email,
        name="Member",
        role=role,
        organization_id=org.id,
        is_super_admin=is_super_admin,
        is_active=is_active,
    )
    session.add(user)
    await session.commit()
    return user


async def test_list_org_users_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    member = await _add_member(db_session, org, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.get(
        f"/api/v1/admin/organizations/{org.id}/users",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    emails = [u["email"] for u in response.json()["items"]]
    assert admin.email in emails
    assert member.email in emails


async def test_list_org_users_rejects_non_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, user = await _seed_org_with_super_admin(
        db_session, owned_emails, super_admin=False
    )
    token = create_access_token(user.id, user.organization_id, user.role)
    response = await client.get(
        f"/api/v1/admin/organizations/{org.id}/users",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


async def test_impersonate_super_admin_mints_token_for_target(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    from app.core.security import decode_token

    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    member = await _add_member(db_session, org, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        f"/api/v1/admin/users/{member.id}/impersonate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["user_id"] == str(member.id)
    assert body["email"] == member.email
    # Token decodes to the target user, not the calling super-admin.
    payload = decode_token(body["access_token"])
    assert payload["sub"] == str(member.id)
    # No refresh cookie is set — super-admin keeps their own session.
    assert "set-cookie" not in {h.lower() for h in response.headers}


async def test_impersonate_rejects_non_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, user = await _seed_org_with_super_admin(
        db_session, owned_emails, super_admin=False
    )
    member = await _add_member(db_session, org, owned_emails)
    token = create_access_token(user.id, user.organization_id, user.role)
    response = await client.post(
        f"/api/v1/admin/users/{member.id}/impersonate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


async def test_impersonate_refuses_other_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    other_admin = await _add_member(
        db_session, org, owned_emails, is_super_admin=True
    )
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        f"/api/v1/admin/users/{other_admin.id}/impersonate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


async def test_impersonate_inactive_user_returns_422(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    inactive = await _add_member(db_session, org, owned_emails, is_active=False)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        f"/api/v1/admin/users/{inactive.id}/impersonate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 422


async def test_impersonate_unknown_user_returns_404(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        f"/api/v1/admin/users/{uuid.uuid4()}/impersonate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 404
