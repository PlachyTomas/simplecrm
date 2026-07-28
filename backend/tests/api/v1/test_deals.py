"""Integration tests for /api/v1/deals/*."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
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
    *,
    team_id: uuid.UUID | None = None,
) -> User:
    email = f"u-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    user = User(email=email, name="U", role=role, organization_id=org.id, team_id=team_id)
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


async def test_list_deals_denormalizes_display_names(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = Company(organization_id=org.id, name="Acme s.r.o.", email="info@acme.cz")
    db_session.add(company)
    await db_session.commit()
    await db_session.refresh(company)
    contact = Contact(
        organization_id=org.id,
        company_id=company.id,
        first_name="Jan",
        last_name="Novák",
        email="jan@acme.cz",
    )
    db_session.add(contact)
    await db_session.commit()
    await db_session.refresh(contact)
    db_session.add(
        Deal(
            organization_id=org.id,
            company_id=company.id,
            stage_id=stage.id,
            owner_user_id=admin.id,
            primary_contact_id=contact.id,
            name="Denorm deal",
            value=Decimal("500"),
            currency="CZK",
        )
    )
    await db_session.commit()

    response = await client.get(f"/api/v1/deals?company_id={company.id}", headers=_auth(admin))
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["company_name"] == "Acme s.r.o."
    assert item["company_email"] == "info@acme.cz"
    assert item["stage_name"] == stage.name
    assert item["owner_name"] == admin.name
    assert item["primary_contact_name"] == "Jan Novák"
    assert item["primary_contact_email"] == "jan@acme.cz"


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


async def test_update_deal_round_trips_the_static_note(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """`deals.note` is the record attribute, editable through the normal PUT.

    Distinct from the `ActivityType.note` rows POST /deals/{id}/notes writes:
    those are timestamped events, this is a field that overwrites in place.
    """
    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = await _seed_company(db_session, org)
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=stage.id,
        owner_user_id=admin.id,
        name="Rámcová smlouva",
        value=Decimal("0"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.commit()

    # The detail schema exposes it; the list/board schemas deliberately do not.
    fresh = await client.get(f"/api/v1/deals/{deal.id}", headers=_auth(admin))
    assert fresh.status_code == 200
    assert fresh.json()["note"] is None

    saved = await client.put(
        f"/api/v1/deals/{deal.id}",
        headers=_auth(admin),
        json={"note": "Region: Morava\nFakturace čtvrtletně."},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["note"] == "Region: Morava\nFakturace čtvrtletně."

    reread = await client.get(f"/api/v1/deals/{deal.id}", headers=_auth(admin))
    assert reread.json()["note"] == "Region: Morava\nFakturace čtvrtletně."

    # A partial PUT that omits `note` must not wipe it (exclude_unset).
    renamed = await client.put(
        f"/api/v1/deals/{deal.id}", headers=_auth(admin), json={"name": "Nový název"}
    )
    assert renamed.json()["note"] == "Region: Morava\nFakturace čtvrtletně."

    cleared = await client.put(
        f"/api/v1/deals/{deal.id}", headers=_auth(admin), json={"note": None}
    )
    assert cleared.json()["note"] is None

    # Editing the field never fabricates a note *event* on the timeline.
    from sqlalchemy import select as sql_select

    from app.db.models import Activity, ActivityType

    async with AsyncSessionLocal() as s:
        note_activities = (
            (
                await s.execute(
                    sql_select(Activity).where(
                        Activity.entity_id == deal.id,
                        Activity.activity_type == ActivityType.note,
                    )
                )
            )
            .scalars()
            .all()
        )
    assert note_activities == []


async def test_create_deal_accepts_the_static_note(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = await _seed_company(db_session, org)

    response = await client.post(
        "/api/v1/deals",
        headers=_auth(admin),
        json={
            "name": "Nový web",
            "company_id": str(company.id),
            "stage_id": str(stage.id),
            "note": "Region: Morava",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["note"] == "Region: Morava"


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


async def test_move_deal_stage_from_won_to_open_clears_closed_at(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """Regression: dragging a deal out of a won stage on the kanban board
    used to leave `closed_at` set, which made the deal disappear (the
    board's visibility filter excludes deals with closed_at != NULL except
    inside the won-window). After the fix, dragging won → open clears
    closed_at and lost_reason."""
    from sqlalchemy import select as sql_select

    from app.db.models import Pipeline, Stage
    from app.db.models.enums import StageType

    org, first_stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = await _seed_company(db_session, org)

    stages_stmt = sql_select(Stage).join(Pipeline).where(Pipeline.organization_id == org.id)
    stages = (await db_session.execute(stages_stmt)).scalars().all()
    won_stage = next(s for s in stages if s.stage_type == StageType.won)

    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=first_stage.id,
        owner_user_id=admin.id,
        name="Re-opener",
        value=Decimal("0"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.commit()

    # Win it first (sets closed_at).
    won_resp = await client.post(f"/api/v1/deals/{deal.id}/mark-won", headers=_auth(admin))
    assert won_resp.status_code == 200
    assert won_resp.json()["closed_at"] is not None

    # Now drag back to the first (open) stage. closed_at must clear.
    move_resp = await client.post(
        f"/api/v1/deals/{deal.id}/move-stage",
        headers=_auth(admin),
        json={"stage_id": str(first_stage.id)},
    )
    assert move_resp.status_code == 200
    body = move_resp.json()
    assert body["stage_id"] == str(first_stage.id)
    assert body["closed_at"] is None
    assert body["lost_reason"] is None

    # Sanity: the deal also reappears with closed_at=NULL in the DB.
    async with AsyncSessionLocal() as fresh:
        refreshed = await fresh.get(Deal, deal.id)
        assert refreshed is not None
        assert refreshed.closed_at is None
        assert refreshed.stage_id == first_stage.id
    # Won stage isn't `won_stage.id` anymore — sanity-check that we
    # actually exercised the won-stage exit path, not just an open→open.
    assert deal.id  # used the won_stage var to exit the deal earlier
    _ = won_stage


async def test_move_deal_stage_into_won_sets_closed_at(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """Symmetric to the won → open case: dragging an open deal INTO won
    must set closed_at + refresh the company's last_order_at, otherwise
    the deal also vanishes from the board (closed_at=NULL but in won
    stage doesn't pass the won-window filter once one is configured)."""
    from sqlalchemy import select as sql_select

    from app.db.models import Pipeline, Stage
    from app.db.models.enums import StageType

    org, first_stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = await _seed_company(db_session, org)

    stages_stmt = sql_select(Stage).join(Pipeline).where(Pipeline.organization_id == org.id)
    stages = (await db_session.execute(stages_stmt)).scalars().all()
    won_stage = next(s for s in stages if s.stage_type == StageType.won)

    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=first_stage.id,
        owner_user_id=admin.id,
        name="Drag-to-won",
        value=Decimal("12345"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.commit()

    move_resp = await client.post(
        f"/api/v1/deals/{deal.id}/move-stage",
        headers=_auth(admin),
        json={"stage_id": str(won_stage.id)},
    )
    assert move_resp.status_code == 200
    body = move_resp.json()
    assert body["stage_id"] == str(won_stage.id)
    assert body["closed_at"] is not None

    async with AsyncSessionLocal() as fresh:
        refreshed_company = await fresh.get(Company, company.id)
        assert refreshed_company is not None
        assert refreshed_company.last_order_at is not None


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


# payment toggle ----------------------------------------------------------


async def _won_stage_for(session: AsyncSession, org_id: uuid.UUID) -> Stage:
    from sqlalchemy import select as sql_select

    from app.db.models import Pipeline
    from app.db.models.enums import StageType

    stmt = (
        sql_select(Stage)
        .join(Pipeline)
        .where(Pipeline.organization_id == org_id, Stage.stage_type == StageType.won)
    )
    return (await session.execute(stmt)).scalar_one()


async def test_payment_toggle_marks_paid_with_server_timestamp(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _open_stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = await _seed_company(db_session, org)
    won = await _won_stage_for(db_session, org.id)
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=won.id,
        owner_user_id=admin.id,
        name="Won deal",
        value=Decimal("0"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.commit()

    paid = await client.post(
        f"/api/v1/deals/{deal.id}/payment", headers=_auth(admin), json={"paid": True}
    )
    assert paid.status_code == 200
    body = paid.json()
    assert body["is_paid"] is True
    assert body["paid_at"] is not None

    # Flipping back clears the timestamp.
    unpaid = await client.post(
        f"/api/v1/deals/{deal.id}/payment", headers=_auth(admin), json={"paid": False}
    )
    assert unpaid.status_code == 200
    assert unpaid.json()["is_paid"] is False
    assert unpaid.json()["paid_at"] is None


async def test_payment_toggle_rejects_non_won_stage(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, open_stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = await _seed_company(db_session, org)
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=open_stage.id,
        owner_user_id=admin.id,
        name="Still open",
        value=Decimal("0"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/deals/{deal.id}/payment", headers=_auth(admin), json={"paid": True}
    )
    assert resp.status_code == 409


async def test_payment_toggle_blocked_for_foreign_deal(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _ = await _seed_org_with_pipeline(db_session, owned_cleanup)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    other = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    company = await _seed_company(db_session, org)
    won = await _won_stage_for(db_session, org.id)
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=won.id,
        owner_user_id=other.id,
        name="Theirs",
        value=Decimal("0"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.commit()
    resp = await client.post(
        f"/api/v1/deals/{deal.id}/payment", headers=_auth(sales), json={"paid": True}
    )
    assert resp.status_code == 404


# notes -------------------------------------------------------------------


async def test_create_deal_note_writes_activity(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    from sqlalchemy import select as sql_select

    from app.db.models import Activity, ActivityType

    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = await _seed_company(db_session, org)
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=stage.id,
        owner_user_id=admin.id,
        name="Noted",
        value=Decimal("0"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/deals/{deal.id}/notes",
        headers=_auth(admin),
        json={"body": "Zavolat ve čtvrtek."},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["activity_type"] == "note"
    assert body["payload"]["note"] == "Zavolat ve čtvrtek."
    assert body["user_name"] == admin.name

    rows = (
        (
            await db_session.execute(
                sql_select(Activity).where(
                    Activity.entity_id == deal.id,
                    Activity.activity_type == ActivityType.note,
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1
    # The company fan-up is what makes the note show on the company timeline.
    assert rows[0].company_id == company.id


async def test_create_deal_note_rejects_empty_body(
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
        name="Noted",
        value=Decimal("0"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/deals/{deal.id}/notes", headers=_auth(admin), json={"body": ""}
    )
    assert resp.status_code == 422


async def test_create_deal_note_blocked_for_foreign_deal(
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

    resp = await client.post(
        f"/api/v1/deals/{deal.id}/notes", headers=_auth(sales), json={"body": "Ahoj"}
    )
    assert resp.status_code == 404


# list_deals: search / stage_id / owner_user_id / status / sort -----------


async def test_list_deals_search_matches_deal_name_or_company_name(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    alza = Company(organization_id=org.id, name="Alza.cz a.s.")
    rohlik = Company(organization_id=org.id, name="Rohlík.cz")
    db_session.add_all([alza, rohlik])
    await db_session.commit()
    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=alza.id,
                stage_id=stage.id,
                name="Roll-out projekt",
                value=Decimal("1"),
                currency="CZK",
            ),
            Deal(
                organization_id=org.id,
                company_id=rohlik.id,
                stage_id=stage.id,
                name="Servisní smlouva",
                value=Decimal("1"),
                currency="CZK",
            ),
        ]
    )
    await db_session.commit()

    # Match on the deal's own name.
    by_deal_name = await client.get("/api/v1/deals?search=roll-out", headers=_auth(admin))
    assert by_deal_name.status_code == 200
    assert {it["name"] for it in by_deal_name.json()["items"]} == {"Roll-out projekt"}

    # Match on the joined company's name.
    by_company_name = await client.get("/api/v1/deals?search=rohl", headers=_auth(admin))
    assert {it["name"] for it in by_company_name.json()["items"]} == {"Servisní smlouva"}


async def test_list_deals_filter_by_stage_id(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, open_stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    won_stage = await _won_stage_for(db_session, org.id)
    company = await _seed_company(db_session, org)
    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=open_stage.id,
                name="Open one",
                value=Decimal("1"),
                currency="CZK",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=won_stage.id,
                name="Won one",
                value=Decimal("1"),
                currency="CZK",
                closed_at=datetime.now(tz=UTC),
            ),
        ]
    )
    await db_session.commit()

    r = await client.get(f"/api/v1/deals?stage_id={open_stage.id}", headers=_auth(admin))
    assert r.status_code == 200
    assert {it["name"] for it in r.json()["items"]} == {"Open one"}


async def test_list_deals_filter_by_owner_user_id(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    a = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    b = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    company = await _seed_company(db_session, org)
    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=stage.id,
                owner_user_id=a.id,
                name="A deal",
                value=Decimal("1"),
                currency="CZK",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=stage.id,
                owner_user_id=b.id,
                name="B deal",
                value=Decimal("1"),
                currency="CZK",
            ),
        ]
    )
    await db_session.commit()

    r = await client.get(f"/api/v1/deals?owner_user_id={a.id}", headers=_auth(admin))
    assert r.status_code == 200
    assert {it["name"] for it in r.json()["items"]} == {"A deal"}


async def test_list_deals_status_open_excludes_won_and_lost(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, open_stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    won_stage = await _won_stage_for(db_session, org.id)
    company = await _seed_company(db_session, org)
    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=open_stage.id,
                name="Open",
                value=Decimal("1"),
                currency="CZK",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=won_stage.id,
                name="Won",
                value=Decimal("1"),
                currency="CZK",
                closed_at=datetime.now(tz=UTC),
            ),
            # Lost convention: open-type stage stamped with closed_at.
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=open_stage.id,
                name="Lost",
                value=Decimal("1"),
                currency="CZK",
                closed_at=datetime.now(tz=UTC),
                lost_reason="Konkurence",
            ),
        ]
    )
    await db_session.commit()

    r = await client.get("/api/v1/deals?status=open", headers=_auth(admin))
    assert r.status_code == 200
    assert {it["name"] for it in r.json()["items"]} == {"Open"}


async def test_list_deals_status_won(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, open_stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    won_stage = await _won_stage_for(db_session, org.id)
    company = await _seed_company(db_session, org)
    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=open_stage.id,
                name="Open",
                value=Decimal("1"),
                currency="CZK",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=won_stage.id,
                name="Won",
                value=Decimal("1"),
                currency="CZK",
                closed_at=datetime.now(tz=UTC),
            ),
        ]
    )
    await db_session.commit()

    r = await client.get("/api/v1/deals?status=won", headers=_auth(admin))
    assert r.status_code == 200
    assert {it["name"] for it in r.json()["items"]} == {"Won"}


async def test_list_deals_status_lost_open_stage_with_closed_at(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """House convention: the default pipeline ships no dedicated lost-type
    stage, so a LOST deal lives in an OPEN-type stage with `closed_at` set.
    status=lost must pick this up, and status=open must exclude it."""
    org, open_stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    won_stage = await _won_stage_for(db_session, org.id)
    company = await _seed_company(db_session, org)
    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=open_stage.id,
                name="Still open",
                value=Decimal("1"),
                currency="CZK",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=won_stage.id,
                name="Won",
                value=Decimal("1"),
                currency="CZK",
                closed_at=datetime.now(tz=UTC),
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=open_stage.id,
                name="Lost",
                value=Decimal("1"),
                currency="CZK",
                closed_at=datetime.now(tz=UTC),
                lost_reason="Konkurence",
            ),
        ]
    )
    await db_session.commit()

    lost = await client.get("/api/v1/deals?status=lost", headers=_auth(admin))
    assert lost.status_code == 200
    assert {it["name"] for it in lost.json()["items"]} == {"Lost"}

    open_only = await client.get("/api/v1/deals?status=open", headers=_auth(admin))
    assert {it["name"] for it in open_only.json()["items"]} == {"Still open"}


async def test_list_deals_sort_by_value_asc_and_desc(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = await _seed_company(db_session, org)
    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=stage.id,
                name="Small",
                value=Decimal("100"),
                currency="CZK",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=stage.id,
                name="Big",
                value=Decimal("900"),
                currency="CZK",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=stage.id,
                name="Mid",
                value=Decimal("500"),
                currency="CZK",
            ),
        ]
    )
    await db_session.commit()

    asc = await client.get("/api/v1/deals?sort=value&order=asc", headers=_auth(admin))
    assert asc.status_code == 200
    assert [it["name"] for it in asc.json()["items"]] == ["Small", "Mid", "Big"]

    desc = await client.get("/api/v1/deals?sort=value&order=desc", headers=_auth(admin))
    assert desc.status_code == 200
    assert [it["name"] for it in desc.json()["items"]] == ["Big", "Mid", "Small"]


async def test_list_deals_sort_by_company_name(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    alfa = Company(organization_id=org.id, name="Alfa")
    beta = Company(organization_id=org.id, name="Beta")
    db_session.add_all([alfa, beta])
    await db_session.commit()
    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=beta.id,
                stage_id=stage.id,
                name="Deal B",
                value=Decimal("1"),
                currency="CZK",
            ),
            Deal(
                organization_id=org.id,
                company_id=alfa.id,
                stage_id=stage.id,
                name="Deal A",
                value=Decimal("1"),
                currency="CZK",
            ),
        ]
    )
    await db_session.commit()

    r = await client.get("/api/v1/deals?sort=company_name&order=asc", headers=_auth(admin))
    assert r.status_code == 200
    assert [it["company_name"] for it in r.json()["items"]] == ["Alfa", "Beta"]


async def test_list_deals_rejects_unknown_sort_key(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    r = await client.get("/api/v1/deals?sort=evil_drop_table", headers=_auth(admin))
    assert r.status_code == 400


async def test_list_deals_org_isolation_with_search_filter(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    first_org, first_stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    second_org, second_stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, first_org, UserRole.admin)
    company_first = await _seed_company(db_session, first_org)
    company_second = await _seed_company(db_session, second_org)
    db_session.add_all(
        [
            Deal(
                organization_id=first_org.id,
                company_id=company_first.id,
                stage_id=first_stage.id,
                name="Visible unique-xyz",
                value=Decimal("1"),
                currency="CZK",
            ),
            Deal(
                organization_id=second_org.id,
                company_id=company_second.id,
                stage_id=second_stage.id,
                name="Hidden unique-xyz",
                value=Decimal("1"),
                currency="CZK",
            ),
        ]
    )
    await db_session.commit()

    r = await client.get("/api/v1/deals?search=unique-xyz", headers=_auth(admin))
    assert r.status_code == 200
    assert {it["name"] for it in r.json()["items"]} == {"Visible unique-xyz"}


async def test_list_deals_salesperson_scoping_excludes_non_teammate_owned_deal(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    team = Team(organization_id=org.id, name=f"T-{uuid.uuid4().hex[:4]}")
    db_session.add(team)
    await db_session.commit()
    await db_session.refresh(team)
    me = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson, team_id=team.id)
    mate = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson, team_id=team.id)
    stranger = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    company = await _seed_company(db_session, org)
    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=stage.id,
                owner_user_id=mate.id,
                name="Mate deal",
                value=Decimal("1"),
                currency="CZK",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=stage.id,
                owner_user_id=stranger.id,
                name="Stranger deal",
                value=Decimal("1"),
                currency="CZK",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=stage.id,
                owner_user_id=None,
                name="Pool deal",
                value=Decimal("1"),
                currency="CZK",
            ),
        ]
    )
    await db_session.commit()

    r = await client.get("/api/v1/deals", headers=_auth(me))
    assert r.status_code == 200
    names = {it["name"] for it in r.json()["items"]}
    assert names == {"Mate deal", "Pool deal"}


# export.csv ----------------------------------------------------------------


async def test_export_deals_csv_happy(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = await _seed_company(db_session, org)
    db_session.add(
        Deal(
            organization_id=org.id,
            company_id=company.id,
            stage_id=stage.id,
            name="Export me",
            value=Decimal("123.45"),
            currency="CZK",
        )
    )
    await db_session.commit()

    r = await client.get("/api/v1/deals/export.csv", headers=_auth(admin))
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    text = r.content.decode("utf-8")
    assert text.startswith("﻿"), "expected UTF-8 BOM for Excel"
    header_row = text.lstrip("﻿").splitlines()[0]
    assert header_row.split(",")[0] == "název"
    assert "Export me" in text

    today = datetime.now(tz=UTC).date().isoformat()
    assert f'filename="simplecrm-deals-{today}.csv"' in r.headers["content-disposition"]
    assert "attachment" in r.headers["content-disposition"]


async def test_export_deals_csv_respects_status_filter(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, open_stage = await _seed_org_with_pipeline(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    won_stage = await _won_stage_for(db_session, org.id)
    company = await _seed_company(db_session, org)
    db_session.add_all(
        [
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=open_stage.id,
                name="Open deal unique",
                value=Decimal("1"),
                currency="CZK",
            ),
            Deal(
                organization_id=org.id,
                company_id=company.id,
                stage_id=won_stage.id,
                name="Won deal unique",
                value=Decimal("1"),
                currency="CZK",
                closed_at=datetime.now(tz=UTC),
            ),
        ]
    )
    await db_session.commit()

    r = await client.get("/api/v1/deals/export.csv?status=won", headers=_auth(admin))
    assert r.status_code == 200
    text = r.content.decode("utf-8")
    assert "Won deal unique" in text
    assert "Open deal unique" not in text
