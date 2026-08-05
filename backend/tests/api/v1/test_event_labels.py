"""Integration tests for /api/v1/event-labels (org-shared calendar labels).

Endpoint commits escape the rollback fixture, so each test seeds
UUID-suffixed data and tears down via `owned_cleanup` (deleting the org
cascades to its users, labels and events).

Coverage: list ordering + usage_count, create by any role, 409 on a
case-insensitive duplicate, palette/name validation, admin-only rename +
recolor + delete (403 otherwise), cross-org 404, and the seeding service.
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
from app.db.models import CalendarEvent, EventLabel, Organization, User, UserRole
from app.db.session import AsyncSessionLocal
from app.schemas.event_label import EVENT_LABEL_COLORS
from app.services.event_labels import create_default_event_labels

LABELS = "/api/v1/event-labels"


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
    session: AsyncSession, owned_cleanup: dict[str, list], *, locale: str = "cs-CZ"
) -> Organization:
    org = Organization(name=f"LblOrg-{uuid.uuid4().hex[:6]}", locale=locale)
    session.add(org)
    await session.commit()
    await session.refresh(org)
    owned_cleanup["orgs"].append(org.id)
    return org


async def _seed_user(
    session: AsyncSession,
    owned_cleanup: dict[str, list],
    org: Organization,
    role: UserRole = UserRole.admin,
) -> User:
    email = f"u-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    user = User(email=email, name="U", role=role, organization_id=org.id)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def _seed_label(
    session: AsyncSession, org: Organization, name: str, color: str = "#6366F1"
) -> EventLabel:
    label = EventLabel(organization_id=org.id, name=name, color=color)
    session.add(label)
    await session.commit()
    await session.refresh(label)
    return label


def _auth(user: User) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {create_access_token(user.id, user.organization_id, user.role)}"
    }


# list ----------------------------------------------------------------------


async def test_list_labels_is_name_ordered_with_usage_counts(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    zebra = await _seed_label(db_session, org, "Zebra")
    alfa = await _seed_label(db_session, org, "Alfa", "#10B981")

    starts = datetime.now(tz=UTC) + timedelta(days=1)
    event = CalendarEvent(
        organization_id=org.id,
        owner_user_id=user.id,
        title="Ev",
        starts_at=starts,
        ends_at=starts + timedelta(hours=1),
        labels=[alfa],
    )
    db_session.add(event)
    await db_session.commit()

    response = await client.get(LABELS, headers=_auth(user))
    assert response.status_code == 200, response.text
    body = response.json()
    assert [row["name"] for row in body] == ["Alfa", "Zebra"]
    assert body[0]["id"] == str(alfa.id)
    assert body[0]["organization_id"] == str(org.id)
    assert body[0]["color"] == "#10B981"
    assert body[0]["usage_count"] == 1
    assert body[1]["id"] == str(zebra.id)
    assert body[1]["usage_count"] == 0


async def test_list_labels_excludes_other_orgs(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org_a = await _seed_org(db_session, owned_cleanup)
    org_b = await _seed_org(db_session, owned_cleanup)
    user_a = await _seed_user(db_session, owned_cleanup, org_a)
    await _seed_label(db_session, org_a, "Moje")
    await _seed_label(db_session, org_b, "Cizí")

    response = await client.get(LABELS, headers=_auth(user_a))
    assert [row["name"] for row in response.json()] == ["Moje"]


# create --------------------------------------------------------------------


async def test_create_label_allowed_for_salesperson(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """Inline creation from the event form is the point — any role may POST."""
    org = await _seed_org(db_session, owned_cleanup)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)

    response = await client.post(
        LABELS, json={"name": "  Prezentace  ", "color": "#8b5cf6"}, headers=_auth(sales)
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "Prezentace"  # trimmed
    assert body["color"] == "#8B5CF6"  # normalized to the canonical palette hex
    assert body["usage_count"] == 0
    assert body["organization_id"] == str(org.id)


async def test_create_label_rejects_case_insensitive_duplicate(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    await _seed_label(db_session, org, "Hovor")

    response = await client.post(
        LABELS, json={"name": "hOvOr", "color": "#0EA5E9"}, headers=_auth(user)
    )
    assert response.status_code == 409, response.text


async def test_create_label_same_name_in_another_org_is_fine(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org_a = await _seed_org(db_session, owned_cleanup)
    org_b = await _seed_org(db_session, owned_cleanup)
    user_b = await _seed_user(db_session, owned_cleanup, org_b)
    await _seed_label(db_session, org_a, "Hovor")

    response = await client.post(
        LABELS, json={"name": "Hovor", "color": "#0EA5E9"}, headers=_auth(user_b)
    )
    assert response.status_code == 201, response.text


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "Barva mimo paletu", "color": "#123456"},
        {"name": "Bez mřížky", "color": "6366F1"},
        {"name": "   ", "color": "#6366F1"},
        {"name": "x" * 51, "color": "#6366F1"},
    ],
)
async def test_create_label_validation(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    payload: dict[str, str],
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)

    response = await client.post(LABELS, json=payload, headers=_auth(user))
    assert response.status_code == 422, response.text


async def test_create_label_accepts_every_palette_color(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)

    for index, color in enumerate(EVENT_LABEL_COLORS):
        response = await client.post(
            LABELS, json={"name": f"Barva {index}", "color": color}, headers=_auth(user)
        )
        assert response.status_code == 201, response.text
        assert response.json()["color"] == color


# update --------------------------------------------------------------------


async def test_update_label_renames_and_recolors_for_admin(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org)
    label = await _seed_label(db_session, org, "Hovor", "#0EA5E9")

    response = await client.put(
        f"{LABELS}/{label.id}",
        json={"name": "Telefonát", "color": "#EF4444"},
        headers=_auth(admin),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "Telefonát"
    assert body["color"] == "#EF4444"


async def test_update_label_partial_leaves_other_field(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org)
    label = await _seed_label(db_session, org, "Hovor", "#0EA5E9")

    response = await client.put(
        f"{LABELS}/{label.id}", json={"color": "#64748B"}, headers=_auth(admin)
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "Hovor"
    assert body["color"] == "#64748B"


async def test_update_label_forbidden_for_non_admin(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    manager = await _seed_user(db_session, owned_cleanup, org, UserRole.manager)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    label = await _seed_label(db_session, org, "Hovor")

    for actor in (manager, sales):
        response = await client.put(
            f"{LABELS}/{label.id}", json={"name": "Jinak"}, headers=_auth(actor)
        )
        assert response.status_code == 403, response.text


async def test_update_label_duplicate_name_conflicts(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org)
    await _seed_label(db_session, org, "Hovor")
    other = await _seed_label(db_session, org, "Schůzka")

    response = await client.put(
        f"{LABELS}/{other.id}", json={"name": "HOVOR"}, headers=_auth(admin)
    )
    assert response.status_code == 409, response.text


async def test_update_label_404_for_other_org(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org_a = await _seed_org(db_session, owned_cleanup)
    org_b = await _seed_org(db_session, owned_cleanup)
    admin_a = await _seed_user(db_session, owned_cleanup, org_a)
    foreign = await _seed_label(db_session, org_b, "Cizí")

    response = await client.put(
        f"{LABELS}/{foreign.id}", json={"name": "Moje"}, headers=_auth(admin_a)
    )
    assert response.status_code == 404, response.text


# delete --------------------------------------------------------------------


async def test_delete_label_drops_links_and_keeps_other_labels(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org)
    doomed = await _seed_label(db_session, org, "Hovor")
    kept = await _seed_label(db_session, org, "Schůzka")

    starts = datetime.now(tz=UTC) + timedelta(days=1)
    event = CalendarEvent(
        organization_id=org.id,
        owner_user_id=admin.id,
        title="Ev",
        starts_at=starts,
        ends_at=starts + timedelta(hours=1),
        labels=[doomed, kept],
    )
    db_session.add(event)
    await db_session.commit()

    response = await client.delete(f"{LABELS}/{doomed.id}", headers=_auth(admin))
    assert response.status_code == 204, response.text

    async with AsyncSessionLocal() as session:
        remaining = (
            (await session.execute(select(EventLabel).where(EventLabel.organization_id == org.id)))
            .scalars()
            .all()
        )
        assert [label.id for label in remaining] == [kept.id]

    listed = await client.get("/api/v1/events", headers=_auth(admin))
    items = [item for item in listed.json()["items"] if item["id"] == str(event.id)]
    assert [label["id"] for label in items[0]["labels"]] == [str(kept.id)]


async def test_delete_label_forbidden_for_non_admin(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    label = await _seed_label(db_session, org, "Hovor")

    response = await client.delete(f"{LABELS}/{label.id}", headers=_auth(sales))
    assert response.status_code == 403, response.text


# seeding -------------------------------------------------------------------


async def test_create_default_event_labels_seeds_three_czech_rows(
    db_session: AsyncSession,
) -> None:
    org = Organization(name=f"SeedOrg-{uuid.uuid4().hex[:6]}", locale="cs-CZ")
    db_session.add(org)
    await db_session.flush()

    created = await create_default_event_labels(db_session, org.id, org.locale)
    assert [label.name for label in created] == ["Hovor", "Schůzka", "Follow-up"]
    assert [label.color for label in created] == ["#0EA5E9", "#6366F1", "#F59E0B"]


async def test_create_default_event_labels_uses_english_for_other_locales(
    db_session: AsyncSession,
) -> None:
    org = Organization(name=f"SeedOrg-{uuid.uuid4().hex[:6]}", locale="en-US")
    db_session.add(org)
    await db_session.flush()

    created = await create_default_event_labels(db_session, org.id, org.locale)
    assert [label.name for label in created] == ["Call", "Meeting", "Follow-up"]


async def test_create_default_event_labels_is_idempotent(
    db_session: AsyncSession,
) -> None:
    org = Organization(name=f"SeedOrg-{uuid.uuid4().hex[:6]}", locale="cs-CZ")
    db_session.add(org)
    await db_session.flush()

    await create_default_event_labels(db_session, org.id, org.locale)
    second = await create_default_event_labels(db_session, org.id, org.locale)
    assert second == []

    total = (
        (await db_session.execute(select(EventLabel).where(EventLabel.organization_id == org.id)))
        .scalars()
        .all()
    )
    assert len(total) == 3
