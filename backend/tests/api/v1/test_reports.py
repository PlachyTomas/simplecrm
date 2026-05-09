"""Integration tests for /api/v1/reports/*."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import Company, Deal, Organization, Pipeline, Stage, Team, User, UserRole
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
    other = User(email=other_email, name="Other", role=UserRole.admin, organization_id=org.id)
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

    response = await client.get("/api/v1/reports/pipeline-velocity", headers=_auth(user))
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


async def test_team_leaderboard_groups_by_team_for_admin(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, admin, _open_stage, won_stage, company = await _setup(db_session, owned_cleanup)
    now = datetime.now(tz=UTC)

    team_a = Team(organization_id=org.id, name="Tým A")
    team_b = Team(organization_id=org.id, name="Tým B")
    db_session.add_all([team_a, team_b])
    await db_session.commit()
    await db_session.refresh(team_a)
    await db_session.refresh(team_b)

    members: list[User] = []
    for team, label in [(team_a, "a"), (team_b, "b")]:
        email = f"{label}-{uuid.uuid4().hex[:6]}@ex.cz"
        owned_cleanup["emails"].append(email)
        member = User(
            email=email,
            name=f"Member {label}",
            role=UserRole.salesperson,
            organization_id=org.id,
            team_id=team.id,
        )
        db_session.add(member)
        members.append(member)
    await db_session.commit()
    for m in members:
        await db_session.refresh(m)
    member_a, member_b = members

    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=won_stage.id,
                owner_user_id=member_a.id,
                name="A won",
                value=Decimal("1000"),
                currency="CZK",
                closed_at=now,
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=won_stage.id,
                owner_user_id=member_b.id,
                name="B won 1",
                value=Decimal("400"),
                currency="CZK",
                closed_at=now,
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=won_stage.id,
                owner_user_id=member_b.id,
                name="B won 2",
                value=Decimal("300"),
                currency="CZK",
                closed_at=now,
            ),
        ]
    )
    await db_session.commit()

    response = await client.get("/api/v1/reports/team-leaderboard", headers=_auth(admin))
    assert response.status_code == 200
    body = response.json()
    assert body["metric"] == "won_value"
    rows = body["rows"]
    by_id = {r["team_id"]: r for r in rows}
    assert Decimal(by_id[str(team_a.id)]["won_value"]) == Decimal("1000")
    assert by_id[str(team_a.id)]["won_count"] == 1
    assert Decimal(by_id[str(team_b.id)]["won_value"]) == Decimal("700")
    assert by_id[str(team_b.id)]["won_count"] == 2
    # team_a sorts first (higher won_value).
    assert rows[0]["team_id"] == str(team_a.id)


async def test_team_leaderboard_scopes_to_managed_teams_for_manager(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _admin, _open_stage, won_stage, company = await _setup(db_session, owned_cleanup)
    now = datetime.now(tz=UTC)

    manager_email = f"mgr-{uuid.uuid4().hex[:6]}@ex.cz"
    owned_cleanup["emails"].append(manager_email)
    manager = User(
        email=manager_email,
        name="Mgr",
        role=UserRole.manager,
        organization_id=org.id,
    )
    db_session.add(manager)
    await db_session.commit()
    await db_session.refresh(manager)

    managed = Team(organization_id=org.id, name="Managed", manager_user_id=manager.id)
    other = Team(organization_id=org.id, name="Other")
    db_session.add_all([managed, other])
    await db_session.commit()
    await db_session.refresh(managed)
    await db_session.refresh(other)

    sp_email = f"sp-{uuid.uuid4().hex[:6]}@ex.cz"
    owned_cleanup["emails"].append(sp_email)
    sp = User(
        email=sp_email,
        name="SP",
        role=UserRole.salesperson,
        organization_id=org.id,
        team_id=managed.id,
    )
    db_session.add(sp)
    await db_session.commit()
    await db_session.refresh(sp)

    db_session.add(
        Deal(
            organization_id=org.id,
            company_id=company.id,
            stage_id=won_stage.id,
            owner_user_id=sp.id,
            name="Managed won",
            value=Decimal("250"),
            currency="CZK",
            closed_at=now,
        )
    )
    await db_session.commit()

    response = await client.get("/api/v1/reports/team-leaderboard", headers=_auth(manager))
    assert response.status_code == 200
    body = response.json()
    rows = body["rows"]
    assert {r["team_id"] for r in rows} == {str(managed.id)}
    assert Decimal(rows[0]["won_value"]) == Decimal("250")


async def test_team_leaderboard_blocked_for_salesperson_when_toggle_off(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _admin, _open_stage, _won_stage, _company = await _setup(db_session, owned_cleanup)
    sp_email = f"sp-{uuid.uuid4().hex[:6]}@ex.cz"
    owned_cleanup["emails"].append(sp_email)
    sp = User(email=sp_email, name="SP", role=UserRole.salesperson, organization_id=org.id)
    db_session.add(sp)
    await db_session.commit()
    await db_session.refresh(sp)

    response = await client.get("/api/v1/reports/team-leaderboard", headers=_auth(sp))
    assert response.status_code == 403
    body = response.json()
    detail = body["detail"]
    assert isinstance(detail, dict)
    assert detail["code"] == "leaderboard_hidden"


async def test_team_leaderboard_visible_to_salesperson_when_toggle_on(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _admin, _open_stage, _won_stage, _company = await _setup(db_session, owned_cleanup)
    org.show_leaderboard_to_salespeople = True
    await db_session.commit()

    sp_email = f"sp-{uuid.uuid4().hex[:6]}@ex.cz"
    owned_cleanup["emails"].append(sp_email)
    sp = User(email=sp_email, name="SP", role=UserRole.salesperson, organization_id=org.id)
    db_session.add(sp)
    await db_session.commit()
    await db_session.refresh(sp)

    response = await client.get("/api/v1/reports/team-leaderboard", headers=_auth(sp))
    assert response.status_code == 200


async def test_leaderboard_team_id_filters_to_team_members(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, admin, _open_stage, won_stage, company = await _setup(db_session, owned_cleanup)
    now = datetime.now(tz=UTC)

    team_a = Team(organization_id=org.id, name="A")
    team_b = Team(organization_id=org.id, name="B")
    db_session.add_all([team_a, team_b])
    await db_session.commit()
    await db_session.refresh(team_a)
    await db_session.refresh(team_b)

    members: list[User] = []
    for team, label in [(team_a, "a"), (team_b, "b")]:
        email = f"m-{label}-{uuid.uuid4().hex[:6]}@ex.cz"
        owned_cleanup["emails"].append(email)
        m = User(
            email=email,
            name=f"M{label}",
            role=UserRole.salesperson,
            organization_id=org.id,
            team_id=team.id,
        )
        db_session.add(m)
        members.append(m)
    await db_session.commit()
    for m in members:
        await db_session.refresh(m)

    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=won_stage.id,
                owner_user_id=members[0].id,
                name="A won",
                value=Decimal("100"),
                currency="CZK",
                closed_at=now,
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=won_stage.id,
                owner_user_id=members[1].id,
                name="B won",
                value=Decimal("200"),
                currency="CZK",
                closed_at=now,
            ),
        ]
    )
    await db_session.commit()

    response = await client.get(
        f"/api/v1/reports/leaderboard?team_id={team_a.id}", headers=_auth(admin)
    )
    assert response.status_code == 200
    body = response.json()
    rows = body["rows"]
    assert len(rows) == 1
    assert rows[0]["name"] == "Ma"


async def test_my_summary_counts_companies_added_and_won_deals(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, user, open_stage, won_stage, _seed_company = await _setup(db_session, owned_cleanup)
    now = datetime.now(tz=UTC)

    # Two companies added by `user` in the window (the seed company has no owner).
    db_session.add_all(
        [
            Company(organization_id=org.id, name="C1", owner_user_id=user.id),
            Company(organization_id=org.id, name="C2", owner_user_id=user.id),
        ]
    )
    # One deal won, one deal closed-as-lost (per the brief: lost deals stay
    # in their current open-type stage, just with closed_at + lost_reason).
    # Conversion = 1 won / 2 closed = 0.5.
    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=_seed_company.id,
                stage_id=won_stage.id,
                owner_user_id=user.id,
                name="Won",
                value=Decimal("500"),
                currency="CZK",
                closed_at=now,
            ),
            Deal(
                organization_id=org.id,
                company_id=_seed_company.id,
                stage_id=open_stage.id,
                owner_user_id=user.id,
                name="Lost",
                value=Decimal("100"),
                currency="CZK",
                closed_at=now,
                lost_reason="Cena",
            ),
        ]
    )
    await db_session.commit()

    response = await client.get("/api/v1/reports/my-summary", headers=_auth(user))
    assert response.status_code == 200
    body = response.json()
    assert body["companies_added"] == 2
    assert body["deals_won_count"] == 1
    assert Decimal(body["deals_won_value"]) == Decimal("500")
    assert body["conversion_rate"] is not None
    assert abs(body["conversion_rate"] - 0.5) < 1e-9


async def test_my_summary_returns_null_conversion_with_no_closed_deals(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _org, user, _open_stage, _won_stage, _company = await _setup(db_session, owned_cleanup)
    response = await client.get("/api/v1/reports/my-summary", headers=_auth(user))
    assert response.status_code == 200
    body = response.json()
    assert body["companies_added"] == 0
    assert body["deals_won_count"] == 0
    assert body["conversion_rate"] is None
    assert body["avg_cycle_days"] is None


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


# ---------------------------------------------------------------------------
# Configurable widget dashboard — layout endpoints (R1)
# ---------------------------------------------------------------------------


async def test_dashboard_config_returns_default_for_first_visit(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """Empty `{}` (column-default) → API returns the 8-widget starter set."""
    _, user, *_ = await _setup(db_session, owned_cleanup)
    resp = await client.get("/api/v1/reports/dashboard-config", headers=_auth(user))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["version"] == 1
    assert len(body["widgets"]) == 8
    types = [w["config"]["type"] for w in body["widgets"]]
    # Sanity-check the order from REPORTS_TASK §6.3.
    assert types[:4] == ["pipeline_value", "deals_won", "win_rate", "avg_deal_size"]


async def test_dashboard_config_put_persists_then_get_returns_persisted(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """PUT a custom layout, then GET returns exactly what was saved."""
    _, user, *_ = await _setup(db_session, owned_cleanup)
    payload = {
        "version": 1,
        "widgets": [
            {
                "id": "wid_01HXYZ",
                "position": {"x": 0, "y": 0, "w": 6, "h": 2},
                "config": {"type": "win_rate"},
            }
        ],
        "globalFilters": {
            "dateRange": {"preset": "last_7_days", "from": None, "to": None},
            "teamId": None,
            "ownerUserId": None,
        },
    }
    put_resp = await client.put(
        "/api/v1/reports/dashboard-config",
        headers=_auth(user),
        json=payload,
    )
    assert put_resp.status_code == 200, put_resp.text
    get_resp = await client.get("/api/v1/reports/dashboard-config", headers=_auth(user))
    assert get_resp.status_code == 200
    body = get_resp.json()
    assert len(body["widgets"]) == 1
    assert body["widgets"][0]["config"]["type"] == "win_rate"
    assert body["globalFilters"]["dateRange"]["preset"] == "last_7_days"


async def test_dashboard_config_delete_resets_to_default(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, user, *_ = await _setup(db_session, owned_cleanup)
    # Persist a 1-widget layout, then DELETE, then GET should return defaults.
    await client.put(
        "/api/v1/reports/dashboard-config",
        headers=_auth(user),
        json={
            "version": 1,
            "widgets": [
                {
                    "id": "wid_only",
                    "position": {"x": 0, "y": 0, "w": 3, "h": 2},
                    "config": {"type": "win_rate"},
                }
            ],
        },
    )
    del_resp = await client.delete("/api/v1/reports/dashboard-config", headers=_auth(user))
    assert del_resp.status_code == 204
    get_resp = await client.get("/api/v1/reports/dashboard-config", headers=_auth(user))
    assert get_resp.status_code == 200
    assert len(get_resp.json()["widgets"]) == 8


async def test_dashboard_config_rejects_unknown_widget_type(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, user, *_ = await _setup(db_session, owned_cleanup)
    resp = await client.put(
        "/api/v1/reports/dashboard-config",
        headers=_auth(user),
        json={
            "version": 1,
            "widgets": [
                {
                    "id": "x",
                    "position": {"x": 0, "y": 0, "w": 3, "h": 2},
                    "config": {"type": "nonsense"},
                }
            ],
        },
    )
    assert resp.status_code == 422


async def test_dashboard_config_rejects_overlapping_widgets(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, user, *_ = await _setup(db_session, owned_cleanup)
    resp = await client.put(
        "/api/v1/reports/dashboard-config",
        headers=_auth(user),
        json={
            "version": 1,
            "widgets": [
                {
                    "id": "a",
                    "position": {"x": 0, "y": 0, "w": 6, "h": 2},
                    "config": {"type": "win_rate"},
                },
                {
                    "id": "b",
                    "position": {"x": 3, "y": 0, "w": 6, "h": 2},
                    "config": {"type": "deals_won"},
                },
            ],
        },
    )
    assert resp.status_code == 422
    assert "overlapping" in resp.text.lower()


async def test_dashboard_config_rejects_too_many_widgets(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, user, *_ = await _setup(db_session, owned_cleanup)
    # 21 1×1 widgets stacked vertically — overlap-free, but over the cap.
    widgets = [
        {
            "id": f"w{i}",
            "position": {"x": 0, "y": i, "w": 1, "h": 1},
            "config": {"type": "win_rate"},
        }
        for i in range(21)
    ]
    resp = await client.put(
        "/api/v1/reports/dashboard-config",
        headers=_auth(user),
        json={"version": 1, "widgets": widgets},
    )
    assert resp.status_code == 422


async def test_dashboard_config_blocks_salesperson(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """Salespeople hit 403 on GET, PUT, and DELETE."""
    org, _admin, *_ = await _setup(db_session, owned_cleanup)
    salesperson_email = f"s-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(salesperson_email)
    salesperson = User(
        email=salesperson_email,
        name="Sales",
        role=UserRole.salesperson,
        organization_id=org.id,
    )
    db_session.add(salesperson)
    await db_session.commit()
    await db_session.refresh(salesperson)
    headers = _auth(salesperson)

    for verb, fn in (
        ("get", client.get),
        ("delete", client.delete),
    ):
        resp = await fn("/api/v1/reports/dashboard-config", headers=headers)
        assert resp.status_code == 403, f"{verb}: {resp.text}"
    put_resp = await client.put(
        "/api/v1/reports/dashboard-config",
        headers=headers,
        json={"version": 1, "widgets": []},
    )
    assert put_resp.status_code == 403


# ---------------------------------------------------------------------------
# Widget endpoints, batch 1 (R2): pipeline_value, deals_won, win_rate, avg_deal_size
# ---------------------------------------------------------------------------


async def _seed_widget_corpus(
    session: AsyncSession,
    *,
    org: Organization,
    user: User,
    open_stage: Stage,
    won_stage: Stage,
    lost_stage: Stage,
    company: Company,
) -> None:
    """Seed deals across the trailing 30 days + the previous 30-day window
    so widget endpoints have non-trivial data to compute on. All values
    are in `org.currency` so currency mismatches don't drop them.
    """

    now = datetime.now(tz=UTC)
    cur_in = now - timedelta(days=10)
    cur_in2 = now - timedelta(days=5)
    prev_in = now - timedelta(days=40)
    prev_in2 = now - timedelta(days=45)

    session.add_all(
        [
            # Two open deals created in current window (count 2, sum 300).
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=open_stage.id,
                owner_user_id=user.id,
                name="O1",
                value=Decimal("100"),
                currency=org.currency,
                created_at=cur_in,
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=open_stage.id,
                owner_user_id=user.id,
                name="O2",
                value=Decimal("200"),
                currency=org.currency,
                created_at=cur_in2,
            ),
            # One open deal created in the previous window (count 1, sum 80).
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=open_stage.id,
                owner_user_id=user.id,
                name="O0",
                value=Decimal("80"),
                currency=org.currency,
                created_at=prev_in,
            ),
            # Two won deals closed in current window (count 2, sum 700).
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=won_stage.id,
                owner_user_id=user.id,
                name="W1",
                value=Decimal("300"),
                currency=org.currency,
                closed_at=cur_in,
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=won_stage.id,
                owner_user_id=user.id,
                name="W2",
                value=Decimal("400"),
                currency=org.currency,
                closed_at=cur_in2,
            ),
            # One lost deal closed in current window. Win rate denom = 3.
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=lost_stage.id,
                owner_user_id=user.id,
                name="L1",
                value=Decimal("50"),
                currency=org.currency,
                closed_at=cur_in,
                lost_reason="cena",
            ),
            # One won deal closed in the previous window (count 1, sum 250).
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=won_stage.id,
                owner_user_id=user.id,
                name="W0",
                value=Decimal("250"),
                currency=org.currency,
                closed_at=prev_in2,
            ),
        ]
    )
    await session.commit()


async def _setup_with_lost_stage(
    session: AsyncSession, owned_cleanup: dict[str, list]
) -> tuple[Organization, User, Stage, Stage, Stage, Company]:
    """Like _setup but also returns a lost stage so win_rate has a denom."""

    org, user, open_stage, won_stage, company = await _setup(session, owned_cleanup)
    # Find or create a lost stage. The default pipeline doesn't include
    # one, so add it here.
    pipeline_id = open_stage.pipeline_id
    lost_stage = Stage(
        pipeline_id=pipeline_id,
        name="Prohráno",
        default_probability=0,
        color="#6B7280",
        position=99,
        stage_type=StageType.lost,
    )
    session.add(lost_stage)
    await session.commit()
    await session.refresh(lost_stage)
    return org, user, open_stage, won_stage, lost_stage, company


def _window_params() -> dict[str, str]:
    """Last 30 days, formatted as ISO."""
    today = datetime.now(tz=UTC).date()
    thirty = today - timedelta(days=29)
    return {"from": thirty.isoformat(), "to": today.isoformat()}


async def test_widget_pipeline_value_happy(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, user, open_stage, won_stage, lost_stage, company = await _setup_with_lost_stage(
        db_session, owned_cleanup
    )
    await _seed_widget_corpus(
        db_session,
        org=org,
        user=user,
        open_stage=open_stage,
        won_stage=won_stage,
        lost_stage=lost_stage,
        company=company,
    )
    resp = await client.get(
        "/api/v1/reports/widgets/pipeline-value",
        headers=_auth(user),
        params=_window_params(),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Two open deals (100 + 200) created in the current window.
    assert Decimal(str(body["value"])) == Decimal("300")
    assert body["currency"] == org.currency
    assert body["comparison"] is not None
    # Previous window contained 1 open deal (80).
    assert Decimal(str(body["comparison"]["value"])) == Decimal("80")


async def test_widget_pipeline_value_validates_window(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, user, *_ = await _setup(db_session, owned_cleanup)
    today = datetime.now(tz=UTC).date()
    yesterday = today - timedelta(days=1)
    resp = await client.get(
        "/api/v1/reports/widgets/pipeline-value",
        headers=_auth(user),
        params={"from": today.isoformat(), "to": yesterday.isoformat()},
    )
    assert resp.status_code == 422


async def test_widget_pipeline_value_blocks_salesperson(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _admin, *_ = await _setup(db_session, owned_cleanup)
    sp_email = f"sp-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(sp_email)
    sp = User(email=sp_email, name="SP", role=UserRole.salesperson, organization_id=org.id)
    db_session.add(sp)
    await db_session.commit()
    await db_session.refresh(sp)
    resp = await client.get(
        "/api/v1/reports/widgets/pipeline-value",
        headers=_auth(sp),
        params=_window_params(),
    )
    assert resp.status_code == 403


async def test_widget_deals_won_happy_with_comparison(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, user, open_stage, won_stage, lost_stage, company = await _setup_with_lost_stage(
        db_session, owned_cleanup
    )
    await _seed_widget_corpus(
        db_session,
        org=org,
        user=user,
        open_stage=open_stage,
        won_stage=won_stage,
        lost_stage=lost_stage,
        company=company,
    )
    resp = await client.get(
        "/api/v1/reports/widgets/deals-won",
        headers=_auth(user),
        params=_window_params(),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["count"] == 2
    assert Decimal(str(body["value"])) == Decimal("700")
    # Previous window: one won deal at 250.
    assert Decimal(str(body["comparison"]["value"])) == Decimal("250")
    # delta_pct = (700 - 250) / 250 * 100 = 180.0
    assert abs(body["comparison"]["delta_pct"] - 180.0) < 0.01


async def test_widget_deals_won_blocks_salesperson(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _admin, *_ = await _setup(db_session, owned_cleanup)
    sp_email = f"sp-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(sp_email)
    sp = User(email=sp_email, name="SP", role=UserRole.salesperson, organization_id=org.id)
    db_session.add(sp)
    await db_session.commit()
    await db_session.refresh(sp)
    resp = await client.get(
        "/api/v1/reports/widgets/deals-won",
        headers=_auth(sp),
        params=_window_params(),
    )
    assert resp.status_code == 403


async def test_widget_win_rate_with_denominator(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, user, open_stage, won_stage, lost_stage, company = await _setup_with_lost_stage(
        db_session, owned_cleanup
    )
    await _seed_widget_corpus(
        db_session,
        org=org,
        user=user,
        open_stage=open_stage,
        won_stage=won_stage,
        lost_stage=lost_stage,
        company=company,
    )
    resp = await client.get(
        "/api/v1/reports/widgets/win-rate",
        headers=_auth(user),
        params=_window_params(),
    )
    assert resp.status_code == 200
    body = resp.json()
    # 2 won + 1 lost = 3 closed; 2/3 ≈ 66.7
    assert body["won_count"] == 2
    assert body["lost_count"] == 1
    assert abs(body["value"] - 66.7) < 0.05


async def test_widget_win_rate_returns_none_when_no_closes(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """Empty denominator → value is None, not 0%."""
    _, user, *_ = await _setup_with_lost_stage(db_session, owned_cleanup)
    resp = await client.get(
        "/api/v1/reports/widgets/win-rate",
        headers=_auth(user),
        params=_window_params(),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["value"] is None
    assert body["won_count"] == 0
    assert body["lost_count"] == 0


async def test_widget_win_rate_blocks_salesperson(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _admin, *_ = await _setup(db_session, owned_cleanup)
    sp_email = f"sp-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(sp_email)
    sp = User(email=sp_email, name="SP", role=UserRole.salesperson, organization_id=org.id)
    db_session.add(sp)
    await db_session.commit()
    await db_session.refresh(sp)
    resp = await client.get(
        "/api/v1/reports/widgets/win-rate",
        headers=_auth(sp),
        params=_window_params(),
    )
    assert resp.status_code == 403


async def test_widget_avg_deal_size_won(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, user, open_stage, won_stage, lost_stage, company = await _setup_with_lost_stage(
        db_session, owned_cleanup
    )
    await _seed_widget_corpus(
        db_session,
        org=org,
        user=user,
        open_stage=open_stage,
        won_stage=won_stage,
        lost_stage=lost_stage,
        company=company,
    )
    resp = await client.get(
        "/api/v1/reports/widgets/avg-deal-size",
        headers=_auth(user),
        params={**_window_params(), "scope": "won"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Avg of 300 + 400 = 350 over 2 won deals.
    assert Decimal(str(body["value"])) == Decimal("350")
    assert body["sample_count"] == 2


async def test_widget_avg_deal_size_validation(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, user, *_ = await _setup(db_session, owned_cleanup)
    resp = await client.get(
        "/api/v1/reports/widgets/avg-deal-size",
        headers=_auth(user),
        params={**_window_params(), "scope": "nonsense"},
    )
    assert resp.status_code == 422


async def test_widget_avg_deal_size_blocks_salesperson(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _admin, *_ = await _setup(db_session, owned_cleanup)
    sp_email = f"sp-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(sp_email)
    sp = User(email=sp_email, name="SP", role=UserRole.salesperson, organization_id=org.id)
    db_session.add(sp)
    await db_session.commit()
    await db_session.refresh(sp)
    resp = await client.get(
        "/api/v1/reports/widgets/avg-deal-size",
        headers=_auth(sp),
        params=_window_params(),
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Widget endpoints, batch 2 (R3): new_companies, sales_cycle_length, lead_to_deal_conversion
# ---------------------------------------------------------------------------


async def test_widget_new_companies_happy(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, user, *_ = await _setup(db_session, owned_cleanup)
    now = datetime.now(tz=UTC)
    # Two companies created in the current window, one in the previous.
    db_session.add_all(
        [
            Company(
                organization_id=org.id,
                name="C1",
                owner_user_id=user.id,
                created_at=now - timedelta(days=5),
            ),
            Company(
                organization_id=org.id,
                name="C2",
                owner_user_id=user.id,
                created_at=now - timedelta(days=10),
            ),
            Company(
                organization_id=org.id,
                name="C0",
                owner_user_id=user.id,
                created_at=now - timedelta(days=40),
            ),
        ]
    )
    await db_session.commit()
    resp = await client.get(
        "/api/v1/reports/widgets/new-companies",
        headers=_auth(user),
        params=_window_params(),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Note: _setup() also creates one company "Co" with owner_user_id=None,
    # which still counts under the org.
    assert body["value"] >= 2
    # The previous-period count: 1 (the "C0" we just seeded). _setup()'s
    # "Co" was also created at "now" so it sits in the current window.
    assert body["comparison"]["value"] == 1


async def test_widget_new_companies_blocks_salesperson(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _admin, *_ = await _setup(db_session, owned_cleanup)
    sp_email = f"sp-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(sp_email)
    sp = User(email=sp_email, name="SP", role=UserRole.salesperson, organization_id=org.id)
    db_session.add(sp)
    await db_session.commit()
    await db_session.refresh(sp)
    resp = await client.get(
        "/api/v1/reports/widgets/new-companies",
        headers=_auth(sp),
        params=_window_params(),
    )
    assert resp.status_code == 403


async def test_widget_new_companies_validates(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, user, *_ = await _setup(db_session, owned_cleanup)
    resp = await client.get(
        "/api/v1/reports/widgets/new-companies",
        headers=_auth(user),
        params={**_window_params(), "breakdown": "nonsense"},
    )
    assert resp.status_code == 422


async def test_widget_sales_cycle_length_returns_median_and_mean(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, user, _open, won_stage, _ = await _setup(db_session, owned_cleanup)
    now = datetime.now(tz=UTC)
    # Three won deals with different cycle lengths so median ≠ mean.
    company_a = Company(organization_id=org.id, name="A", created_at=now - timedelta(days=20))
    company_b = Company(organization_id=org.id, name="B", created_at=now - timedelta(days=30))
    company_c = Company(organization_id=org.id, name="C", created_at=now - timedelta(days=100))
    db_session.add_all([company_a, company_b, company_c])
    await db_session.commit()
    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company_a.id,
                stage_id=won_stage.id,
                owner_user_id=user.id,
                name="D-A",
                value=Decimal("100"),
                currency=org.currency,
                closed_at=now - timedelta(days=5),
            ),
            Deal(
                organization_id=org.id,
                company_id=company_b.id,
                stage_id=won_stage.id,
                owner_user_id=user.id,
                name="D-B",
                value=Decimal("100"),
                currency=org.currency,
                closed_at=now - timedelta(days=5),
            ),
            Deal(
                organization_id=org.id,
                company_id=company_c.id,
                stage_id=won_stage.id,
                owner_user_id=user.id,
                name="D-C",
                value=Decimal("100"),
                currency=org.currency,
                closed_at=now - timedelta(days=5),
            ),
        ]
    )
    await db_session.commit()
    resp = await client.get(
        "/api/v1/reports/widgets/sales-cycle-length",
        headers=_auth(user),
        params=_window_params(),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["sample_count"] == 3
    # Cycle days: 15, 25, 95 → median 25, mean ≈ 45
    assert body["median_days"] == 25.0
    assert body["mean_days"] == 45.0
    # Default config metric is median.
    assert body["value"] == 25.0


async def test_widget_sales_cycle_length_returns_none_with_no_won_deals(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, user, *_ = await _setup(db_session, owned_cleanup)
    resp = await client.get(
        "/api/v1/reports/widgets/sales-cycle-length",
        headers=_auth(user),
        params=_window_params(),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["value"] is None
    assert body["sample_count"] == 0


async def test_widget_sales_cycle_length_blocks_salesperson(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _admin, *_ = await _setup(db_session, owned_cleanup)
    sp_email = f"sp-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(sp_email)
    sp = User(email=sp_email, name="SP", role=UserRole.salesperson, organization_id=org.id)
    db_session.add(sp)
    await db_session.commit()
    await db_session.refresh(sp)
    resp = await client.get(
        "/api/v1/reports/widgets/sales-cycle-length",
        headers=_auth(sp),
        params=_window_params(),
    )
    assert resp.status_code == 403


async def test_widget_lead_to_deal_conversion_happy(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """3 companies created in window; 1 of them has a deal → 33.3%."""
    org, user, open_stage, _won, _co = await _setup(db_session, owned_cleanup)
    now = datetime.now(tz=UTC)
    cur = now - timedelta(days=10)
    # _setup() already added "Co"; add two more without deals + one with.
    company_with_deal = Company(
        organization_id=org.id,
        name="CWD",
        owner_user_id=user.id,
        created_at=cur,
    )
    company_no_deal_1 = Company(
        organization_id=org.id,
        name="CND1",
        owner_user_id=user.id,
        created_at=cur,
    )
    company_no_deal_2 = Company(
        organization_id=org.id,
        name="CND2",
        owner_user_id=user.id,
        created_at=cur,
    )
    db_session.add_all([company_with_deal, company_no_deal_1, company_no_deal_2])
    await db_session.commit()
    db_session.add(
        Deal(
            organization_id=org.id,
            company_id=company_with_deal.id,
            stage_id=open_stage.id,
            owner_user_id=user.id,
            name="D",
            value=Decimal("100"),
            currency=org.currency,
            created_at=cur,
        )
    )
    await db_session.commit()
    resp = await client.get(
        "/api/v1/reports/widgets/lead-to-deal-conversion",
        headers=_auth(user),
        params=_window_params(),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # _setup creates "Co" too — so total = 4 companies, 1 converted → 25%.
    # That's still a meaningful test of the math.
    assert body["total_count"] == 4
    assert body["converted_count"] == 1
    assert body["value"] == 25.0


async def test_widget_lead_to_deal_conversion_returns_none_with_no_companies(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """Window with no companies → value is None, total/converted = 0."""
    org, user, *_ = await _setup(db_session, owned_cleanup)
    # Push the existing _setup company out of the window: shift its
    # created_at far back.
    await db_session.execute(
        Company.__table__.update()  # type: ignore[attr-defined]
        .where(Company.organization_id == org.id)
        .values(created_at=datetime.now(tz=UTC) - timedelta(days=200))
    )
    await db_session.commit()
    resp = await client.get(
        "/api/v1/reports/widgets/lead-to-deal-conversion",
        headers=_auth(user),
        params=_window_params(),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_count"] == 0
    assert body["converted_count"] == 0
    assert body["value"] is None


async def test_widget_lead_to_deal_conversion_blocks_salesperson(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _admin, *_ = await _setup(db_session, owned_cleanup)
    sp_email = f"sp-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(sp_email)
    sp = User(email=sp_email, name="SP", role=UserRole.salesperson, organization_id=org.id)
    db_session.add(sp)
    await db_session.commit()
    await db_session.refresh(sp)
    resp = await client.get(
        "/api/v1/reports/widgets/lead-to-deal-conversion",
        headers=_auth(sp),
        params=_window_params(),
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Widget endpoints, batch 3 (R4): lost_reasons_breakdown, sales_leaderboard,
# rep_activity, stale_deals, companies_at_risk
# ---------------------------------------------------------------------------


async def test_widget_lost_reasons_breakdown_groups_and_sorts(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, user, _open, _won, lost_stage, company = await _setup_with_lost_stage(
        db_session, owned_cleanup
    )
    now = datetime.now(tz=UTC)
    cur = now - timedelta(days=5)
    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=lost_stage.id,
                owner_user_id=user.id,
                name="L1",
                value=Decimal("100"),
                currency=org.currency,
                closed_at=cur,
                lost_reason="cena",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=lost_stage.id,
                owner_user_id=user.id,
                name="L2",
                value=Decimal("200"),
                currency=org.currency,
                closed_at=cur,
                lost_reason="cena",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=lost_stage.id,
                owner_user_id=user.id,
                name="L3",
                value=Decimal("50"),
                currency=org.currency,
                closed_at=cur,
                lost_reason="konkurence",
            ),
        ]
    )
    await db_session.commit()
    resp = await client.get(
        "/api/v1/reports/widgets/lost-reasons-breakdown",
        headers=_auth(user),
        params=_window_params(),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["items"]) == 2
    # Default display is "count" — cena has 2 deals, konkurence has 1.
    assert body["items"][0]["reason"] == "cena"
    assert body["items"][0]["count"] == 2
    assert body["items"][1]["reason"] == "konkurence"
    assert body["total_count"] == 3


async def test_widget_lost_reasons_blocks_salesperson(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _admin, *_ = await _setup(db_session, owned_cleanup)
    sp_email = f"sp-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(sp_email)
    sp = User(email=sp_email, name="SP", role=UserRole.salesperson, organization_id=org.id)
    db_session.add(sp)
    await db_session.commit()
    await db_session.refresh(sp)
    resp = await client.get(
        "/api/v1/reports/widgets/lost-reasons-breakdown",
        headers=_auth(sp),
        params=_window_params(),
    )
    assert resp.status_code == 403


async def test_widget_lost_reasons_validates(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, user, *_ = await _setup(db_session, owned_cleanup)
    resp = await client.get(
        "/api/v1/reports/widgets/lost-reasons-breakdown",
        headers=_auth(user),
        params={**_window_params(), "display": "garbage"},
    )
    assert resp.status_code == 422


async def test_widget_sales_leaderboard_won_value(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, user, _open, won_stage, _co = await _setup(db_session, owned_cleanup)
    # Add a second user; both close deals so leaderboard has two rows.
    second_email = f"u2-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(second_email)
    second = User(
        email=second_email, name="Second", role=UserRole.salesperson, organization_id=org.id
    )
    db_session.add(second)
    await db_session.commit()
    await db_session.refresh(second)

    company_for_second = Company(organization_id=org.id, name="C2")
    db_session.add(company_for_second)
    await db_session.commit()
    await db_session.refresh(company_for_second)

    now = datetime.now(tz=UTC)
    cur = now - timedelta(days=5)
    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company_for_second.id,
                stage_id=won_stage.id,
                owner_user_id=user.id,
                name="W-admin",
                value=Decimal("500"),
                currency=org.currency,
                closed_at=cur,
            ),
            Deal(
                organization_id=org.id,
                company_id=company_for_second.id,
                stage_id=won_stage.id,
                owner_user_id=second.id,
                name="W-second",
                value=Decimal("200"),
                currency=org.currency,
                closed_at=cur,
            ),
        ]
    )
    await db_session.commit()
    resp = await client.get(
        "/api/v1/reports/widgets/sales-leaderboard",
        headers=_auth(user),
        params=_window_params(),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["metric"] == "won_value"
    assert len(body["items"]) == 2
    # Sorted descending by value — admin (500) first, second (200) second.
    assert Decimal(str(body["items"][0]["metric_value"])) == Decimal("500")
    assert Decimal(str(body["items"][1]["metric_value"])) == Decimal("200")


async def test_widget_sales_leaderboard_blocks_salesperson(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _admin, *_ = await _setup(db_session, owned_cleanup)
    sp_email = f"sp-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(sp_email)
    sp = User(email=sp_email, name="SP", role=UserRole.salesperson, organization_id=org.id)
    db_session.add(sp)
    await db_session.commit()
    await db_session.refresh(sp)
    resp = await client.get(
        "/api/v1/reports/widgets/sales-leaderboard",
        headers=_auth(sp),
        params=_window_params(),
    )
    assert resp.status_code == 403


async def test_widget_sales_leaderboard_validates_metric(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, user, *_ = await _setup(db_session, owned_cleanup)
    resp = await client.get(
        "/api/v1/reports/widgets/sales-leaderboard",
        headers=_auth(user),
        params={**_window_params(), "metric": "nonsense"},
    )
    assert resp.status_code == 422


async def test_widget_rep_activity_counts_deals_per_rep(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, user, open_stage, _won, company = await _setup(db_session, owned_cleanup)
    now = datetime.now(tz=UTC)
    cur = now - timedelta(days=5)
    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=open_stage.id,
                owner_user_id=user.id,
                name="A",
                value=Decimal("100"),
                currency=org.currency,
                created_at=cur,
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=open_stage.id,
                owner_user_id=user.id,
                name="B",
                value=Decimal("100"),
                currency=org.currency,
                created_at=cur,
            ),
        ]
    )
    await db_session.commit()
    resp = await client.get(
        "/api/v1/reports/widgets/rep-activity",
        headers=_auth(user),
        params=_window_params(),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["deals_added"] == 2


async def test_widget_rep_activity_blocks_salesperson(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _admin, *_ = await _setup(db_session, owned_cleanup)
    sp_email = f"sp-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(sp_email)
    sp = User(email=sp_email, name="SP", role=UserRole.salesperson, organization_id=org.id)
    db_session.add(sp)
    await db_session.commit()
    await db_session.refresh(sp)
    resp = await client.get(
        "/api/v1/reports/widgets/rep-activity",
        headers=_auth(sp),
        params=_window_params(),
    )
    assert resp.status_code == 403


async def test_widget_rep_activity_validates_window(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, user, *_ = await _setup(db_session, owned_cleanup)
    today = datetime.now(tz=UTC).date()
    yesterday = today - timedelta(days=1)
    resp = await client.get(
        "/api/v1/reports/widgets/rep-activity",
        headers=_auth(user),
        params={"from": today.isoformat(), "to": yesterday.isoformat()},
    )
    assert resp.status_code == 422


async def test_widget_stale_deals_returns_old_open_deals(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """Open deal whose updated_at is 100 days old + no stage_change activity
    → appears in the stale list."""
    org, user, open_stage, _won, company = await _setup(db_session, owned_cleanup)
    now = datetime.now(tz=UTC)
    very_old = now - timedelta(days=100)
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=open_stage.id,
        owner_user_id=user.id,
        name="Stale",
        value=Decimal("100"),
        currency=org.currency,
        created_at=very_old,
    )
    db_session.add(deal)
    await db_session.commit()
    # Force updated_at older than the cutoff (default threshold 60d).
    await db_session.execute(
        Deal.__table__.update().where(Deal.id == deal.id).values(updated_at=very_old)  # type: ignore[attr-defined]
    )
    await db_session.commit()
    resp = await client.get(
        "/api/v1/reports/widgets/stale-deals",
        headers=_auth(user),
        params=_window_params(),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["threshold_days"] == 60
    assert len(body["items"]) == 1
    assert body["items"][0]["deal_name"] == "Stale"
    assert body["items"][0]["days_since_change"] >= 60


async def test_widget_stale_deals_validates_threshold(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, user, *_ = await _setup(db_session, owned_cleanup)
    resp = await client.get(
        "/api/v1/reports/widgets/stale-deals",
        headers=_auth(user),
        params={**_window_params(), "threshold": 45},
    )
    assert resp.status_code == 422


async def test_widget_stale_deals_blocks_salesperson(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _admin, *_ = await _setup(db_session, owned_cleanup)
    sp_email = f"sp-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(sp_email)
    sp = User(email=sp_email, name="SP", role=UserRole.salesperson, organization_id=org.id)
    db_session.add(sp)
    await db_session.commit()
    await db_session.refresh(sp)
    resp = await client.get(
        "/api/v1/reports/widgets/stale-deals",
        headers=_auth(sp),
        params=_window_params(),
    )
    assert resp.status_code == 403


async def test_widget_companies_at_risk_returns_soon_freed(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, user, *_ = await _setup(db_session, owned_cleanup)
    soon = datetime.now(tz=UTC) + timedelta(days=15)
    far = datetime.now(tz=UTC) + timedelta(days=200)
    db_session.add_all(
        [
            Company(
                organization_id=org.id,
                name="At Risk",
                owner_user_id=user.id,
                ownership_expires_at=soon,
            ),
            Company(
                organization_id=org.id,
                name="Safe",
                owner_user_id=user.id,
                ownership_expires_at=far,
            ),
        ]
    )
    await db_session.commit()
    resp = await client.get(
        "/api/v1/reports/widgets/companies-at-risk",
        headers=_auth(user),
        params={**_window_params(), "threshold": 30},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["threshold_days"] == 30
    names = [item["company_name"] for item in body["items"]]
    assert "At Risk" in names
    assert "Safe" not in names


async def test_widget_companies_at_risk_validates_threshold(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, user, *_ = await _setup(db_session, owned_cleanup)
    resp = await client.get(
        "/api/v1/reports/widgets/companies-at-risk",
        headers=_auth(user),
        params={**_window_params(), "threshold": 21},
    )
    assert resp.status_code == 422


async def test_widget_companies_at_risk_blocks_salesperson(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _admin, *_ = await _setup(db_session, owned_cleanup)
    sp_email = f"sp-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(sp_email)
    sp = User(email=sp_email, name="SP", role=UserRole.salesperson, organization_id=org.id)
    db_session.add(sp)
    await db_session.commit()
    await db_session.refresh(sp)
    resp = await client.get(
        "/api/v1/reports/widgets/companies-at-risk",
        headers=_auth(sp),
        params=_window_params(),
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Multi-widget CSV export (R7)
# ---------------------------------------------------------------------------


async def test_widgets_export_csv_renders_sections(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """POST /reports/export-csv returns BOM-prefixed UTF-8 with a section
    per requested widget separated by blank rows. The KPI tile widgets
    surface single-row summaries; the leaderboard surfaces one row per
    user."""
    org, user, _open_stage, won_stage, company = await _setup(db_session, owned_cleanup)
    now = datetime.now(tz=UTC)
    db_session.add(
        Deal(
            organization_id=org.id,
            company_id=company.id,
            stage_id=won_stage.id,
            owner_user_id=user.id,
            name="Won",
            value=Decimal("12345"),
            currency="CZK",
            closed_at=now,
        )
    )
    await db_session.commit()

    body = {
        "from": "2024-01-01",
        "to": "2026-12-31",
        "widgets": [
            {"type": "deals_won", "config": {"type": "deals_won", "display": "both"}},
            {
                "type": "sales_leaderboard",
                "config": {"type": "sales_leaderboard", "metric": "won_value"},
            },
        ],
    }
    resp = await client.post("/api/v1/reports/export-csv", headers=_auth(user), json=body)
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    text = resp.content.decode("utf-8")
    assert text.startswith("﻿"), "expected UTF-8 BOM for Excel"
    assert "# Vyhrané obchody" in text
    assert "# Žebříček obchodníků" in text
    # KPI tile section: header + one data row.
    assert "počet,hodnota,měna,delta_pct" in text
    assert "12345.00" in text
    # Leaderboard section: rank/user/value header + the won deal.
    assert "pořadí,obchodník,hodnota_won_value" in text


async def test_widgets_export_csv_blocks_salesperson(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _admin, *_ = await _setup(db_session, owned_cleanup)
    sp_email = f"sp-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(sp_email)
    sp = User(email=sp_email, name="SP", role=UserRole.salesperson, organization_id=org.id)
    db_session.add(sp)
    await db_session.commit()
    await db_session.refresh(sp)
    resp = await client.post(
        "/api/v1/reports/export-csv",
        headers=_auth(sp),
        json={"from": "2024-01-01", "to": "2026-12-31", "widgets": []},
    )
    assert resp.status_code == 403


async def test_widgets_export_csv_rejects_inverted_window(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, user, *_ = await _setup(db_session, owned_cleanup)
    resp = await client.post(
        "/api/v1/reports/export-csv",
        headers=_auth(user),
        json={"from": "2026-12-31", "to": "2024-01-01", "widgets": []},
    )
    assert resp.status_code == 422
