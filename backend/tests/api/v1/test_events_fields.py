"""Event fields expansion: all-day, reminders, attendees, Meet link.

Model/schema level plus the `/api/v1/events` round-trip: the new fields on
create/update, org-scoped attendee ids, per-list tri-state on update, the
Google insert/patch query params + Meet link capture, and the attendee
cascade when a contact is deleted.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.core.token_crypto import encrypt_token
from app.db.models import (
    CalendarEvent,
    CalendarEventAttendee,
    Company,
    Contact,
    Deal,
    GoogleCalendarConnection,
    Organization,
    Stage,
    User,
    UserRole,
)
from app.db.session import AsyncSessionLocal
from app.main import app
from app.schemas.calendar_event import CalendarEventCreate
from app.services.google_calendar import GoogleTokenBundle, get_google_calendar_client
from app.services.pipeline import create_default_pipeline

# No module-level `pytestmark = pytest.mark.asyncio`: asyncio_mode="auto" already
# covers the async test, and the mark would error on the sync ones below.

EVENTS = "/api/v1/events"
MEET_URL = "https://meet.google.com/fake"
SYNC_PARAMS = {"sendUpdates": "all", "conferenceDataVersion": "1"}


async def test_event_carries_new_columns_and_attendees() -> None:
    async with AsyncSessionLocal() as s:
        org = Organization(name=f"Ev-{uuid.uuid4().hex[:6]}")
        s.add(org)
        await s.flush()
        owner = User(
            email=f"o-{uuid.uuid4().hex[:8]}@ex.cz",
            name="O",
            organization_id=org.id,
        )
        contact = Contact(
            organization_id=org.id,
            first_name="Jana",
            last_name="Nová",
            email="jana@ex.cz",
        )
        s.add_all([owner, contact])
        await s.flush()
        event = CalendarEvent(
            organization_id=org.id,
            owner_user_id=owner.id,
            title="Schůzka",
            starts_at=datetime(2026, 9, 1, tzinfo=UTC),
            ends_at=datetime(2026, 9, 2, tzinfo=UTC),
            all_day=True,
            reminders=[{"method": "popup", "minutes": 30}],
            meet_requested=True,
        )
        s.add(event)
        await s.flush()
        s.add_all(
            [
                CalendarEventAttendee(event_id=event.id, contact_id=contact.id),
                CalendarEventAttendee(event_id=event.id, user_id=owner.id),
            ]
        )
        await s.commit()
        event_id, org_id = event.id, org.id

    async with AsyncSessionLocal() as s:
        row = (
            await s.execute(select(CalendarEvent).where(CalendarEvent.id == event_id))
        ).scalar_one()
        assert row.all_day is True
        assert row.reminders == [{"method": "popup", "minutes": 30}]
        assert row.meet_requested is True
        assert row.meet_url is None
        count = (
            (
                await s.execute(
                    select(CalendarEventAttendee).where(CalendarEventAttendee.event_id == event_id)
                )
            )
            .scalars()
            .all()
        )
        assert len(count) == 2
        org = await s.get(Organization, org_id)
        await s.delete(org)
        await s.commit()


def _base(**over: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "title": "T",
        "starts_at": "2026-09-01T10:00:00+00:00",
        "ends_at": "2026-09-01T11:00:00+00:00",
    }
    payload.update(over)
    return payload


def test_reminders_validated() -> None:
    ok = CalendarEventCreate(**_base(reminders=[{"minutes": 30}]))
    assert ok.reminders[0].method == "popup"
    with pytest.raises(ValidationError):
        CalendarEventCreate(**_base(reminders=[{"minutes": 99999}]))
    with pytest.raises(ValidationError):
        CalendarEventCreate(**_base(reminders=[{"minutes": 5}] * 6))


# API round-trip ---------------------------------------------------------------


class FakeGoogleCalendarClient:
    """Records calls; failure modes are toggled per-test."""

    def __init__(self) -> None:
        self.insert_returns_no_id = False
        self.inserted: list[dict[str, Any]] = []
        self.insert_params: list[dict[str, str] | None] = []
        self.patched: list[tuple[str, dict[str, Any]]] = []
        self.patch_params: list[dict[str, str] | None] = []
        self.deleted: list[str] = []

    def build_authorize_url(self, state: str) -> str:
        return f"https://example.test/auth?state={state}"

    async def exchange_code(self, code: str) -> GoogleTokenBundle:
        raise AssertionError("not used in event tests")

    async def refresh_access_token(self, refresh_token: str) -> tuple[str, int, str | None]:
        return "at-fresh", 3599, None

    async def revoke_token(self, token: str) -> None: ...

    async def insert_event(
        self, access_token: str, payload: dict[str, Any], *, params: dict[str, str] | None = None
    ) -> dict[str, Any]:
        self.inserted.append(payload)
        self.insert_params.append(params)
        if self.insert_returns_no_id:
            return {"htmlLink": "https://calendar.google.test/x"}
        return {"id": "gev-1", "hangoutLink": MEET_URL}

    async def patch_event(
        self,
        access_token: str,
        event_id: str,
        payload: dict[str, Any],
        *,
        params: dict[str, str] | None = None,
    ) -> None:
        self.patched.append((event_id, payload))
        self.patch_params.append(params)

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
    org = Organization(name=f"EvFOrg-{uuid.uuid4().hex[:6]}")
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
    name: str = "U",
) -> User:
    email = f"u-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    user = User(email=email, name=name, role=role, organization_id=org.id)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def _seed_contact(
    session: AsyncSession,
    org: Organization,
    first_name: str = "Jana",
    last_name: str = "Nová",
    email: str | None = None,
) -> Contact:
    contact = Contact(
        organization_id=org.id,
        first_name=first_name,
        last_name=last_name,
        email=email or f"c-{uuid.uuid4().hex[:8]}@ex.cz",
    )
    session.add(contact)
    await session.commit()
    await session.refresh(contact)
    return contact


async def _seed_deal(session: AsyncSession, org: Organization, stage: Stage) -> Deal:
    company = Company(organization_id=org.id, name=f"Co-{uuid.uuid4().hex[:4]}")
    session.add(company)
    await session.commit()
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=stage.id,
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


async def _attendee_rows(session: AsyncSession, event_id: uuid.UUID) -> list[CalendarEventAttendee]:
    return list(
        (
            await session.execute(
                select(CalendarEventAttendee).where(CalendarEventAttendee.event_id == event_id)
            )
        )
        .scalars()
        .all()
    )


async def test_create_event_with_all_day_reminders_and_attendees(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    org, stage = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org, name="Zdeněk")
    deal = await _seed_deal(db_session, org, stage)
    contact = await _seed_contact(db_session, org, "Jana", "Nová", "jana@ex.cz")

    day = datetime(2026, 9, 1, tzinfo=UTC)
    response = await client.post(
        EVENTS,
        json=_body(
            deal,
            starts_at=day.isoformat(),
            ends_at=(day + timedelta(days=1)).isoformat(),
            all_day=True,
            reminders=[{"method": "email", "minutes": 30}],
            attendee_contact_ids=[str(contact.id)],
            attendee_user_ids=[str(user.id)],
        ),
        headers=_auth(user),
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["all_day"] is True
    assert body["reminders"] == [{"method": "email", "minutes": 30}]
    assert body["attendees"] == [
        {"id": str(contact.id), "kind": "contact", "name": "Jana Nová", "email": "jana@ex.cz"},
        {"id": str(user.id), "kind": "user", "name": "Zdeněk", "email": user.email},
    ]
    assert body["meet_url"] is None

    rows = await _attendee_rows(db_session, uuid.UUID(body["id"]))
    assert len(rows) == 2
    assert {row.contact_id for row in rows} == {contact.id, None}
    assert {row.user_id for row in rows} == {user.id, None}

    listed = await client.get(EVENTS, headers=_auth(user))
    item = next(item for item in listed.json()["items"] if item["id"] == body["id"])
    assert [attendee["id"] for attendee in item["attendees"]] == [str(contact.id), str(user.id)]
    assert item["all_day"] is True


async def test_create_event_rejects_foreign_org_attendees(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    org_a, stage_a = await _seed_org(db_session, owned_cleanup)
    org_b, _stage_b = await _seed_org(db_session, owned_cleanup)
    user_a = await _seed_user(db_session, owned_cleanup, org_a)
    user_b = await _seed_user(db_session, owned_cleanup, org_b)
    deal_a = await _seed_deal(db_session, org_a, stage_a)
    foreign_contact = await _seed_contact(db_session, org_b)

    response = await client.post(
        EVENTS,
        json=_body(deal_a, attendee_contact_ids=[str(foreign_contact.id)]),
        headers=_auth(user_a),
    )
    assert response.status_code == 400, response.text
    assert response.json()["detail"] == (
        "attendee ids contain an id that does not exist in your organization"
    )

    foreign_user = await client.post(
        EVENTS, json=_body(deal_a, attendee_user_ids=[str(user_b.id)]), headers=_auth(user_a)
    )
    assert foreign_user.status_code == 400, foreign_user.text

    unknown = await client.post(
        EVENTS, json=_body(deal_a, attendee_contact_ids=[str(uuid.uuid4())]), headers=_auth(user_a)
    )
    assert unknown.status_code == 400, unknown.text


async def test_update_event_attendee_lists_are_tri_state_per_kind(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    org, stage = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    deal = await _seed_deal(db_session, org, stage)
    contact = await _seed_contact(db_session, org, "Jana", "Nová")

    created = await client.post(
        EVENTS,
        json=_body(
            deal,
            attendee_contact_ids=[str(contact.id)],
            attendee_user_ids=[str(user.id)],
        ),
        headers=_auth(user),
    )
    assert created.status_code == 201, created.text
    event_id = created.json()["id"]

    cleared = await client.put(
        f"{EVENTS}/{event_id}", json={"attendee_contact_ids": []}, headers=_auth(user)
    )
    assert cleared.status_code == 200, cleared.text
    assert [attendee["id"] for attendee in cleared.json()["attendees"]] == [str(user.id)]

    rows = await _attendee_rows(db_session, uuid.UUID(event_id))
    assert [row.user_id for row in rows] == [user.id]

    # Omitting both lists leaves the surviving user attendee alone.
    untouched = await client.put(
        f"{EVENTS}/{event_id}", json={"title": "Jiný název"}, headers=_auth(user)
    )
    assert untouched.status_code == 200, untouched.text
    assert [attendee["id"] for attendee in untouched.json()["attendees"]] == [str(user.id)]

    readded = await client.put(
        f"{EVENTS}/{event_id}",
        json={"attendee_contact_ids": [str(contact.id)], "attendee_user_ids": [str(user.id)]},
        headers=_auth(user),
    )
    assert readded.status_code == 200, readded.text
    assert {attendee["id"] for attendee in readded.json()["attendees"]} == {
        str(contact.id),
        str(user.id),
    }
    assert len(await _attendee_rows(db_session, uuid.UUID(event_id))) == 2


async def test_update_event_rejected_attendee_id_keeps_the_existing_rows(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    """The replace drops the old rows before resolving the new ones — a 400
    on the second half must not leave the event with no attendees."""
    org, stage = await _seed_org(db_session, owned_cleanup)
    org_b, _stage_b = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    deal = await _seed_deal(db_session, org, stage)
    contact = await _seed_contact(db_session, org, "Jana", "Nová")
    foreign_contact = await _seed_contact(db_session, org_b)

    created = await client.post(
        EVENTS,
        json=_body(
            deal,
            attendee_contact_ids=[str(contact.id)],
            attendee_user_ids=[str(user.id)],
        ),
        headers=_auth(user),
    )
    assert created.status_code == 201, created.text
    event_id = uuid.UUID(created.json()["id"])

    rejected = await client.put(
        f"{EVENTS}/{event_id}",
        json={"attendee_contact_ids": [str(foreign_contact.id)], "attendee_user_ids": []},
        headers=_auth(user),
    )
    assert rejected.status_code == 400, rejected.text

    rows = await _attendee_rows(db_session, event_id)
    assert {row.contact_id for row in rows} == {contact.id, None}
    assert {row.user_id for row in rows} == {user.id, None}


async def test_create_event_google_push_carries_params_meet_and_attendees(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    org, stage = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org, name="Zdeněk")
    await _seed_connection(db_session, user)
    deal = await _seed_deal(db_session, org, stage)
    contact = await _seed_contact(db_session, org, "Jana", "Nová", "jana@ex.cz")

    response = await client.post(
        EVENTS,
        json=_body(
            deal,
            add_to_google=True,
            meet_requested=True,
            reminders=[{"method": "popup", "minutes": 10}],
            attendee_contact_ids=[str(contact.id)],
            attendee_user_ids=[str(user.id)],
        ),
        headers=_auth(user),
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["google_sync_status"] == "synced"
    assert body["meet_url"] == MEET_URL
    assert fake_gcal.insert_params == [SYNC_PARAMS]

    sent = fake_gcal.inserted[0]
    assert sent["conferenceData"]["createRequest"]["requestId"] == body["id"]
    assert sent["reminders"] == {
        "useDefault": False,
        "overrides": [{"method": "popup", "minutes": 10}],
    }
    assert sent["attendees"] == [
        {"email": "jana@ex.cz", "displayName": "Jana Nová"},
        {"email": user.email, "displayName": "Zdeněk"},
    ]

    persisted = (
        await db_session.execute(
            select(CalendarEvent).where(CalendarEvent.id == uuid.UUID(body["id"]))
        )
    ).scalar_one()
    assert persisted.meet_url == MEET_URL

    # The edit PATCH carries the same params, and never re-requests a Meet link.
    edited = await client.put(
        f"{EVENTS}/{body['id']}", json={"title": "Nový název"}, headers=_auth(user)
    )
    assert edited.status_code == 200, edited.text
    assert fake_gcal.patch_params == [SYNC_PARAMS]
    assert "conferenceData" not in fake_gcal.patched[0][1]
    assert edited.json()["meet_url"] == MEET_URL


async def test_create_event_google_insert_without_id_degrades(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    """A response body without `id` is a failed push, not a 500 — the CRM
    write lands and the event is flagged for a retry."""
    fake_gcal.insert_returns_no_id = True
    org, stage = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    await _seed_connection(db_session, user)
    deal = await _seed_deal(db_session, org, stage)

    response = await client.post(EVENTS, json=_body(deal, add_to_google=True), headers=_auth(user))
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["google_sync_status"] == "error"
    assert body["google_event_id"] is None


async def test_deleting_contact_cascades_its_attendee_rows(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    fake_gcal: FakeGoogleCalendarClient,
) -> None:
    org, stage = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    deal = await _seed_deal(db_session, org, stage)
    contact = await _seed_contact(db_session, org, "Jana", "Nová")

    created = await client.post(
        EVENTS,
        json=_body(
            deal,
            attendee_contact_ids=[str(contact.id)],
            attendee_user_ids=[str(user.id)],
        ),
        headers=_auth(user),
    )
    assert created.status_code == 201, created.text
    event_id = uuid.UUID(created.json()["id"])
    assert len(await _attendee_rows(db_session, event_id)) == 2

    await db_session.delete(contact)
    await db_session.commit()

    rows = await _attendee_rows(db_session, event_id)
    assert [row.user_id for row in rows] == [user.id]
    survivor = (
        await db_session.execute(select(CalendarEvent).where(CalendarEvent.id == event_id))
    ).scalar_one_or_none()
    assert survivor is not None
