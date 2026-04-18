"""Integration tests for /api/v1/reports/*."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import Company, Deal, Organization, Pipeline, Stage, User, UserRole
from app.db.models.enums import StageType
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


async def _setup(
    session: AsyncSession, owned_cleanup: dict[str, list]
) -> tuple[Organization, User, Stage, Stage, Company]:
    org = Organization(name=f"Org-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.commit()
    await session.refresh(org)
    owned_cleanup["orgs"].append(org.id)

    pipeline = await create_default_pipeline(session, org.id)
    await session.commit()
    await session.refresh(pipeline, attribute_names=["stages"])
    stages = sorted(pipeline.stages, key=lambda s: s.position)
    open_stage = stages[0]
    won_stmt = (
        select(Stage)
        .join(Pipeline)
        .where(
            Pipeline.organization_id == org.id,
            Stage.stage_type == StageType.won,
        )
    )
    won_stage = (await session.execute(won_stmt)).scalar_one()

    email = f"u-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    user = User(email=email, name="U", role=UserRole.admin, organization_id=org.id)
    session.add(user)
    await session.commit()
    await session.refresh(user)

    company = Company(organization_id=org.id, name="Co")
    session.add(company)
    await session.commit()
    await session.refresh(company)

    return org, user, open_stage, won_stage, company


def _auth(user: User) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {create_access_token(user.id, user.organization_id, user.role)}"
    }


async def test_kpi_summary_counts_open_and_won(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, user, open_stage, won_stage, company = await _setup(db_session, owned_cleanup)
    now = datetime.now(tz=UTC)

    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=open_stage.id,
                owner_user_id=user.id,
                name="Open 1",
                value=Decimal("100"),
                currency="CZK",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=open_stage.id,
                owner_user_id=user.id,
                name="Open 2",
                value=Decimal("250"),
                currency="CZK",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=won_stage.id,
                owner_user_id=user.id,
                name="Won this month",
                value=Decimal("1000"),
                currency="CZK",
                closed_at=now,
            ),
        ]
    )
    await db_session.commit()

    response = await client.get("/api/v1/reports/kpi-summary", headers=_auth(user))
    assert response.status_code == 200
    body = response.json()
    assert body["currency"] == "CZK"
    assert body["open_deal_count"] == 2
    assert Decimal(body["open_pipeline_value"]) == Decimal("350")
    assert body["won_this_month_count"] == 1
    assert Decimal(body["won_this_month_value"]) == Decimal("1000")


async def test_kpi_summary_skips_cross_currency_in_totals(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, user, open_stage, _won_stage, company = await _setup(db_session, owned_cleanup)
    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=open_stage.id,
                owner_user_id=user.id,
                name="CZK",
                value=Decimal("100"),
                currency="CZK",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=open_stage.id,
                owner_user_id=user.id,
                name="EUR",
                value=Decimal("50"),
                currency="EUR",
            ),
        ]
    )
    await db_session.commit()
    response = await client.get("/api/v1/reports/kpi-summary", headers=_auth(user))
    body = response.json()
    assert body["open_deal_count"] == 2
    assert Decimal(body["open_pipeline_value"]) == Decimal("100")


async def test_kpi_summary_rejects_missing_token(client: AsyncClient) -> None:
    response = await client.get("/api/v1/reports/kpi-summary")
    assert response.status_code == 401
