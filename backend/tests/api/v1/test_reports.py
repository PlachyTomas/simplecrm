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

    response = await client.get(
        "/api/v1/reports/team-leaderboard", headers=_auth(admin)
    )
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

    response = await client.get(
        "/api/v1/reports/team-leaderboard", headers=_auth(manager)
    )
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
    sp = User(
        email=sp_email, name="SP", role=UserRole.salesperson, organization_id=org.id
    )
    db_session.add(sp)
    await db_session.commit()
    await db_session.refresh(sp)

    response = await client.get(
        "/api/v1/reports/team-leaderboard", headers=_auth(sp)
    )
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
    sp = User(
        email=sp_email, name="SP", role=UserRole.salesperson, organization_id=org.id
    )
    db_session.add(sp)
    await db_session.commit()
    await db_session.refresh(sp)

    response = await client.get(
        "/api/v1/reports/team-leaderboard", headers=_auth(sp)
    )
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
    del_resp = await client.delete(
        "/api/v1/reports/dashboard-config", headers=_auth(user)
    )
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
