"""PATCH/DELETE on manually logged activities, and the read-side filter.

The timeline is user-authored, so entries are editable after the fact — but
only the manual ones, and only by their author or an admin. Everything else
is audit trail.

The seeding helpers are copied from `test_activity_feed.py` on purpose: this
file needs a second salesperson and a second organization that the feed tests
have no use for, and a shared fixture module would couple two suites that
otherwise share nothing.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import (
    Activity,
    ActivityEntityType,
    ActivityType,
    Company,
    Deal,
    EventLabel,
    Organization,
    Stage,
    User,
    UserRole,
)
from app.db.session import AsyncSessionLocal
from app.services.activity_log import record_activity
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


async def _seed_user(
    session: AsyncSession,
    owned_cleanup: dict[str, list],
    org: Organization,
    *,
    name: str,
    role: UserRole = UserRole.salesperson,
) -> User:
    email = f"u-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    user = User(email=email, name=name, role=role, organization_id=org.id)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def _seed_label(
    session: AsyncSession, org: Organization, *, name: str, color: str = "#6366F1"
) -> EventLabel:
    # lower(name) is unique per org — suffix so two labels can coexist.
    label = EventLabel(organization_id=org.id, name=f"{name}-{uuid.uuid4().hex[:4]}", color=color)
    session.add(label)
    await session.commit()
    await session.refresh(label)
    return label


async def _seed_deal(
    session: AsyncSession, org: Organization, company: Company, stage: Stage, owner: User
) -> Deal:
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=stage.id,
        owner_user_id=owner.id,
        name="Obchod",
        value=0,
        currency="CZK",
    )
    session.add(deal)
    await session.commit()
    await session.refresh(deal)
    return deal


async def _log(
    session: AsyncSession,
    org: Organization,
    company: Company,
    deal: Deal,
    *,
    activity_type: ActivityType = ActivityType.manual_action,
    user: User | None = None,
    note: str | None = None,
    label: EventLabel | None = None,
    occurred_at: datetime | None = None,
) -> Activity:
    activity = record_activity(
        session,
        organization_id=org.id,
        entity_type=ActivityEntityType.deal,
        entity_id=deal.id,
        company_id=company.id,
        user_id=user.id if user else None,
        activity_type=activity_type,
        occurred_at=occurred_at,
        label_id=label.id if label else None,
        payload={"deal_name": deal.name, **({"note": note} if note is not None else {})},
    )
    await session.commit()
    await session.refresh(activity)
    return activity


async def test_author_can_edit_body_label_and_time(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """The author rewrites all three editable fields and the change sticks."""
    org, _admin, company, stage = await _seed(db_session, owned_cleanup)
    author = await _seed_user(db_session, owned_cleanup, org, name="Autor")
    deal = await _seed_deal(db_session, org, company, stage, author)
    first = await _seed_label(db_session, org, name="Hovor")
    second = await _seed_label(db_session, org, name="Schuzka", color="#0EA5E9")
    activity = await _log(
        db_session, org, company, deal, user=author, note="Původní text", label=first
    )

    resp = await client.patch(
        f"/api/v1/activities/{activity.id}",
        headers=_auth(author),
        json={
            "body": "Upravený text",
            "label_id": str(second.id),
            "occurred_at": "2026-08-10T09:00:00+00:00",
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["payload"]["note"] == "Upravený text"
    assert data["label"]["id"] == str(second.id)
    assert datetime.fromisoformat(data["occurred_at"]) == datetime(2026, 8, 10, 9, 0, tzinfo=UTC)
    assert data["can_edit"] is True

    listed = await client.get(
        f"/api/v1/activities?entity_type=deal&entity_id={deal.id}", headers=_auth(author)
    )
    assert listed.status_code == 200, listed.text
    row = next(item for item in listed.json()["items"] if item["id"] == str(activity.id))
    assert row["payload"]["note"] == "Upravený text"
    assert row["label"]["name"] == second.name
    assert datetime.fromisoformat(row["occurred_at"]) == datetime(2026, 8, 10, 9, 0, tzinfo=UTC)


async def test_admin_can_edit_another_users_entry(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """An org admin curates the timeline, including rows they did not write."""
    org, admin, company, stage = await _seed(db_session, owned_cleanup)
    author = await _seed_user(db_session, owned_cleanup, org, name="Autor")
    deal = await _seed_deal(db_session, org, company, stage, author)
    activity = await _log(db_session, org, company, deal, user=author, note="Autorův text")

    resp = await client.patch(
        f"/api/v1/activities/{activity.id}",
        headers=_auth(admin),
        json={"body": "Opraveno adminem"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["payload"]["note"] == "Opraveno adminem"


async def test_non_author_non_admin_cannot_edit(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """A colleague at the same desk level must not rewrite someone's log."""
    org, _admin, company, stage = await _seed(db_session, owned_cleanup)
    author = await _seed_user(db_session, owned_cleanup, org, name="Autor")
    other = await _seed_user(db_session, owned_cleanup, org, name="Kolega")
    deal = await _seed_deal(db_session, org, company, stage, author)
    activity = await _log(db_session, org, company, deal, user=author, note="Autorův text")

    resp = await client.patch(
        f"/api/v1/activities/{activity.id}", headers=_auth(other), json={"body": "Cizí zásah"}
    )
    assert resp.status_code == 403, resp.text

    delete_resp = await client.delete(f"/api/v1/activities/{activity.id}", headers=_auth(other))
    assert delete_resp.status_code == 403, delete_resp.text


async def test_automatic_activity_cannot_be_edited(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """Pipeline movement is audit trail — not even an admin may rewrite it."""
    org, admin, company, stage = await _seed(db_session, owned_cleanup)
    deal = await _seed_deal(db_session, org, company, stage, admin)
    activity = await _log(
        db_session, org, company, deal, user=admin, activity_type=ActivityType.stage_change
    )

    resp = await client.patch(
        f"/api/v1/activities/{activity.id}", headers=_auth(admin), json={"body": "Přepis historie"}
    )
    assert resp.status_code == 403, resp.text

    delete_resp = await client.delete(f"/api/v1/activities/{activity.id}", headers=_auth(admin))
    assert delete_resp.status_code == 403, delete_resp.text


async def test_cross_org_activity_is_not_found(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """404, never 403: a 403 would confirm the id exists somewhere."""
    org, admin, company, stage = await _seed(db_session, owned_cleanup)
    deal = await _seed_deal(db_session, org, company, stage, admin)
    activity = await _log(db_session, org, company, deal, user=admin, note="Naše akce")

    _other_org, other_admin, _other_company, _other_stage = await _seed(db_session, owned_cleanup)

    resp = await client.patch(
        f"/api/v1/activities/{activity.id}", headers=_auth(other_admin), json={"body": "Únik"}
    )
    assert resp.status_code == 404, resp.text

    delete_resp = await client.delete(
        f"/api/v1/activities/{activity.id}", headers=_auth(other_admin)
    )
    assert delete_resp.status_code == 404, delete_resp.text


async def test_explicit_null_clears_label_omitted_field_is_untouched(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """`null` clears, omitted leaves alone — told apart via `model_fields_set`."""
    org, admin, company, stage = await _seed(db_session, owned_cleanup)
    deal = await _seed_deal(db_session, org, company, stage, admin)
    label = await _seed_label(db_session, org, name="Hovor")
    activity = await _log(
        db_session, org, company, deal, user=admin, note="Původní text", label=label
    )

    resp = await client.patch(
        f"/api/v1/activities/{activity.id}",
        headers=_auth(admin),
        json={"label_id": None},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["label"] is None
    assert resp.json()["payload"]["note"] == "Původní text"  # omitted → untouched

    # And the converse: an explicit null body clears the note without
    # disturbing the rest of the payload.
    cleared = await client.patch(
        f"/api/v1/activities/{activity.id}",
        headers=_auth(admin),
        json={"body": None},
    )
    assert cleared.status_code == 200, cleared.text
    assert "note" not in cleared.json()["payload"]
    assert cleared.json()["payload"]["deal_name"] == deal.name


async def test_occurred_at_cannot_be_cleared(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """The column is NOT NULL — an entry always happened at some point."""
    org, admin, company, stage = await _seed(db_session, owned_cleanup)
    deal = await _seed_deal(db_session, org, company, stage, admin)
    activity = await _log(db_session, org, company, deal, user=admin, note="Text")

    resp = await client.patch(
        f"/api/v1/activities/{activity.id}", headers=_auth(admin), json={"occurred_at": None}
    )
    assert resp.status_code == 422, resp.text


async def test_delete_removes_the_row(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """The author deletes their own entry; it leaves the feed for good."""
    org, _admin, company, stage = await _seed(db_session, owned_cleanup)
    author = await _seed_user(db_session, owned_cleanup, org, name="Autor")
    deal = await _seed_deal(db_session, org, company, stage, author)
    activity = await _log(db_session, org, company, deal, user=author, note="Ke smazání")

    resp = await client.delete(f"/api/v1/activities/{activity.id}", headers=_auth(author))
    assert resp.status_code == 204, resp.text

    listed = await client.get(
        f"/api/v1/activities?entity_type=deal&entity_id={deal.id}", headers=_auth(author)
    )
    assert listed.status_code == 200, listed.text
    assert all(item["id"] != str(activity.id) for item in listed.json()["items"])

    # Deleting it twice is a 404, not a second success.
    again = await client.delete(f"/api/v1/activities/{activity.id}", headers=_auth(author))
    assert again.status_code == 404, again.text


async def test_activity_types_filter_returns_only_requested_types(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """The deal timeline asks for its own set; everything else stays hidden."""
    org, admin, company, stage = await _seed(db_session, owned_cleanup)
    deal = await _seed_deal(db_session, org, company, stage, admin)
    await _log(db_session, org, company, deal, user=admin, note="Ruční akce")
    await _log(db_session, org, company, deal, user=admin, activity_type=ActivityType.stage_change)
    await _log(db_session, org, company, deal, user=admin, activity_type=ActivityType.deal_updated)

    resp = await client.get(
        f"/api/v1/activities?entity_type=deal&entity_id={deal.id}"
        "&activity_types=manual_action&activity_types=stage_change",
        headers=_auth(admin),
    )
    assert resp.status_code == 200, resp.text
    types = {item["activity_type"] for item in resp.json()["items"]}
    assert types == {"manual_action", "stage_change"}
    assert "deal_updated" not in types
    # `total` is the filtered count, not the unfiltered one — paging must agree
    # with the rows actually returned.
    assert resp.json()["total"] == 2

    unfiltered = await client.get(
        f"/api/v1/activities?entity_type=deal&entity_id={deal.id}", headers=_auth(admin)
    )
    assert "deal_updated" in {item["activity_type"] for item in unfiltered.json()["items"]}


async def test_list_orders_by_occurred_at(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """A backdated entry written later still sorts below a newer one."""
    org, admin, company, stage = await _seed(db_session, owned_cleanup)
    deal = await _seed_deal(db_session, org, company, stage, admin)
    recent = await _log(db_session, org, company, deal, user=admin, note="Dnes")
    backdated = await _log(
        db_session,
        org,
        company,
        deal,
        user=admin,
        note="Před třemi dny",
        occurred_at=datetime.now(UTC) - timedelta(days=3),
    )
    assert backdated.created_at > recent.created_at

    resp = await client.get(
        f"/api/v1/activities?entity_type=deal&entity_id={deal.id}", headers=_auth(admin)
    )
    assert resp.status_code == 200, resp.text
    ids = [item["id"] for item in resp.json()["items"]]
    assert ids.index(str(recent.id)) < ids.index(str(backdated.id))


async def test_can_edit_is_false_for_automatic_rows(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """`can_edit` carries the role rule so the frontend never re-derives it."""
    org, admin, company, stage = await _seed(db_session, owned_cleanup)
    deal = await _seed_deal(db_session, org, company, stage, admin)
    manual = await _log(db_session, org, company, deal, user=admin, note="Ruční akce")
    automatic = await _log(
        db_session, org, company, deal, user=admin, activity_type=ActivityType.stage_change
    )

    resp = await client.get(
        f"/api/v1/activities?entity_type=deal&entity_id={deal.id}", headers=_auth(admin)
    )
    assert resp.status_code == 200, resp.text
    by_id = {item["id"]: item for item in resp.json()["items"]}
    assert by_id[str(manual.id)]["can_edit"] is True
    assert by_id[str(automatic.id)]["can_edit"] is False


async def test_deleted_author_row_is_admin_only(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """`user_id IS NULL` means the author is gone — nobody inherits the row.

    Not in the plan's list, but it is the one guard branch the other ten tests
    never exercise, and getting it wrong hands every salesperson an orphaned
    entry to rewrite.
    """
    org, admin, company, stage = await _seed(db_session, owned_cleanup)
    salesperson = await _seed_user(db_session, owned_cleanup, org, name="Prodejce")
    deal = await _seed_deal(db_session, org, company, stage, admin)
    orphan = await _log(db_session, org, company, deal, user=None, note="Osiřelý zápis")

    resp = await client.patch(
        f"/api/v1/activities/{orphan.id}", headers=_auth(salesperson), json={"body": "Zabírám"}
    )
    assert resp.status_code == 403, resp.text

    admin_resp = await client.patch(
        f"/api/v1/activities/{orphan.id}", headers=_auth(admin), json={"body": "Uklizeno"}
    )
    assert admin_resp.status_code == 200, admin_resp.text
    assert admin_resp.json()["payload"]["note"] == "Uklizeno"
