"""Integration tests for /api/v1/deals/*."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import Company, Deal, Organization, Stage, User, UserRole
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


async def _seed_org_with_pipeline(
    session: AsyncSession, owned_cleanup: dict[str, list]
) -> tuple[Organization, Stage]:
    org = Organization(name=f"Org-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.commit()
    await session.refresh(org)
    owned_cleanup["orgs"].append(org.id)
    pipeline = await create_default_pipeline(session, org.id)
    await session.commit()
    await session.refresh(pipeline, attribute_names=["stages"])
    return org, pipeline.stages[0]


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


async def _seed_company(session: AsyncSession, org: Organization) -> Company:
    company = Company(organization_id=org.id, name=f"Co-{uuid.uuid4().hex[:4]}")
    session.add(company)
    await session.commit()
    await session.refresh(company)
    return company


def _auth(user: User) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {create_access_token(user.id, user.organization_id, user.role)}"
    }


# list_deals --------------------------------------------------------------


async def test_list_deals_admin_sees_all(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    company = await _seed_company(db_session, org)
    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=stage.id,
                owner_user_id=admin.id,
                name="A",
                value=Decimal("100"),
                currency="CZK",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=stage.id,
                owner_user_id=sales.id,
                name="B",
                value=Decimal("200"),
                currency="CZK",
            ),
        ]
    )
    await db_session.commit()
    response = await client.get("/api/v1/deals", headers=_auth(admin))
    assert response.status_code == 200
    assert response.json()["total"] == 2


async def test_list_deals_salesperson_scoped(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    other = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    company = await _seed_company(db_session, org)
    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=stage.id,
                owner_user_id=sales.id,
                name="Mine",
                value=Decimal("0"),
                currency="CZK",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=stage.id,
                owner_user_id=other.id,
                name="Theirs",
                value=Decimal("0"),
                currency="CZK",
            ),
        ]
    )
    await db_session.commit()
    response = await client.get("/api/v1/deals", headers=_auth(sales))
    names = {it["name"] for it in response.json()["items"]}
    assert names == {"Mine"}


async def test_list_deals_rejects_missing_token(client: AsyncClient) -> None:
    response = await client.get("/api/v1/deals")
    assert response.status_code == 401


# get_deal ----------------------------------------------------------------


async def test_get_deal_happy(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = await _seed_company(db_session, org)
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=stage.id,
        owner_user_id=admin.id,
        name="Target",
        value=Decimal("0"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.commit()
    response = await client.get(f"/api/v1/deals/{deal.id}", headers=_auth(admin))
    assert response.status_code == 200
    assert response.json()["name"] == "Target"


async def test_get_deal_cross_org_denied(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    first_org, _ = await _seed_org_with_pipeline(db_session, owned_cleanup)
    second_org, second_stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    first_admin = await _seed_user(db_session, owned_cleanup, first_org, UserRole.admin)
    second_company = await _seed_company(db_session, second_org)
    hidden = Deal(
        organization_id=second_org.id,
        company_id=second_company.id,
        stage_id=second_stage.id,
        name="Secret",
        value=Decimal("0"),
        currency="CZK",
    )
    db_session.add(hidden)
    await db_session.commit()
    response = await client.get(f"/api/v1/deals/{hidden.id}", headers=_auth(first_admin))
    assert response.status_code == 404


async def test_get_deal_missing_returns_404(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _ = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    response = await client.get(f"/api/v1/deals/{uuid.uuid4()}", headers=_auth(admin))
    assert response.status_code == 404


# create_deal -------------------------------------------------------------


async def test_create_deal_happy_defaults_currency_to_org(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = await _seed_company(db_session, org)
    response = await client.post(
        "/api/v1/deals",
        headers=_auth(admin),
        json={
            "name": "Pilot",
            "company_id": str(company.id),
            "stage_id": str(stage.id),
            "value": "42500.00",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Pilot"
    assert body["currency"] == "CZK"
    assert body["value"] == "42500.00"


async def test_create_deal_validation_error(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = await _seed_company(db_session, org)
    response = await client.post(
        "/api/v1/deals",
        headers=_auth(admin),
        json={
            "name": "Nevalidní",
            "company_id": str(company.id),
            "stage_id": str(stage.id),
            "probability_override": 150,
        },
    )
    assert response.status_code == 422


async def test_create_deal_rejects_cross_org_company(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    first_org, first_stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    second_org, _ = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, first_org, UserRole.admin)
    foreign_company = await _seed_company(db_session, second_org)
    response = await client.post(
        "/api/v1/deals",
        headers=_auth(admin),
        json={
            "name": "Hijack",
            "company_id": str(foreign_company.id),
            "stage_id": str(first_stage.id),
        },
    )
    assert response.status_code == 400


async def test_create_deal_salesperson_cannot_assign_other(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    other = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    company = await _seed_company(db_session, org)
    response = await client.post(
        "/api/v1/deals",
        headers=_auth(sales),
        json={
            "name": "Mine but theirs",
            "company_id": str(company.id),
            "stage_id": str(stage.id),
            "owner_user_id": str(other.id),
        },
    )
    assert response.status_code == 403


# update_deal -------------------------------------------------------------


async def test_update_deal_happy(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = await _seed_company(db_session, org)
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=stage.id,
        owner_user_id=admin.id,
        name="Old",
        value=Decimal("0"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.commit()
    response = await client.put(
        f"/api/v1/deals/{deal.id}",
        headers=_auth(admin),
        json={"name": "New", "value": "1000.00"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "New"
    assert response.json()["value"] == "1000.00"


async def test_update_deal_rejects_cross_org_stage(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    first_org, first_stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    _, second_stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, first_org, UserRole.admin)
    company = await _seed_company(db_session, first_org)
    deal = Deal(
        organization_id=first_org.id,
        company_id=company.id,
        stage_id=first_stage.id,
        owner_user_id=admin.id,
        name="Local",
        value=Decimal("0"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.commit()
    response = await client.put(
        f"/api/v1/deals/{deal.id}",
        headers=_auth(admin),
        json={"stage_id": str(second_stage.id)},
    )
    assert response.status_code == 400


async def test_update_deal_salesperson_cannot_edit_foreign(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    other = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    company = await _seed_company(db_session, org)
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=stage.id,
        owner_user_id=other.id,
        name="Theirs",
        value=Decimal("0"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.commit()
    response = await client.put(
        f"/api/v1/deals/{deal.id}",
        headers=_auth(sales),
        json={"name": "Hijack"},
    )
    assert response.status_code == 404  # visibility-first


# delete_deal -------------------------------------------------------------


async def test_delete_deal_admin_ok(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = await _seed_company(db_session, org)
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=stage.id,
        name="Doomed",
        value=Decimal("0"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.commit()
    response = await client.delete(f"/api/v1/deals/{deal.id}", headers=_auth(admin))
    assert response.status_code == 204


async def test_delete_deal_non_admin_forbidden(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    company = await _seed_company(db_session, org)
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=stage.id,
        owner_user_id=sales.id,
        name="Safe",
        value=Decimal("0"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.commit()
    response = await client.delete(f"/api/v1/deals/{deal.id}", headers=_auth(sales))
    assert response.status_code == 403


async def test_delete_deal_rejects_missing_token(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    company = await _seed_company(db_session, org)
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=stage.id,
        name="NoAuth",
        value=Decimal("0"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.commit()
    response = await client.delete(f"/api/v1/deals/{deal.id}")
    assert response.status_code == 401


# move_deal_stage --------------------------------------------------------


async def test_move_deal_stage_happy(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    from sqlalchemy import select as sql_select

    from app.db.models import Pipeline, Stage

    org, first_stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = await _seed_company(db_session, org)

    stages_stmt = sql_select(Stage).join(Pipeline).where(Pipeline.organization_id == org.id)
    stages = (await db_session.execute(stages_stmt)).scalars().all()
    second_stage = next(s for s in stages if s.position == 1)

    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=first_stage.id,
        owner_user_id=admin.id,
        name="Mover",
        value=Decimal("0"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.commit()

    response = await client.post(
        f"/api/v1/deals/{deal.id}/move-stage",
        headers=_auth(admin),
        json={"stage_id": str(second_stage.id)},
    )
    assert response.status_code == 200
    assert response.json()["stage_id"] == str(second_stage.id)


async def test_move_deal_stage_cross_org_rejected(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    first_org, first_stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    _second_org, second_stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, first_org, UserRole.admin)
    company = await _seed_company(db_session, first_org)
    deal = Deal(
        organization_id=first_org.id,
        company_id=company.id,
        stage_id=first_stage.id,
        owner_user_id=admin.id,
        name="Local",
        value=Decimal("0"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.commit()

    response = await client.post(
        f"/api/v1/deals/{deal.id}/move-stage",
        headers=_auth(admin),
        json={"stage_id": str(second_stage.id)},
    )
    assert response.status_code == 400


async def test_mark_won_moves_to_won_stage_and_touches_company(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    from sqlalchemy import select as sql_select

    from app.db.models import Pipeline, Stage
    from app.db.models.enums import StageType

    org, first_stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = await _seed_company(db_session, org)
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=first_stage.id,
        owner_user_id=admin.id,
        name="Big win",
        value=Decimal("50000"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.commit()

    response = await client.post(f"/api/v1/deals/{deal.id}/mark-won", headers=_auth(admin))
    assert response.status_code == 200
    body = response.json()
    assert body["closed_at"] is not None
    assert body["lost_reason"] is None

    stmt = (
        sql_select(Stage)
        .join(Pipeline)
        .where(Pipeline.organization_id == org.id, Stage.stage_type == StageType.won)
    )
    won_stage = (await db_session.execute(stmt)).scalar_one()
    assert body["stage_id"] == str(won_stage.id)

    # Company's last_order_at is freshly set. Use a fresh session so we
    # don't race with the endpoint's own commit.
    async with AsyncSessionLocal() as fresh:
        refreshed = await fresh.get(Company, company.id)
        assert refreshed is not None
        assert refreshed.last_order_at is not None


async def test_mark_lost_requires_reason(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = await _seed_company(db_session, org)
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=stage.id,
        owner_user_id=admin.id,
        name="Going south",
        value=Decimal("0"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.commit()

    missing = await client.post(f"/api/v1/deals/{deal.id}/mark-lost", headers=_auth(admin), json={})
    assert missing.status_code == 422

    ok = await client.post(
        f"/api/v1/deals/{deal.id}/mark-lost",
        headers=_auth(admin),
        json={"lost_reason": "Klient vybral konkurenci"},
    )
    assert ok.status_code == 200
    body = ok.json()
    assert body["closed_at"] is not None
    assert body["lost_reason"] == "Klient vybral konkurenci"


async def test_mark_won_rejects_foreign_deal(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    other = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    company = await _seed_company(db_session, org)
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=stage.id,
        owner_user_id=other.id,
        name="Theirs",
        value=Decimal("0"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.commit()
    response = await client.post(f"/api/v1/deals/{deal.id}/mark-won", headers=_auth(sales))
    assert response.status_code == 404


async def test_move_deal_stage_foreign_deal_returns_404(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    other = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    company = await _seed_company(db_session, org)
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=stage.id,
        owner_user_id=other.id,
        name="Theirs",
        value=Decimal("0"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.commit()
    response = await client.post(
        f"/api/v1/deals/{deal.id}/move-stage",
        headers=_auth(sales),
        json={"stage_id": str(stage.id)},
    )
    assert response.status_code == 404  # visibility-first
