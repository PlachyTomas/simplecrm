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
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import (
    Activity,
    ActivityType,
    Company,
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
