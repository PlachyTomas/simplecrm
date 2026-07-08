"""Integration tests for the comprehensive activity feed (WS4).

Covers the new write-sites (deal create/update, company update, event create)
and the company-level fan-up query that powers the Aktivita timeline.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select, text
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
    session: AsyncSession, owned_cleanup: dict[str, list]
) -> tuple[Organization, User, Company, Stage]:
    org = Organization(name=f"Org-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.commit()
    await session.refresh(org)
    owned_cleanup["orgs"].append(org.id)
    pipeline = await create_default_pipeline(session, org.id)
    await session.commit()
    await session.refresh(pipeline, attribute_names=["stages"])
    email = f"u-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    admin = User(email=email, name="Admin", role=UserRole.admin, organization_id=org.id)
    company = Company(organization_id=org.id, name="Acme")
    session.add_all([admin, company])
    await session.commit()
    await session.refresh(admin)
    await session.refresh(company)
    return org, admin, company, pipeline.stages[0]


def _auth(user: User) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {create_access_token(user.id, user.organization_id, user.role)}"
    }


async def _activities(
    session: AsyncSession, company_id: uuid.UUID, activity_type: ActivityType
) -> list[Activity]:
    rows = (
        (
            await session.execute(
                select(Activity).where(
                    Activity.company_id == company_id,
                    Activity.activity_type == activity_type,
                )
            )
        )
        .scalars()
        .all()
    )
    return list(rows)


async def test_create_deal_writes_deal_created_with_company_id(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, admin, company, stage = await _seed(db_session, owned_cleanup)
    resp = await client.post(
        "/api/v1/deals",
        headers=_auth(admin),
        json={
            "name": "New deal",
            "company_id": str(company.id),
            "stage_id": str(stage.id),
            "value": "100",
        },
    )
    assert resp.status_code == 201, resp.text

    acts = await _activities(db_session, company.id, ActivityType.deal_created)
    assert len(acts) == 1
    assert acts[0].company_id == company.id
    assert acts[0].payload["name"] == "New deal"
    # deal_name snapshot rides on every deal-scoped payload (contract).
    assert acts[0].payload["deal_name"] == "New deal"


async def test_update_deal_writes_deal_updated_only_when_changed(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, admin, company, stage = await _seed(db_session, owned_cleanup)
    created = await client.post(
        "/api/v1/deals",
        headers=_auth(admin),
        json={"name": "D", "company_id": str(company.id), "stage_id": str(stage.id)},
    )
    deal_id = created.json()["id"]

    # A real edit → one deal_updated with the changed field listed.
    resp = await client.put(
        f"/api/v1/deals/{deal_id}", headers=_auth(admin), json={"name": "Renamed"}
    )
    assert resp.status_code == 200, resp.text
    acts = await _activities(db_session, company.id, ActivityType.deal_updated)
    assert len(acts) == 1
    assert "name" in acts[0].payload["changed"]

    # A no-op PUT (same name) writes nothing new.
    await client.put(f"/api/v1/deals/{deal_id}", headers=_auth(admin), json={"name": "Renamed"})
    acts_after = await _activities(db_session, company.id, ActivityType.deal_updated)
    assert len(acts_after) == 1


async def test_update_company_writes_company_updated(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, admin, company, _ = await _seed(db_session, owned_cleanup)
    resp = await client.put(
        f"/api/v1/companies/{company.id}",
        headers=_auth(admin),
        json={"phone": "+420123456789"},
    )
    assert resp.status_code == 200, resp.text
    acts = await _activities(db_session, company.id, ActivityType.company_updated)
    assert len(acts) == 1
    assert acts[0].company_id == company.id
    assert "phone" in acts[0].payload["changed"]


async def test_create_event_writes_event_created_with_company_id(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    _, admin, company, stage = await _seed(db_session, owned_cleanup)
    created = await client.post(
        "/api/v1/deals",
        headers=_auth(admin),
        json={"name": "D", "company_id": str(company.id), "stage_id": str(stage.id)},
    )
    deal_id = created.json()["id"]
    starts = datetime.now(tz=UTC) + timedelta(days=1)
    resp = await client.post(
        "/api/v1/events",
        headers=_auth(admin),
        json={
            "deal_id": deal_id,
            "title": "Kickoff",
            "starts_at": starts.isoformat(),
            "ends_at": (starts + timedelta(hours=1)).isoformat(),
            "add_to_google": False,
        },
    )
    assert resp.status_code == 201, resp.text
    acts = await _activities(db_session, company.id, ActivityType.event_created)
    assert len(acts) == 1
    assert acts[0].company_id == company.id
    assert acts[0].payload["title"] == "Kickoff"
    assert acts[0].payload["deal_name"] == "D"


async def test_company_activity_query_fans_up_deal_activity(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """The original bug: creating a deal must show on the company timeline."""
    _, admin, company, stage = await _seed(db_session, owned_cleanup)
    await client.post(
        "/api/v1/deals",
        headers=_auth(admin),
        json={"name": "Fan-up deal", "company_id": str(company.id), "stage_id": str(stage.id)},
    )
    resp = await client.get(f"/api/v1/activities?company_id={company.id}", headers=_auth(admin))
    assert resp.status_code == 200
    types = {item["activity_type"] for item in resp.json()["items"]}
    assert "deal_created" in types


async def test_deal_updated_payload_carries_display_ready_changes(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """deal_updated must carry `deal_name`, the legacy `changed` names list, and
    a display-ready `changes` from→to map (Decimal/str rendered)."""
    _, admin, company, stage = await _seed(db_session, owned_cleanup)
    created = await client.post(
        "/api/v1/deals",
        headers=_auth(admin),
        json={"name": "D", "company_id": str(company.id), "stage_id": str(stage.id)},
    )
    deal_id = created.json()["id"]

    resp = await client.put(
        f"/api/v1/deals/{deal_id}",
        headers=_auth(admin),
        json={"name": "Renamed", "value": "500"},
    )
    assert resp.status_code == 200, resp.text
    acts = await _activities(db_session, company.id, ActivityType.deal_updated)
    assert len(acts) == 1
    payload = acts[0].payload
    assert payload["deal_name"] == "Renamed"
    assert set(payload["changed"]) == {"name", "value"}
    assert payload["changes"]["name"] == {"from": "D", "to": "Renamed"}
    # Decimal rendered to str; old value round-tripped through Numeric(14,2).
    assert payload["changes"]["value"]["to"] == "500"
    assert payload["changes"]["value"]["from"] in ("0.00", "0")


async def test_stage_change_payload_resolves_stage_names(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """stage_change keeps the *_id keys and adds from_stage_name/to_stage_name
    plus the deal_name snapshot."""
    _, admin, company, stage = await _seed(db_session, owned_cleanup)
    stages = (
        (
            await db_session.execute(
                select(Stage).where(Stage.pipeline_id == stage.pipeline_id).order_by(Stage.position)
            )
        )
        .scalars()
        .all()
    )
    dest = next(s for s in stages if s.id != stage.id)
    created = await client.post(
        "/api/v1/deals",
        headers=_auth(admin),
        json={"name": "Mover", "company_id": str(company.id), "stage_id": str(stage.id)},
    )
    deal_id = created.json()["id"]

    resp = await client.post(
        f"/api/v1/deals/{deal_id}/move-stage",
        headers=_auth(admin),
        json={"stage_id": str(dest.id)},
    )
    assert resp.status_code == 200, resp.text
    acts = await _activities(db_session, company.id, ActivityType.stage_change)
    assert len(acts) == 1
    p = acts[0].payload
    assert p["deal_name"] == "Mover"
    assert p["from_stage_id"] == str(stage.id)
    assert p["to_stage_id"] == str(dest.id)
    assert p["from_stage_name"] == stage.name
    assert p["to_stage_name"] == dest.name


async def test_company_updated_changes_resolve_owner_name(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """company_updated `changes` resolves owner_user_id → the user's full name."""
    org, admin, company, _ = await _seed(db_session, owned_cleanup)
    other_email = f"o-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(other_email)
    other = User(
        email=other_email, name="Nová Vlastnice", role=UserRole.salesperson, organization_id=org.id
    )
    db_session.add(other)
    await db_session.commit()
    await db_session.refresh(other)

    resp = await client.put(
        f"/api/v1/companies/{company.id}",
        headers=_auth(admin),
        json={"owner_user_id": str(other.id)},
    )
    assert resp.status_code == 200, resp.text
    acts = await _activities(db_session, company.id, ActivityType.company_updated)
    assert len(acts) == 1
    changes = acts[0].payload["changes"]
    assert changes["owner_user_id"] == {"from": None, "to": "Nová Vlastnice"}


async def test_activity_list_includes_actor_user_name(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """ActivityOut exposes the denormalized `user_name` for the timeline."""
    _, admin, company, stage = await _seed(db_session, owned_cleanup)
    await client.post(
        "/api/v1/deals",
        headers=_auth(admin),
        json={"name": "X", "company_id": str(company.id), "stage_id": str(stage.id)},
    )
    resp = await client.get(f"/api/v1/activities?company_id={company.id}", headers=_auth(admin))
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert items
    assert all("user_name" in item for item in items)
    created = next(item for item in items if item["activity_type"] == "deal_created")
    assert created["user_name"] == "Admin"


async def test_migration_backfills_company_id_for_legacy_activity_rows(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """Data test for AC-4.5: a legacy activity row (written before `company_id`
    existed, hence NULL) is fanned up to the right company by the
    20260708_1930 migration's backfill.

    Running alembic against the create_all test schema is impractical
    (`company_id` already exists there), so this replicates the migration's two
    backfill UPDATE statements verbatim, scoped to the seeded org for test
    isolation — the migration itself runs org-wide.
    """
    org, admin, company, stage = await _seed(db_session, owned_cleanup)
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=stage.id,
        owner_user_id=admin.id,
        name="Legacy",
        value=0,
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.commit()
    await db_session.refresh(deal)

    # Legacy rows: deal- and company-entity activities with a NULL company_id.
    legacy_deal_act = Activity(
        organization_id=org.id,
        entity_type=ActivityEntityType.deal,
        entity_id=deal.id,
        activity_type=ActivityType.stage_change,
        company_id=None,
        payload={},
    )
    legacy_company_act = Activity(
        organization_id=org.id,
        entity_type=ActivityEntityType.company,
        entity_id=company.id,
        activity_type=ActivityType.company_updated,
        company_id=None,
        payload={},
    )
    db_session.add_all([legacy_deal_act, legacy_company_act])
    await db_session.commit()

    # --- migration backfill UPDATEs (see 20260708_1930), scoped to this org ---
    await db_session.execute(
        text(
            "UPDATE activities SET company_id = entity_id "
            "WHERE entity_type::text = 'company' AND company_id IS NULL "
            "AND organization_id = :org"
        ),
        {"org": org.id},
    )
    await db_session.execute(
        text(
            "UPDATE activities a SET company_id = d.company_id "
            "FROM deals d "
            "WHERE a.entity_type::text = 'deal' AND a.entity_id = d.id "
            "AND a.company_id IS NULL AND a.organization_id = :org"
        ),
        {"org": org.id},
    )
    await db_session.commit()

    await db_session.refresh(legacy_deal_act)
    await db_session.refresh(legacy_company_act)
    assert legacy_deal_act.company_id == company.id
    assert legacy_company_act.company_id == company.id
