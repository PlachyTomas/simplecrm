"""Integration tests for /api/v1/pipelines/*."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import Company, Deal, Organization, User, UserRole
from app.db.session import AsyncSessionLocal
from app.services.pipeline import create_default_pipeline


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
    session: AsyncSession,
    owned_cleanup: dict[str, list],
    *,
    role: UserRole = UserRole.admin,
) -> tuple[Organization, User, list]:
    org = Organization(name=f"Org-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.commit()
    await session.refresh(org)
    owned_cleanup["orgs"].append(org.id)

    pipeline = await create_default_pipeline(session, org.id)
    await session.commit()
    await session.refresh(pipeline, attribute_names=["stages"])
    stages = sorted(pipeline.stages, key=lambda s: s.position)

    email = f"u-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    user = User(email=email, name="U", role=role, organization_id=org.id)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return org, user, stages


def _auth(user: User) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {create_access_token(user.id, user.organization_id, user.role)}"
    }


async def test_default_pipeline_returns_stages(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _org, user, stages = await _seed(db_session, owned_cleanup)
    response = await client.get("/api/v1/pipelines/default", headers=_auth(user))
    assert response.status_code == 200
    body = response.json()
    assert body["is_default"] is True
    assert len(body["stages"]) == len(stages) == 6


async def test_pipeline_board_groups_deals_by_stage(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, user, stages = await _seed(db_session, owned_cleanup)
    company = Company(organization_id=org.id, name="Test Co")
    db_session.add(company)
    await db_session.commit()

    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=stages[0].id,
                name="A",
                value=Decimal("100.00"),
                currency="CZK",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=stages[0].id,
                name="B",
                value=Decimal("250.00"),
                currency="CZK",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=stages[1].id,
                name="C",
                value=Decimal("75.00"),
                currency="CZK",
            ),
        ]
    )
    await db_session.commit()

    response = await client.get("/api/v1/pipelines/default/board", headers=_auth(user))
    assert response.status_code == 200
    body = response.json()
    assert body["currency"] == "CZK"
    assert len(body["stages"]) == 6
    first = body["stages"][0]
    assert first["deal_count"] == 2
    assert first["total_value"] == "350.00"
    assert {d["name"] for d in first["deals"]} == {"A", "B"}
    second = body["stages"][1]
    assert second["deal_count"] == 1
    assert second["total_value"] == "75.00"


async def test_pipeline_board_ignores_cross_currency_in_totals(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, user, stages = await _seed(db_session, owned_cleanup)
    company = Company(organization_id=org.id, name="Co")
    db_session.add(company)
    await db_session.commit()
    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=stages[0].id,
                name="CZK deal",
                value=Decimal("100.00"),
                currency="CZK",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=stages[0].id,
                name="EUR deal",
                value=Decimal("50.00"),
                currency="EUR",
            ),
        ]
    )
    await db_session.commit()

    response = await client.get("/api/v1/pipelines/default/board", headers=_auth(user))
    first = response.json()["stages"][0]
    # Both deals present in the list, but only the CZK one contributes to
    # the board total (which is denominated in the org currency).
    assert first["deal_count"] == 2
    assert first["total_value"] == "100.00"


async def test_pipeline_board_rejects_missing_token(client: AsyncClient) -> None:
    response = await client.get("/api/v1/pipelines/default/board")
    assert response.status_code == 401


async def test_pipeline_board_scoped_for_salesperson(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _admin, stages = await _seed(db_session, owned_cleanup)
    # Two salespeople.
    sales_a = User(
        email=f"a-{uuid.uuid4().hex[:6]}@ex.cz",
        name="A",
        role=UserRole.salesperson,
        organization_id=org.id,
    )
    sales_b = User(
        email=f"b-{uuid.uuid4().hex[:6]}@ex.cz",
        name="B",
        role=UserRole.salesperson,
        organization_id=org.id,
    )
    db_session.add_all([sales_a, sales_b])
    await db_session.commit()
    owned_cleanup["emails"].extend([sales_a.email, sales_b.email])

    company = Company(organization_id=org.id, name="Co")
    db_session.add(company)
    await db_session.commit()

    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=stages[0].id,
                owner_user_id=sales_a.id,
                name="Mine",
                value=Decimal("100.00"),
                currency="CZK",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=stages[0].id,
                owner_user_id=sales_b.id,
                name="Theirs",
                value=Decimal("200.00"),
                currency="CZK",
            ),
        ]
    )
    await db_session.commit()

    response = await client.get("/api/v1/pipelines/default/board", headers=_auth(sales_a))
    first = response.json()["stages"][0]
    assert first["deal_count"] == 1
    assert {d["name"] for d in first["deals"]} == {"Mine"}
