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


async def test_leaderboard_aggregates_won_deals_per_owner(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, user, _open_stage, won_stage, company = await _setup(db_session, owned_cleanup)
    now = datetime.now(tz=UTC)

    other_email = f"o-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(other_email)
    other = User(
        email=other_email, name="Other", role=UserRole.admin, organization_id=org.id
    )
    db_session.add(other)
    await db_session.commit()
    await db_session.refresh(other)

    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=won_stage.id,
                owner_user_id=user.id,
                name="U won A",
                value=Decimal("500"),
                currency="CZK",
                closed_at=now,
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=won_stage.id,
                owner_user_id=user.id,
                name="U won B",
                value=Decimal("750"),
                currency="CZK",
                closed_at=now,
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=won_stage.id,
                owner_user_id=other.id,
                name="Other won",
                value=Decimal("300"),
                currency="CZK",
                closed_at=now,
            ),
        ]
    )
    await db_session.commit()

    response = await client.get("/api/v1/reports/leaderboard", headers=_auth(user))
    assert response.status_code == 200
    body = response.json()
    assert body["currency"] == "CZK"
    rows = body["rows"]
    assert len(rows) == 2
    assert rows[0]["won_count"] == 2
    assert Decimal(rows[0]["won_value"]) == Decimal("1250")
    assert rows[1]["won_count"] == 1
    assert Decimal(rows[1]["won_value"]) == Decimal("300")


async def test_loss_reasons_groups_by_reason(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, user, open_stage, _won_stage, company = await _setup(db_session, owned_cleanup)
    now = datetime.now(tz=UTC)

    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=open_stage.id,
                owner_user_id=user.id,
                name="Lost 1",
                value=Decimal("100"),
                currency="CZK",
                closed_at=now,
                lost_reason="Cena",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=open_stage.id,
                owner_user_id=user.id,
                name="Lost 2",
                value=Decimal("200"),
                currency="CZK",
                closed_at=now,
                lost_reason="Cena",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=open_stage.id,
                owner_user_id=user.id,
                name="Lost 3",
                value=Decimal("50"),
                currency="CZK",
                closed_at=now,
                lost_reason="Funkce",
            ),
        ]
    )
    await db_session.commit()

    response = await client.get("/api/v1/reports/loss-reasons", headers=_auth(user))
    assert response.status_code == 200
    body = response.json()
    rows = body["rows"]
    assert len(rows) == 2
    top = rows[0]
    assert top["lost_reason"] == "Cena"
    assert top["count"] == 2
    assert Decimal(top["total_value"]) == Decimal("300")


async def test_velocity_averages_days_to_close(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, user, _open_stage, won_stage, company = await _setup(db_session, owned_cleanup)
    now = datetime.now(tz=UTC)

    deals = [
        Deal(
            organization_id=org.id,
            company_id=company.id,
            stage_id=won_stage.id,
            owner_user_id=user.id,
            name="Fast",
            value=Decimal("100"),
            currency="CZK",
            closed_at=now,
        ),
        Deal(
            organization_id=org.id,
            company_id=company.id,
            stage_id=won_stage.id,
            owner_user_id=user.id,
            name="Slow",
            value=Decimal("100"),
            currency="CZK",
            closed_at=now,
        ),
    ]
    db_session.add_all(deals)
    await db_session.commit()
    for d in deals:
        await db_session.refresh(d)
    deals[0].created_at = now - __import__("datetime").timedelta(days=4)
    deals[1].created_at = now - __import__("datetime").timedelta(days=10)
    await db_session.commit()

    response = await client.get(
        "/api/v1/reports/pipeline-velocity", headers=_auth(user)
    )
    assert response.status_code == 200
    body = response.json()
    stages = body["stages"]
    won_row = next(s for s in stages if s["stage_id"] == str(won_stage.id))
    assert won_row["deal_count"] == 2
    assert won_row["avg_days_in_stage"] is not None
    assert 6.5 <= won_row["avg_days_in_stage"] <= 7.5


async def test_export_csv_streams_deals(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, user, open_stage, _won_stage, company = await _setup(db_session, owned_cleanup)
    db_session.add(
        Deal(
            organization_id=org.id,
            company_id=company.id,
            stage_id=open_stage.id,
            owner_user_id=user.id,
            name="ExportRow",
            value=Decimal("42"),
            currency="CZK",
        )
    )
    await db_session.commit()

    response = await client.get("/api/v1/reports/export-csv", headers=_auth(user))
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    text = response.text
    assert "id,name,stage,stage_type,value,currency" in text
    assert "ExportRow" in text


async def test_export_csv_rate_limit_returns_429(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """The ungated export bypasses the trial gate, so it must throttle abuse.

    Mirrors the lookup-registry rate-limit test pattern.
    """
    from app.api.v1.data_export import get_export_rate_limiter
    from app.main import app
    from app.services.lookup_cache import RateLimiter

    _, user, _, _, _ = await _setup(db_session, owned_cleanup)

    # Tight limiter: only the first call is allowed.
    tight_limiter = RateLimiter(max_calls=1, window_seconds=60.0)
    app.dependency_overrides[get_export_rate_limiter] = lambda: tight_limiter
    try:
        first = await client.get("/api/v1/reports/export-csv", headers=_auth(user))
        second = await client.get("/api/v1/reports/export-csv", headers=_auth(user))
    finally:
        app.dependency_overrides.pop(get_export_rate_limiter, None)
    assert first.status_code == 200
    assert second.status_code == 429
