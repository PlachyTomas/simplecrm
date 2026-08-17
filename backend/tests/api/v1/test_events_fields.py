"""Event fields expansion: all-day, reminders, attendees, Meet link."""

import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError
from sqlalchemy import select

from app.db.models import CalendarEvent, CalendarEventAttendee, Contact, Organization, User
from app.db.session import AsyncSessionLocal
from app.schemas.calendar_event import CalendarEventCreate

# No module-level `pytestmark = pytest.mark.asyncio`: asyncio_mode="auto" already
# covers the async test, and the mark would error on the sync ones below.


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
