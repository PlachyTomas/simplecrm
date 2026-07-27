"""Integration tests for GET /api/v1/search — the app-wide top-bar lookup.

Endpoint commits mean the rollback fixture can't isolate data. Each test
seeds with UUID-suffixed names/emails and tears down via `owned_cleanup`.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import Company, Contact, Deal, Organization, Stage, Team, User, UserRole
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


async def _seed_org(
    session: AsyncSession,
    owned_cleanup: dict[str, list],
    *,
    name: str | None = None,
) -> Organization:
    org = Organization(name=name or f"Org-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.commit()
    await session.refresh(org)
    owned_cleanup["orgs"].append(org.id)
    return org


async def _seed_user(
    session: AsyncSession,
    owned_cleanup: dict[str, list],
    org: Organization,
    role: UserRole,
    *,
    team_id: uuid.UUID | None = None,
) -> User:
    email = f"u-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    user = User(
        email=email,
        name="User",
        role=role,
        organization_id=org.id,
        team_id=team_id,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


def _auth(user: User) -> dict[str, str]:
    token = create_access_token(user.id, user.organization_id, user.role)
    return {"Authorization": f"Bearer {token}"}


async def _seed_stages(session: AsyncSession, org: Organization) -> tuple[Stage, Stage]:
    """Provision the org's default pipeline and return (open_stage, won_stage)."""
    from app.db.models import StageType

    pipeline = await create_default_pipeline(session, org.id)
    await session.commit()
    await session.refresh(pipeline, attribute_names=["stages"])
    open_stage = next(s for s in pipeline.stages if s.stage_type == StageType.open)
    won_stage = next(s for s in pipeline.stages if s.stage_type == StageType.won)
    return open_stage, won_stage


# ---------------------------------------------------------------------------
# happy paths: one hit per entity type + subtitle contents
# ---------------------------------------------------------------------------


async def test_global_search_finds_company_by_name_and_subtitle_is_ico(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = Company(organization_id=org.id, name="Alza.cz a.s.", ico="27082440")
    db_session.add(company)
    await db_session.commit()

    r = await client.get("/api/v1/search?q=alza", headers=_auth(admin))
    assert r.status_code == 200
    body = r.json()
    assert [c["name"] for c in body["companies"]] == ["Alza.cz a.s."]
    assert body["companies"][0]["subtitle"] == "27082440"
    assert body["contacts"] == []
    assert body["deals"] == []


async def test_global_search_finds_company_by_ico(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    db_session.add_all(
        [
            Company(organization_id=org.id, name="Alza.cz a.s.", ico="27082440"),
            Company(organization_id=org.id, name="Rohlík.cz", ico="24253820"),
        ]
    )
    await db_session.commit()

    r = await client.get("/api/v1/search?q=2425", headers=_auth(admin))
    assert r.status_code == 200
    assert {c["name"] for c in r.json()["companies"]} == {"Rohlík.cz"}


async def test_global_search_finds_contact_by_name_and_subtitle_is_company_name(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = Company(organization_id=org.id, name="Acme s.r.o.")
    db_session.add(company)
    await db_session.commit()
    contact = Contact(
        organization_id=org.id,
        company_id=company.id,
        first_name="Jan",
        last_name="Novák",
        email=f"jan-{uuid.uuid4().hex[:6]}@ex.cz",
    )
    db_session.add(contact)
    await db_session.commit()

    r = await client.get("/api/v1/search?q=novák", headers=_auth(admin))
    assert r.status_code == 200
    body = r.json()
    assert [c["name"] for c in body["contacts"]] == ["Jan Novák"]
    assert body["contacts"][0]["subtitle"] == "Acme s.r.o."


async def test_global_search_finds_deal_by_name_and_subtitle_is_company_name(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    open_stage, _won_stage = await _seed_stages(db_session, org)
    company = Company(organization_id=org.id, name="Acme s.r.o.")
    db_session.add(company)
    await db_session.commit()
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=open_stage.id,
        name="Roll-out projekt",
        value=Decimal("1"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.commit()

    r = await client.get("/api/v1/search?q=roll-out", headers=_auth(admin))
    assert r.status_code == 200
    body = r.json()
    assert [d["name"] for d in body["deals"]] == ["Roll-out projekt"]
    assert body["deals"][0]["subtitle"] == "Acme s.r.o."


# ---------------------------------------------------------------------------
# per-entity cap + min query length
# ---------------------------------------------------------------------------


async def test_global_search_per_entity_cap_of_five(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    db_session.add_all([Company(organization_id=org.id, name=f"CapCo {i}") for i in range(6)])
    await db_session.commit()

    r = await client.get("/api/v1/search?q=capco", headers=_auth(admin))
    assert r.status_code == 200
    assert len(r.json()["companies"]) == 5


async def test_global_search_query_too_short_returns_422(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    r = await client.get("/api/v1/search?q=a", headers=_auth(admin))
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# org isolation
# ---------------------------------------------------------------------------


async def test_global_search_org_isolation(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    first = await _seed_org(db_session, owned_cleanup, name="First")
    second = await _seed_org(db_session, owned_cleanup, name="Second")
    first_admin = await _seed_user(db_session, owned_cleanup, first, UserRole.admin)
    db_session.add(Company(organization_id=second.id, name="Foreignco-uniquename"))
    await db_session.commit()

    r = await client.get("/api/v1/search?q=foreignco-uniquename", headers=_auth(first_admin))
    assert r.status_code == 200
    assert r.json()["companies"] == []


# ---------------------------------------------------------------------------
# salesperson scoping: never a side channel around row-level scoping
# ---------------------------------------------------------------------------


async def test_global_search_salesperson_does_not_see_non_teammate_owned_company_or_deal(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    open_stage, _won_stage = await _seed_stages(db_session, org)
    team = Team(organization_id=org.id, name=f"T-{uuid.uuid4().hex[:4]}")
    db_session.add(team)
    await db_session.commit()
    await db_session.refresh(team)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson, team_id=team.id)
    stranger = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)

    foreign_company = Company(
        organization_id=org.id, name="Stranger-owned-co", owner_user_id=stranger.id
    )
    db_session.add(foreign_company)
    await db_session.commit()
    foreign_deal = Deal(
        organization_id=org.id,
        company_id=foreign_company.id,
        stage_id=open_stage.id,
        owner_user_id=stranger.id,
        name="Stranger-owned-deal",
        value=Decimal("1"),
        currency="CZK",
    )
    db_session.add(foreign_deal)
    await db_session.commit()

    # The salesperson never sees the other, non-teammate owner's rows.
    sales_resp = await client.get("/api/v1/search?q=stranger-owned", headers=_auth(sales))
    assert sales_resp.status_code == 200
    sales_body = sales_resp.json()
    assert sales_body["companies"] == []
    assert sales_body["deals"] == []

    # An admin, by contrast, sees both.
    admin_resp = await client.get("/api/v1/search?q=stranger-owned", headers=_auth(admin))
    assert admin_resp.status_code == 200
    admin_body = admin_resp.json()
    assert {c["name"] for c in admin_body["companies"]} == {"Stranger-owned-co"}
    assert {d["name"] for d in admin_body["deals"]} == {"Stranger-owned-deal"}
