"""Integration tests for /api/v1/sales-goals (gap-analysis item #5B).

Endpoint commits escape the rollback fixture, so each test seeds
UUID-suffixed data and tears down via `owned_cleanup` (deleting the org
cascades to its users, deals and goals).

The progress numbers are the point of these tests: a goal must read "won"
exactly as the `deals_won` report does, so the assertions build the actuals
from real won deals rather than from a hand-rolled definition.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import Company, Deal, Organization, SalesGoal, Stage, User, UserRole
from app.db.models.enums import StageType
from app.db.session import AsyncSessionLocal
from app.services.pipeline import create_default_pipeline


@pytest.fixture
async def owned_cleanup() -> AsyncIterator[dict[str, list]]:
    tracked: dict[str, list] = {"orgs": [], "emails": []}
    yield tracked
    async with AsyncSessionLocal() as session:
        if tracked["orgs"]:
            await session.execute(
                delete(SalesGoal).where(SalesGoal.organization_id.in_(tracked["orgs"]))
            )
        if tracked["emails"]:
            await session.execute(delete(User).where(User.email.in_(tracked["emails"])))
        if tracked["orgs"]:
            await session.execute(delete(Organization).where(Organization.id.in_(tracked["orgs"])))
        await session.commit()


async def _seed_org(
    session: AsyncSession, owned_cleanup: dict[str, list]
) -> tuple[Organization, list[Stage], Company]:
    org = Organization(name=f"Org-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.commit()
    await session.refresh(org)
    owned_cleanup["orgs"].append(org.id)

    pipeline = await create_default_pipeline(session, org.id)
    await session.commit()
    await session.refresh(pipeline, attribute_names=["stages"])
    stages = sorted(pipeline.stages, key=lambda s: s.position)

    company = Company(organization_id=org.id, name="Test Co")
    session.add(company)
    await session.commit()
    await session.refresh(company)
    return org, stages, company


async def _seed_user(
    session: AsyncSession,
    owned_cleanup: dict[str, list],
    org: Organization,
    role: UserRole,
) -> User:
    email = f"u-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    user = User(email=email, name=f"User {uuid.uuid4().hex[:4]}", role=role, organization_id=org.id)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


def _auth(user: User) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {create_access_token(user.id, user.organization_id, user.role)}"
    }


def _this_month() -> date:
    return datetime.now(tz=UTC).date().replace(day=1)


async def _win_deal(
    session: AsyncSession,
    org: Organization,
    company: Company,
    stages: list[Stage],
    *,
    owner: User | None,
    value: str,
    closed_at: datetime | None = None,
) -> Deal:
    """A deal in a won stage with `closed_at` set — the report's definition."""

    won_stage = next(s for s in stages if s.stage_type is StageType.won)
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=won_stage.id,
        owner_user_id=owner.id if owner else None,
        name=f"Deal {uuid.uuid4().hex[:5]}",
        value=Decimal(value),
        currency=org.currency,
        closed_at=closed_at or datetime.now(tz=UTC),
    )
    session.add(deal)
    await session.commit()
    return deal


def _payload(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "user_id": None,
        "period_month": _this_month().isoformat(),
        "metric": "won_value",
        "target_value": "100000",
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


async def test_create_list_update_delete_roundtrip(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _stages, _company = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)

    created = await client.post("/api/v1/sales-goals", json=_payload(), headers=_auth(admin))
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["user_id"] is None  # org-wide
    assert body["metric"] == "won_value"
    assert Decimal(body["target_value"]) == Decimal("100000")
    assert body["currency"] == org.currency

    listed = await client.get("/api/v1/sales-goals", headers=_auth(admin))
    assert listed.status_code == 200
    assert [g["id"] for g in listed.json()["items"]] == [body["id"]]

    updated = await client.put(
        f"/api/v1/sales-goals/{body['id']}",
        json=_payload(target_value="250000"),
        headers=_auth(admin),
    )
    assert updated.status_code == 200
    assert Decimal(updated.json()["target_value"]) == Decimal("250000")

    deleted = await client.delete(f"/api/v1/sales-goals/{body['id']}", headers=_auth(admin))
    assert deleted.status_code == 204
    assert (await client.get("/api/v1/sales-goals", headers=_auth(admin))).json()["items"] == []


async def test_period_month_is_normalized_to_the_first_of_the_month(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _stages, _company = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)

    created = await client.post(
        "/api/v1/sales-goals",
        json=_payload(period_month=_this_month().replace(day=17).isoformat()),
        headers=_auth(admin),
    )
    assert created.status_code == 201, created.text
    assert created.json()["period_month"] == _this_month().isoformat()
    # …and any date in the month finds it again.
    listed = await client.get(
        "/api/v1/sales-goals",
        params={"month": _this_month().replace(day=28).isoformat()},
        headers=_auth(admin),
    )
    assert len(listed.json()["items"]) == 1


async def test_duplicate_scope_month_metric_is_409(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _stages, _company = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    rep = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)

    # Org-wide: the NULL user_id case, guarded by the partial unique index.
    assert (
        await client.post("/api/v1/sales-goals", json=_payload(), headers=_auth(admin))
    ).status_code == 201
    assert (
        await client.post("/api/v1/sales-goals", json=_payload(), headers=_auth(admin))
    ).status_code == 409

    # Per-user: the plain UNIQUE constraint.
    per_user = _payload(user_id=str(rep.id))
    assert (
        await client.post("/api/v1/sales-goals", json=per_user, headers=_auth(admin))
    ).status_code == 201
    assert (
        await client.post("/api/v1/sales-goals", json=per_user, headers=_auth(admin))
    ).status_code == 409

    # A different metric for the same person and month is a different goal.
    assert (
        await client.post(
            "/api/v1/sales-goals",
            json=_payload(user_id=str(rep.id), metric="won_count", target_value="5"),
            headers=_auth(admin),
        )
    ).status_code == 201


async def test_goal_on_a_user_from_another_org_is_404(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org_a, _sa, _ca = await _seed_org(db_session, owned_cleanup)
    admin_a = await _seed_user(db_session, owned_cleanup, org_a, UserRole.admin)
    org_b, _sb, _cb = await _seed_org(db_session, owned_cleanup)
    rep_b = await _seed_user(db_session, owned_cleanup, org_b, UserRole.salesperson)

    r = await client.post(
        "/api/v1/sales-goals", json=_payload(user_id=str(rep_b.id)), headers=_auth(admin_a)
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Organization isolation
# ---------------------------------------------------------------------------


async def test_another_orgs_goal_is_invisible_and_404_not_403(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org_a, _sa, _ca = await _seed_org(db_session, owned_cleanup)
    admin_a = await _seed_user(db_session, owned_cleanup, org_a, UserRole.admin)
    org_b, _sb, _cb = await _seed_org(db_session, owned_cleanup)
    admin_b = await _seed_user(db_session, owned_cleanup, org_b, UserRole.admin)

    goal_id = (
        await client.post("/api/v1/sales-goals", json=_payload(), headers=_auth(admin_a))
    ).json()["id"]

    assert (await client.get("/api/v1/sales-goals", headers=_auth(admin_b))).json()["items"] == []
    assert (
        await client.put(f"/api/v1/sales-goals/{goal_id}", json=_payload(), headers=_auth(admin_b))
    ).status_code == 404
    assert (
        await client.delete(f"/api/v1/sales-goals/{goal_id}", headers=_auth(admin_b))
    ).status_code == 404
    assert (
        len((await client.get("/api/v1/sales-goals", headers=_auth(admin_a))).json()["items"]) == 1
    )


# ---------------------------------------------------------------------------
# Role gating
# ---------------------------------------------------------------------------


async def test_salesperson_reads_own_and_orgwide_but_never_writes(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _stages, _company = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    rep = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    other = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)

    orgwide = (
        await client.post("/api/v1/sales-goals", json=_payload(), headers=_auth(admin))
    ).json()
    mine = (
        await client.post(
            "/api/v1/sales-goals", json=_payload(user_id=str(rep.id)), headers=_auth(admin)
        )
    ).json()
    theirs = (
        await client.post(
            "/api/v1/sales-goals", json=_payload(user_id=str(other.id)), headers=_auth(admin)
        )
    ).json()

    visible = {
        g["id"]
        for g in (await client.get("/api/v1/sales-goals", headers=_auth(rep))).json()["items"]
    }
    assert visible == {orgwide["id"], mine["id"]}
    assert theirs["id"] not in visible

    # A manager/admin sees all three.
    all_ids = {
        g["id"]
        for g in (await client.get("/api/v1/sales-goals", headers=_auth(admin))).json()["items"]
    }
    assert all_ids == {orgwide["id"], mine["id"], theirs["id"]}

    # Writes are forbidden for the salesperson.
    assert (
        await client.post("/api/v1/sales-goals", json=_payload(), headers=_auth(rep))
    ).status_code == 403
    assert (
        await client.put(f"/api/v1/sales-goals/{mine['id']}", json=_payload(), headers=_auth(rep))
    ).status_code == 403
    assert (
        await client.delete(f"/api/v1/sales-goals/{mine['id']}", headers=_auth(rep))
    ).status_code == 403


async def test_manager_may_write(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _stages, _company = await _seed_org(db_session, owned_cleanup)
    manager = await _seed_user(db_session, owned_cleanup, org, UserRole.manager)

    created = await client.post("/api/v1/sales-goals", json=_payload(), headers=_auth(manager))
    assert created.status_code == 201, created.text
    goal_id = created.json()["id"]
    assert (
        await client.put(
            f"/api/v1/sales-goals/{goal_id}",
            json=_payload(target_value="1"),
            headers=_auth(manager),
        )
    ).status_code == 200
    assert (
        await client.delete(f"/api/v1/sales-goals/{goal_id}", headers=_auth(manager))
    ).status_code == 204


# ---------------------------------------------------------------------------
# Progress — must match the `deals_won` report's definition of "won"
# ---------------------------------------------------------------------------


async def test_progress_matches_the_deals_won_report_definition(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stages, company = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    rep = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)

    # Two wins for the rep this month = 30 000.
    await _win_deal(db_session, org, company, stages, owner=rep, value="20000")
    await _win_deal(db_session, org, company, stages, owner=rep, value="10000")
    # Someone else's win — counts toward the org goal, not the rep's.
    await _win_deal(db_session, org, company, stages, owner=admin, value="5000")
    # A win from a previous month — outside the window, counts for neither.
    await _win_deal(
        db_session,
        org,
        company,
        stages,
        owner=rep,
        value="999000",
        closed_at=datetime.combine(_this_month(), datetime.min.time(), tzinfo=UTC)
        - timedelta(days=1),
    )
    # An open deal in an open stage — not won, counts for neither.
    db_session.add(
        Deal(
            organization_id=org.id,
            company_id=company.id,
            stage_id=next(s for s in stages if s.stage_type is StageType.open).id,
            owner_user_id=rep.id,
            name="Otevřený",
            value=Decimal("500000"),
            currency=org.currency,
        )
    )
    await db_session.commit()

    rep_goal = await client.post(
        "/api/v1/sales-goals",
        json=_payload(user_id=str(rep.id), target_value="60000"),
        headers=_auth(admin),
    )
    org_goal = await client.post(
        "/api/v1/sales-goals", json=_payload(target_value="70000"), headers=_auth(admin)
    )
    assert rep_goal.status_code == 201, rep_goal.text

    assert Decimal(rep_goal.json()["actual_value"]) == Decimal("30000")
    assert rep_goal.json()["progress_pct"] == pytest.approx(50.0)
    # Org-wide goal sums everyone's wins for the month: 20k + 10k + 5k.
    assert Decimal(org_goal.json()["actual_value"]) == Decimal("35000")
    assert org_goal.json()["progress_pct"] == pytest.approx(50.0)

    # Cross-check: the same numbers the `deals_won` report returns for the month.
    report = await client.get(
        "/api/v1/reports/widgets/deals-won",
        params={
            "from": _this_month().isoformat(),
            "to": (datetime.now(tz=UTC).date()).isoformat(),
        },
        headers=_auth(admin),
    )
    assert report.status_code == 200, report.text
    assert Decimal(report.json()["value"]) == Decimal("35000")


async def test_won_count_metric_counts_deals_not_value(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stages, company = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    for _ in range(3):
        await _win_deal(db_session, org, company, stages, owner=admin, value="1000")

    goal = await client.post(
        "/api/v1/sales-goals",
        json=_payload(metric="won_count", target_value="4"),
        headers=_auth(admin),
    )
    assert goal.status_code == 201, goal.text
    assert Decimal(goal.json()["actual_value"]) == Decimal("3")
    assert goal.json()["progress_pct"] == pytest.approx(75.0)


async def test_goal_with_no_wins_reports_zero_progress(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _stages, _company = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    goal = await client.post("/api/v1/sales-goals", json=_payload(), headers=_auth(admin))
    assert Decimal(goal.json()["actual_value"]) == Decimal("0")
    assert goal.json()["progress_pct"] == pytest.approx(0.0)


async def test_progress_can_exceed_100_percent(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """Beating a target is worth showing — never clamp at 100."""

    org, stages, company = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    await _win_deal(db_session, org, company, stages, owner=admin, value="30000")

    goal = await client.post(
        "/api/v1/sales-goals", json=_payload(target_value="10000"), headers=_auth(admin)
    )
    assert goal.json()["progress_pct"] == pytest.approx(300.0)
