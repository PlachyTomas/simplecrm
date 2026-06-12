"""Tests for `/api/v1/events` (deal calendar events + Google propagation).

The Google client is stubbed via FastAPI dependency override. Coverage:

  - create: happy path (local-only, `not_synced`), validation (ends<=starts,
    cross-org deal), `add_to_google` with/without a connection, local-first
    behavior when the Google push fails
  - list: overlap window (`from`/`to`), deal_id filter, owner scoping
    (admin sees all; salesperson sees own/teammates/unowned only)
  - update: field edits propagate a PATCH for synced events; explicit
    `add_to_google=false` removes the Google copy; a vanished Google copy
    (404) is re-inserted; only the owner or an admin may modify
  - delete: removes the row + best-effort Google delete
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.core.token_crypto import encrypt_token
from app.db.models import (
    CalendarEvent,
    Company,
    Deal,
    GoogleCalendarConnection,
    GoogleSyncStatus,
    Organization,
    Stage,
    Team,
    User,
    UserRole,
)
from app.db.session import AsyncSessionLocal
from app.main import app
from app.services.google_calendar import (
    GoogleCalendarError,
    GoogleTokenBundle,
    get_google_calendar_client,
)
from app.services.pipeline import create_default_pipeline

EVENTS = "/api/v1/events"


class FakeGoogleCalendarClient:
    """Records calls; failure modes are toggled per-test."""

    def __init__(self) -> None:
        self.fail_insert = False
        self.patch_returns_404 = False
        self.inserted: list[dict[str, Any]] = []
        self.patched: list[tuple[str, dict[str, Any]]] = []
        self.deleted: list[str] = []
        self.next_event_id = "gev-1"

    def build_authorize_url(self, state: str) -> str:
        return f"https://example.test/auth?state={state}"

    async def exchange_code(self, code: str) -> GoogleTokenBundle:
        raise AssertionError("not used in event tests")

    async def refresh_access_token(self, refresh_token: str) -> tuple[str, int]:
        return "at-fresh", 3599

    async def revoke_token(self, token: str) -> None: ...

    async def insert_event(self, access_token: str, payload: dict[str, Any]) -> str:
        if self.fail_insert:
            raise GoogleCalendarError("boom", http_status=500)
        self.inserted.append(payload)
        return self.next_event_id

    async def patch_event(self, access_token: str, event_id: str, payload: dict[str, Any]) -> None:
        if self.patch_returns_404:
            raise GoogleCalendarError("gone", http_status=404)
        self.patched.append((event_id, payload))

    async def delete_event(self, access_token: str, event_id: str) -> None:
        self.deleted.append(event_id)


@pytest.fixture
async def fake_gcal() -> AsyncIterator[FakeGoogleCalendarClient]:
    fake = FakeGoogleCalendarClient()
    app.dependency_overrides[get_google_calendar_client] = lambda: fake
    try:
        yield fake
    finally:
        app.dependency_overrides.pop(get_google_calendar_client, None)


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
    session: AsyncSession, owned_cleanup: dict[str, list]
) -> tuple[Organization, Stage]:
    org = Organization(name=f"EvOrg-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.commit()
    owned_cleanup["orgs"].append(org.id)
    pipeline = await create_default_pipeline(session, org.id)
    await session.commit()
    await session.refresh(pipeline, attribute_names=["stages"])
    return org, pipeline.stages[0]


async def _seed_user(
    session: AsyncSession,
    owned_cleanup: dict[str, list],
    org: Organization,
    role: UserRole = UserRole.admin,
    team_id: uuid.UUID | None = None,
) -> User:
    email = f"u-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    user = User(email=email, name="U", role=role, organization_id=org.id, team_id=team_id)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def _seed_deal(
    session: AsyncSession, org: Organization, stage: Stage, owner: User | None = None
) -> Deal:
    company = Company(organization_id=org.id, name=f"Co-{uuid.uuid4().hex[:4]}")
    session.add(company)
    await session.commit()
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=stage.id,
        owner_user_id=owner.id if owner else None,
        name=f"Deal-{uuid.uuid4().hex[:4]}",
    )
    session.add(deal)
    await session.commit()
    await session.refresh(deal)
    return deal


async def _seed_connection(session: AsyncSession, user: User) -> GoogleCalendarConnection:
    connection = GoogleCalendarConnection(
        user_id=user.id,
        organization_id=user.organization_id,
        google_email="tomas@gmail.com",
        refresh_token_encrypted=encrypt_token("rt-1"),
        access_token_encrypted=encrypt_token("at-cached"),
        access_token_expires_at=datetime.now(tz=UTC) + timedelta(minutes=30),
    )
    session.add(connection)
    await session.commit()
    return connection


async def _seed_event(
    session: AsyncSession,
    org: Organization,
    deal: Deal,
    owner: User | None,
    *,
    starts_in_days: float = 1,
    google_event_id: str | None = None,
) -> CalendarEvent:
    starts = datetime.now(tz=UTC) + timedelta(days=starts_in_days)
    event = CalendarEvent(
        organization_id=org.id,
        deal_id=deal.id,
        owner_user_id=owner.id if owner else None,
        title=f"Ev-{uuid.uuid4().hex[:4]}",
        starts_at=starts,
        ends_at=starts + timedelta(hours=1),
        google_event_id=google_event_id,
        google_sync_status=(
            GoogleSyncStatus.synced if google_event_id else GoogleSyncStatus.not_synced
        ),
    )
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return event


def _auth(user: User) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {create_access_token(user.id, user.organization_id, user.role)}"
    }


def _body(deal: Deal, **overrides: Any) -> dict[str, Any]:
    starts = datetime.now(tz=UTC) + timedelta(days=2)
    payload: dict[str, Any] = {
        "deal_id": str(deal.id),
        "title": "Schůzka s klientem",
        "starts_at": starts.isoformat(),
        "ends_at": (starts + timedelta(hours=1)).isoformat(),
    }
    payload.update(overrides)
    return payload


# create -------------------------------------------------------------------


async def test_create_event_local_only(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    org, stage = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    deal = await _seed_deal(db_session, org, stage)

    response = await client.post(
        EVENTS,
        json=_body(deal, description="Poznámka", location="Praha"),
        headers=_auth(user),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["deal_id"] == str(deal.id)
    assert body["deal_name"] == deal.name
    assert body["owner_user_id"] == str(user.id)
    assert body["google_sync_status"] == "not_synced"
    assert body["google_event_id"] is None
    assert fake_gcal.inserted == []


async def test_create_event_rejects_inverted_interval(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    org, stage = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    deal = await _seed_deal(db_session, org, stage)
    starts = datetime.now(tz=UTC) + timedelta(days=2)

    response = await client.post(
        EVENTS,
        json=_body(
            deal,
            starts_at=starts.isoformat(),
            ends_at=(starts - timedelta(hours=1)).isoformat(),
        ),
        headers=_auth(user),
    )
    assert response.status_code == 422


async def test_create_event_rejects_foreign_org_deal(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    org_a, _stage_a = await _seed_org(db_session, owned_cleanup)
    org_b, stage_b = await _seed_org(db_session, owned_cleanup)
    user_a = await _seed_user(db_session, owned_cleanup, org_a)
    foreign_deal = await _seed_deal(db_session, org_b, stage_b)

    response = await client.post(EVENTS, json=_body(foreign_deal), headers=_auth(user_a))
    assert response.status_code == 400


async def test_create_event_add_to_google_without_connection_400(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    org, stage = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    deal = await _seed_deal(db_session, org, stage)

    response = await client.post(EVENTS, json=_body(deal, add_to_google=True), headers=_auth(user))
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "google_calendar_not_connected"
    # Local-first applies to *sync* failures, not to an impossible request —
    # nothing must be persisted here.
    count = (
        (
            await db_session.execute(
                select(CalendarEvent).where(CalendarEvent.organization_id == org.id)
            )
        )
        .scalars()
        .all()
    )
    assert count == []


async def test_create_event_pushes_to_google(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    org, stage = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    await _seed_connection(db_session, user)
    deal = await _seed_deal(db_session, org, stage)

    response = await client.post(EVENTS, json=_body(deal, add_to_google=True), headers=_auth(user))
    assert response.status_code == 201
    body = response.json()
    assert body["google_sync_status"] == "synced"
    assert body["google_event_id"] == "gev-1"
    assert len(fake_gcal.inserted) == 1
    assert fake_gcal.inserted[0]["summary"] == "Schůzka s klientem"


async def test_create_event_google_failure_is_local_first(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    fake_gcal.fail_insert = True
    org, stage = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    await _seed_connection(db_session, user)
    deal = await _seed_deal(db_session, org, stage)

    response = await client.post(EVENTS, json=_body(deal, add_to_google=True), headers=_auth(user))
    assert response.status_code == 201
    body = response.json()
    assert body["google_sync_status"] == "error"
    assert body["google_event_id"] is None


# list ----------------------------------------------------------------------


async def test_list_events_overlap_window_and_deal_filter(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    org, stage = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    deal_a = await _seed_deal(db_session, org, stage)
    deal_b = await _seed_deal(db_session, org, stage)
    inside_a = await _seed_event(db_session, org, deal_a, user, starts_in_days=1)
    inside_b = await _seed_event(db_session, org, deal_b, user, starts_in_days=2)
    await _seed_event(db_session, org, deal_a, user, starts_in_days=40)  # outside

    now = datetime.now(tz=UTC)
    window = {
        "from": now.isoformat(),
        "to": (now + timedelta(days=10)).isoformat(),
    }
    response = await client.get(EVENTS, params=window, headers=_auth(user))
    assert response.status_code == 200
    ids = [item["id"] for item in response.json()["items"]]
    assert ids == [str(inside_a.id), str(inside_b.id)]  # soonest first

    filtered = await client.get(
        EVENTS, params={**window, "deal_id": str(deal_b.id)}, headers=_auth(user)
    )
    assert [item["id"] for item in filtered.json()["items"]] == [str(inside_b.id)]


async def test_list_events_scoped_for_salesperson(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    org, stage = await _seed_org(db_session, owned_cleanup)
    team_a = Team(organization_id=org.id, name="A")
    team_b = Team(organization_id=org.id, name="B")
    db_session.add_all([team_a, team_b])
    await db_session.commit()

    sales_a = await _seed_user(
        db_session, owned_cleanup, org, UserRole.salesperson, team_id=team_a.id
    )
    sales_b = await _seed_user(
        db_session, owned_cleanup, org, UserRole.salesperson, team_id=team_b.id
    )
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    deal = await _seed_deal(db_session, org, stage)

    mine = await _seed_event(db_session, org, deal, sales_a, starts_in_days=1)
    other_team = await _seed_event(db_session, org, deal, sales_b, starts_in_days=2)
    unowned = await _seed_event(db_session, org, deal, None, starts_in_days=3)

    response = await client.get(EVENTS, headers=_auth(sales_a))
    ids = {item["id"] for item in response.json()["items"]}
    assert ids == {str(mine.id), str(unowned.id)}

    admin_response = await client.get(EVENTS, headers=_auth(admin))
    admin_ids = {item["id"] for item in admin_response.json()["items"]}
    assert admin_ids == {str(mine.id), str(other_team.id), str(unowned.id)}


# update ---------------------------------------------------------------------


async def test_update_event_fields_and_patch_google(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    org, stage = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    await _seed_connection(db_session, user)
    deal = await _seed_deal(db_session, org, stage)
    event = await _seed_event(db_session, org, deal, user, google_event_id="gev-9")

    response = await client.put(
        f"{EVENTS}/{event.id}",
        json={"title": "Nový název"},
        headers=_auth(user),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Nový název"
    assert body["google_sync_status"] == "synced"
    assert fake_gcal.patched and fake_gcal.patched[0][0] == "gev-9"
    assert fake_gcal.patched[0][1]["summary"] == "Nový název"


async def test_update_event_unsync_removes_google_copy(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    org, stage = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    await _seed_connection(db_session, user)
    deal = await _seed_deal(db_session, org, stage)
    event = await _seed_event(db_session, org, deal, user, google_event_id="gev-9")

    response = await client.put(
        f"{EVENTS}/{event.id}",
        json={"add_to_google": False},
        headers=_auth(user),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["google_sync_status"] == "not_synced"
    assert body["google_event_id"] is None
    assert fake_gcal.deleted == ["gev-9"]


async def test_update_event_sync_later_inserts(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    org, stage = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    await _seed_connection(db_session, user)
    deal = await _seed_deal(db_session, org, stage)
    event = await _seed_event(db_session, org, deal, user)  # not synced

    response = await client.put(
        f"{EVENTS}/{event.id}",
        json={"add_to_google": True},
        headers=_auth(user),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["google_sync_status"] == "synced"
    assert body["google_event_id"] == "gev-1"


async def test_update_event_vanished_google_copy_is_reinserted(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    fake_gcal.patch_returns_404 = True
    fake_gcal.next_event_id = "gev-new"
    org, stage = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    await _seed_connection(db_session, user)
    deal = await _seed_deal(db_session, org, stage)
    event = await _seed_event(db_session, org, deal, user, google_event_id="gev-gone")

    response = await client.put(
        f"{EVENTS}/{event.id}",
        json={"title": "Po smazání v Googlu"},
        headers=_auth(user),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["google_sync_status"] == "synced"
    assert body["google_event_id"] == "gev-new"


async def test_update_event_forbidden_for_non_owner(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    org, stage = await _seed_org(db_session, owned_cleanup)
    team = Team(organization_id=org.id, name="T")
    db_session.add(team)
    await db_session.commit()
    owner = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson, team_id=team.id)
    teammate = await _seed_user(
        db_session, owned_cleanup, org, UserRole.salesperson, team_id=team.id
    )
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    deal = await _seed_deal(db_session, org, stage)
    event = await _seed_event(db_session, org, deal, owner)

    # Teammate can SEE the event (scoping) but cannot edit it.
    forbidden = await client.put(
        f"{EVENTS}/{event.id}", json={"title": "X"}, headers=_auth(teammate)
    )
    assert forbidden.status_code == 403

    allowed = await client.put(
        f"{EVENTS}/{event.id}", json={"title": "Admin edit"}, headers=_auth(admin)
    )
    assert allowed.status_code == 200


# delete ----------------------------------------------------------------------


async def test_delete_event_removes_row_and_google_copy(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    org, stage = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    await _seed_connection(db_session, user)
    deal = await _seed_deal(db_session, org, stage)
    event = await _seed_event(db_session, org, deal, user, google_event_id="gev-9")

    response = await client.delete(f"{EVENTS}/{event.id}", headers=_auth(user))
    assert response.status_code == 204
    assert fake_gcal.deleted == ["gev-9"]

    remaining = (
        await db_session.execute(select(CalendarEvent).where(CalendarEvent.id == event.id))
    ).scalar_one_or_none()
    assert remaining is None


async def test_delete_event_404_outside_scope(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    org_a, _stage_a = await _seed_org(db_session, owned_cleanup)
    org_b, stage_b = await _seed_org(db_session, owned_cleanup)
    user_a = await _seed_user(db_session, owned_cleanup, org_a)
    user_b = await _seed_user(db_session, owned_cleanup, org_b)
    deal_b = await _seed_deal(db_session, org_b, stage_b)
    event_b = await _seed_event(db_session, org_b, deal_b, user_b)

    response = await client.delete(f"{EVENTS}/{event_b.id}", headers=_auth(user_a))
    assert response.status_code == 404
