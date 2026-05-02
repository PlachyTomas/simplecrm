"""Integration tests for /api/v1/plans/* and the org-scoped subscription
endpoints under /api/v1/organizations/current/subscription/*.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import Organization, Plan, Subscription, User, UserRole
from app.db.session import AsyncSessionLocal


@pytest.fixture
async def owned_emails() -> AsyncIterator[list[str]]:
    tracked: list[str] = []
    yield tracked
    async with AsyncSessionLocal() as session:
        if tracked:
            await session.execute(delete(User).where(User.email.in_(tracked)))
            await session.execute(
                delete(Organization).where(Organization.name == "Sub Test Org")
            )
            await session.commit()


async def _seed_org_with_admin(
    session: AsyncSession, owned_emails: list[str]
) -> tuple[Organization, User]:
    org = Organization(name="Sub Test Org")
    session.add(org)
    await session.flush()

    email = f"a-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_emails.append(email)
    admin = User(email=email, name="Admin", role=UserRole.admin, organization_id=org.id)
    session.add(admin)
    await session.flush()

    trial_plan_id = (
        await session.execute(select(Plan.id).where(Plan.code == "trial"))
    ).scalar_one()
    sub = Subscription(
        organization_id=org.id,
        plan_id=trial_plan_id,
        status="trialing",
        started_at=org.created_at,
        current_period_starts_at=org.created_at,
        current_period_ends_at=org.trial_ends_at,
    )
    session.add(sub)
    await session.commit()
    await session.refresh(admin, attribute_names=["organization"])
    return org, admin


# ---------------------------------------------------------------------------
# /plans/public
# ---------------------------------------------------------------------------


async def test_public_plans_no_auth_returns_monthly_and_annual(
    client: AsyncClient,
) -> None:
    response = await client.get("/api/v1/plans/public")
    assert response.status_code == 200
    body = response.json()
    codes = {p["code"] for p in body}
    assert codes == {"monthly", "annual"}
    annual = next(p for p in body if p["code"] == "annual")
    assert annual["monthly_equivalent_minor"] == 9900 * 12
    assert annual["savings_minor"] == 9900 * 12 - 99900


# ---------------------------------------------------------------------------
# /organizations/current/subscription
# ---------------------------------------------------------------------------


async def test_get_current_subscription(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_org_with_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.get(
        "/api/v1/organizations/current/subscription",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "trialing"
    assert body["plan"]["code"] == "trial"
    assert body["access_status"] == "trialing"


async def test_billing_summary_returns_user_count_and_monthly(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_org_with_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.get(
        "/api/v1/organizations/current/billing-summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["user_count"] == 1
    assert body["is_vat_payer"] is False
    # Effective price for trial is 0 → monthly_total 0
    assert body["effective_price_per_user_minor"] == 0


# ---------------------------------------------------------------------------
# Choose-plan
# ---------------------------------------------------------------------------


async def test_choose_plan_admin_marks_pending(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_org_with_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        "/api/v1/organizations/current/subscription/choose-plan",
        headers={"Authorization": f"Bearer {token}"},
        json={"plan_code": "annual"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "pending_activation"
    assert body["plan"]["code"] == "annual"
    assert body["access_status"] == "gated"  # pending denies access


async def test_choose_plan_rejects_invalid_code(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_org_with_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        "/api/v1/organizations/current/subscription/choose-plan",
        headers={"Authorization": f"Bearer {token}"},
        json={"plan_code": "enterprise"},
    )
    # Pydantic Literal validation kicks in before the service is called.
    assert response.status_code == 422


async def test_choose_plan_rejects_non_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org = Organization(name="Sub Test Org")
    db_session.add(org)
    await db_session.flush()
    email = f"sp-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_emails.append(email)
    salesperson = User(
        email=email, name="Sales", role=UserRole.salesperson, organization_id=org.id
    )
    db_session.add(salesperson)
    trial_plan_id = (
        await db_session.execute(select(Plan.id).where(Plan.code == "trial"))
    ).scalar_one()
    db_session.add(
        Subscription(
            organization_id=org.id,
            plan_id=trial_plan_id,
            status="trialing",
            started_at=org.created_at,
            current_period_ends_at=org.trial_ends_at,
        )
    )
    await db_session.commit()

    token = create_access_token(
        salesperson.id, salesperson.organization_id, salesperson.role
    )
    response = await client.post(
        "/api/v1/organizations/current/subscription/choose-plan",
        headers={"Authorization": f"Bearer {token}"},
        json={"plan_code": "annual"},
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Contact-enterprise
# ---------------------------------------------------------------------------


async def test_contact_enterprise_returns_queued(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_org_with_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        "/api/v1/organizations/current/subscription/contact-enterprise",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "30 sales seats, custom SLA", "expected_users": 30},
    )
    assert response.status_code == 202
    assert response.json()["status"] == "queued"
