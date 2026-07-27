"""Deal rotting on the pipeline board (gap-analysis item #5A).

The board's `days_since_last_move` and the `stale_deals` report both go
through `services/deal_staleness.py`, so these tests pin the shared
definition once and then assert the board exposes it: recent stage change =
not rotting, old stage change = rotting, closed deals never rot.

The threshold itself lives on the organization (`deal_rotting_days`) and is
only *read* by the frontend — the API always ships the raw day count, so a
manager changing the threshold never needs a board refetch to be correct.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, event, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import (
    Activity,
    ActivityEntityType,
    ActivityType,
    Company,
    Deal,
    Organization,
    Stage,
    User,
    UserRole,
)
from app.db.models.enums import StageType
from app.db.session import AsyncSessionLocal
from app.services.deal_staleness import days_since_last_move
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
    session: AsyncSession, owned_cleanup: dict[str, list]
) -> tuple[Organization, User, list[Stage], Company]:
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
    user = User(email=email, name="U", role=UserRole.admin, organization_id=org.id)
    session.add(user)
    company = Company(organization_id=org.id, name="Test Co")
    session.add(company)
    await session.commit()
    await session.refresh(user)
    await session.refresh(company)
    return org, user, stages, company


def _auth(user: User) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {create_access_token(user.id, user.organization_id, user.role)}"
    }


async def _add_deal(
    session: AsyncSession,
    org: Organization,
    company: Company,
    stage: Stage,
    name: str,
    *,
    closed_at: datetime | None = None,
) -> Deal:
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=stage.id,
        name=name,
        value=Decimal("100.00"),
        currency="CZK",
        closed_at=closed_at,
    )
    session.add(deal)
    await session.commit()
    await session.refresh(deal)
    return deal


async def _stage_change(
    session: AsyncSession, org: Organization, deal: Deal, days_ago: int
) -> None:
    """Log a `stage_change` activity `days_ago` days in the past.

    `created_at` has a server default, so the age has to be written with an
    explicit UPDATE after the INSERT.
    """

    activity = Activity(
        organization_id=org.id,
        entity_type=ActivityEntityType.deal,
        entity_id=deal.id,
        activity_type=ActivityType.stage_change,
    )
    session.add(activity)
    await session.commit()
    when = datetime.now(tz=UTC) - timedelta(days=days_ago)
    await session.execute(
        text("UPDATE activities SET created_at = :when WHERE id = :id"),
        {"when": when, "id": activity.id},
    )
    # `updated_at` is the fallback anchor when a deal has no stage_change at
    # all; age it too so a fresh row can't mask a deliberately old move.
    await session.execute(
        text("UPDATE deals SET updated_at = :when WHERE id = :id"),
        {"when": when, "id": deal.id},
    )
    await session.commit()


def _find(body: dict, name: str) -> dict:
    for stage in body["stages"]:
        for deal in stage["deals"]:
            if deal["name"] == name:
                return deal
    raise AssertionError(f"deal {name!r} not on the board")


# ---------------------------------------------------------------------------
# The shared day-count definition
# ---------------------------------------------------------------------------


def test_days_since_last_move_prefers_the_stage_change_over_updated_at() -> None:
    now = datetime(2026, 7, 27, 12, 0, tzinfo=UTC)
    moved = now - timedelta(days=40)
    touched = now - timedelta(days=3)
    assert days_since_last_move(moved, touched, now=now) == 40
    # No stage change ever → fall back to the deal's own updated_at.
    assert days_since_last_move(None, touched, now=now) == 3


def test_days_since_last_move_never_goes_negative() -> None:
    now = datetime(2026, 7, 27, 12, 0, tzinfo=UTC)
    assert days_since_last_move(now + timedelta(days=5), now, now=now) == 0


# ---------------------------------------------------------------------------
# Board payload
# ---------------------------------------------------------------------------


async def test_board_reports_days_since_last_move_per_deal(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, user, stages, company = await _seed(db_session, owned_cleanup)
    fresh = await _add_deal(db_session, org, company, stages[0], "Čerstvý")
    stale = await _add_deal(db_session, org, company, stages[0], "Zapomenutý")
    await _stage_change(db_session, org, fresh, days_ago=2)
    await _stage_change(db_session, org, stale, days_ago=91)

    body = (await client.get("/api/v1/pipelines/default/board", headers=_auth(user))).json()
    assert _find(body, "Čerstvý")["days_since_last_move"] == 2
    assert _find(body, "Zapomenutý")["days_since_last_move"] == 91


async def test_deal_without_any_stage_change_falls_back_to_updated_at(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, user, stages, company = await _seed(db_session, owned_cleanup)
    never = await _add_deal(db_session, org, company, stages[0], "Nikdy nepohnuto")
    await db_session.execute(
        text("UPDATE deals SET updated_at = :when WHERE id = :id"),
        {"when": datetime.now(tz=UTC) - timedelta(days=30), "id": never.id},
    )
    await db_session.commit()

    body = (await client.get("/api/v1/pipelines/default/board", headers=_auth(user))).json()
    assert _find(body, "Nikdy nepohnuto")["days_since_last_move"] == 30


async def test_closed_deals_never_rot(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, user, stages, company = await _seed(db_session, owned_cleanup)
    won_stage = next(s for s in stages if s.stage_type is StageType.won)
    open_stage = next(s for s in stages if s.stage_type is StageType.open)

    won = await _add_deal(
        db_session,
        org,
        company,
        won_stage,
        "Vyhráno",
        closed_at=datetime.now(tz=UTC) - timedelta(days=1),
    )
    still_open = await _add_deal(db_session, org, company, open_stage, "Otevřeno")
    await _stage_change(db_session, org, won, days_ago=120)
    await _stage_change(db_session, org, still_open, days_ago=120)

    body = (await client.get("/api/v1/pipelines/default/board", headers=_auth(user))).json()
    # A won deal is finished, not rotting — even with a 120-day-old move.
    assert _find(body, "Vyhráno")["days_since_last_move"] is None
    assert _find(body, "Otevřeno")["days_since_last_move"] == 120


async def test_board_stays_a_single_deal_query_regardless_of_deal_count(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """No N+1: the rotting join must not add a query per card.

    Counts SELECTs against `deals` for a 1-deal board and a 12-deal board and
    asserts they're identical — a per-card lookup would make the second count
    grow with the number of cards.
    """

    org, user, stages, company = await _seed(db_session, owned_cleanup)
    await _add_deal(db_session, org, company, stages[0], "Jediný")

    from app.db.session import async_engine

    seen: list[str] = []

    def _on_execute(_conn, _cursor, statement, *_args) -> None:
        if "FROM deals" in statement:
            seen.append(statement)

    async def _board_deal_queries() -> int:
        seen.clear()
        event.listen(async_engine.sync_engine, "before_cursor_execute", _on_execute)
        try:
            r = await client.get("/api/v1/pipelines/default/board", headers=_auth(user))
            assert r.status_code == 200, r.text
        finally:
            event.remove(async_engine.sync_engine, "before_cursor_execute", _on_execute)
        return len(seen)

    one_deal = await _board_deal_queries()
    for i in range(11):
        await _add_deal(db_session, org, company, stages[0], f"Deal {i}")
    twelve_deals = await _board_deal_queries()

    assert one_deal == twelve_deals, f"board query count grew with deals: {one_deal}→{twelve_deals}"
    assert one_deal == 1, f"expected exactly one deals query, got {one_deal}"


# ---------------------------------------------------------------------------
# The org-level threshold
# ---------------------------------------------------------------------------


async def test_rotting_threshold_defaults_to_14_and_is_admin_editable(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _org, user, _stages, _company = await _seed(db_session, owned_cleanup)

    current = await client.get("/api/v1/organizations/current", headers=_auth(user))
    assert current.json()["deal_rotting_days"] == 14

    updated = await client.put(
        "/api/v1/organizations/current",
        json={"deal_rotting_days": 30},
        headers=_auth(user),
    )
    assert updated.status_code == 200
    assert updated.json()["deal_rotting_days"] == 30

    # 0 = feature off; it must be accepted, unlike ownership_window_days.
    off = await client.put(
        "/api/v1/organizations/current", json={"deal_rotting_days": 0}, headers=_auth(user)
    )
    assert off.status_code == 200
    assert off.json()["deal_rotting_days"] == 0

    # Out of range is rejected.
    assert (
        await client.put(
            "/api/v1/organizations/current",
            json={"deal_rotting_days": -1},
            headers=_auth(user),
        )
    ).status_code == 422


async def test_threshold_is_exposed_on_auth_me(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """The board reads the threshold off /auth/me, so it has to ship there."""

    _org, user, _stages, _company = await _seed(db_session, owned_cleanup)
    me = await client.get("/api/v1/auth/me", headers=_auth(user))
    assert me.status_code == 200
    assert me.json()["organization"]["deal_rotting_days"] == 14
