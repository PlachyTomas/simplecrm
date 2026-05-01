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


async def test_pipeline_board_excludes_closed_deals(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """Closed-as-lost deals stay in their original (open-type) stage but must
    not appear on the kanban board, which represents the active funnel only.
    """
    from datetime import UTC, datetime

    org, user, stages = await _seed(db_session, owned_cleanup)
    company = Company(organization_id=org.id, name="Co")
    db_session.add(company)
    await db_session.commit()

    now = datetime.now(tz=UTC)
    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=stages[0].id,
                name="Open",
                value=Decimal("100.00"),
                currency="CZK",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=stages[0].id,
                name="Closed-as-lost",
                value=Decimal("999.00"),
                currency="CZK",
                closed_at=now,
                lost_reason="Cena",
            ),
        ]
    )
    await db_session.commit()

    response = await client.get("/api/v1/pipelines/default/board", headers=_auth(user))
    assert response.status_code == 200
    first = response.json()["stages"][0]
    assert first["deal_count"] == 1
    assert first["total_value"] == "100.00"
    assert {d["name"] for d in first["deals"]} == {"Open"}


async def test_pipeline_board_won_rolling_window(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """The won column shows wons within the rolling window only (default 30d).

    Older wons can be surfaced by passing a wider window (or by omitting
    the param to show all). Open deals are unaffected.
    """
    from datetime import UTC, datetime, timedelta

    org, user, stages = await _seed(db_session, owned_cleanup)
    company = Company(organization_id=org.id, name="Co")
    db_session.add(company)
    await db_session.commit()

    won_stage = next(s for s in stages if s.stage_type.value == "won")
    now = datetime.now(tz=UTC)
    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=won_stage.id,
                name="Won-recent",
                value=Decimal("100.00"),
                currency="CZK",
                closed_at=now - timedelta(days=10),
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=won_stage.id,
                name="Won-old",
                value=Decimal("999.00"),
                currency="CZK",
                closed_at=now - timedelta(days=120),
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=stages[0].id,
                name="Open",
                value=Decimal("50.00"),
                currency="CZK",
            ),
        ]
    )
    await db_session.commit()

    # Default URL (no win window) shows every won — the frontend chooses
    # the rolling window default; the API treats absence as "show all".
    r = await client.get("/api/v1/pipelines/default/board", headers=_auth(user))
    assert r.status_code == 200
    body = r.json()
    won_col = next(s for s in body["stages"] if s["stage_type"] == "won")
    assert {d["name"] for d in won_col["deals"]} == {"Won-recent", "Won-old"}
    open_col = next(s for s in body["stages"] if s["id"] == str(stages[0].id))
    assert {d["name"] for d in open_col["deals"]} == {"Open"}

    # Explicit 30-day window hides the older win.
    r = await client.get(
        "/api/v1/pipelines/default/board?won_window_days=30", headers=_auth(user)
    )
    won_col = next(s for s in r.json()["stages"] if s["stage_type"] == "won")
    assert {d["name"] for d in won_col["deals"]} == {"Won-recent"}


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


async def test_admin_can_create_and_update_stage(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _org, user, stages = await _seed(db_session, owned_cleanup)
    response = await client.post(
        "/api/v1/pipelines/default/stages",
        headers=_auth(user),
        json={
            "name": "Kvalifikace",
            "default_probability": 20,
            "color": "#112233",
            "stage_type": "open",
        },
    )
    assert response.status_code == 201, response.text
    created = response.json()
    assert created["name"] == "Kvalifikace"
    assert created["default_probability"] == 20

    patch = await client.patch(
        f"/api/v1/pipelines/stages/{created['id']}",
        headers=_auth(user),
        json={"name": "Kvalifikace A", "default_probability": 35},
    )
    assert patch.status_code == 200
    body = patch.json()
    assert body["name"] == "Kvalifikace A"
    assert body["default_probability"] == 35
    # First stage still present — create appended at the end.
    assert body["position"] > stages[-1].position


async def test_salesperson_cannot_create_stage(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _org, user, _stages = await _seed(db_session, owned_cleanup, role=UserRole.salesperson)
    response = await client.post(
        "/api/v1/pipelines/default/stages",
        headers=_auth(user),
        json={"name": "Sales", "default_probability": 0, "color": "#112233"},
    )
    assert response.status_code == 403


async def test_delete_stage_refuses_when_deals_present(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, user, stages = await _seed(db_session, owned_cleanup)
    company = Company(organization_id=org.id, name="C")
    db_session.add(company)
    await db_session.commit()
    await db_session.refresh(company)
    db_session.add(
        Deal(
            organization_id=org.id,
            company_id=company.id,
            stage_id=stages[0].id,
            owner_user_id=user.id,
            name="Blocker",
            value=Decimal("100"),
            currency="CZK",
        )
    )
    await db_session.commit()

    response = await client.delete(
        f"/api/v1/pipelines/stages/{stages[0].id}", headers=_auth(user)
    )
    assert response.status_code == 409


async def test_delete_empty_stage_succeeds(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _org, user, stages = await _seed(db_session, owned_cleanup)
    # stages[0] is empty in a fresh org.
    response = await client.delete(
        f"/api/v1/pipelines/stages/{stages[0].id}", headers=_auth(user)
    )
    assert response.status_code == 204


async def test_reorder_stages_updates_positions(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _org, user, stages = await _seed(db_session, owned_cleanup)
    ids = [str(s.id) for s in stages]
    reversed_ids = list(reversed(ids))
    response = await client.post(
        "/api/v1/pipelines/default/reorder-stages",
        headers=_auth(user),
        json={"stage_ids": reversed_ids},
    )
    assert response.status_code == 200, response.text
    got_order = [s["id"] for s in sorted(response.json()["stages"], key=lambda s: s["position"])]
    assert got_order == reversed_ids


async def test_reorder_stages_rejects_foreign_ids(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _org, user, stages = await _seed(db_session, owned_cleanup)
    bad_ids = [str(stages[0].id), str(uuid.uuid4())]
    response = await client.post(
        "/api/v1/pipelines/default/reorder-stages",
        headers=_auth(user),
        json={"stage_ids": bad_ids},
    )
    assert response.status_code == 400
