# Event Fields Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reminders (Google-fired), all-day events, attendees (contacts + teammates with Google invites), and an optional Google Meet link to calendar events.

**Architecture:** Local-first stays: `calendar_events` is the source of truth, Google gets a best-effort one-way push through the owner's connection. New fields ride the existing rails — one additive migration, wider Pydantic schemas, a wider pure `event_payload()`, and form/display work in the existing modal and lists.

**Tech Stack:** FastAPI + SQLAlchemy async + Alembic, Pydantic v2, React + react-query + vitest, Google Calendar REST v3.

**Spec:** `docs/superpowers/specs/2026-08-17-event-fields-design.md`

## Global Constraints

- Backend commands need the host-mode env prefix: `DATABASE_URL=postgresql+asyncpg://simplecrm:simplecrm@localhost:5432/simplecrm POSTGRES_HOST=localhost DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib`
- Frontend checks via `npx` (`npx vitest run`, `npx tsc -b --noEmit`), never `pnpm vitest`.
- Every UI string lands in BOTH `frontend/src/locales/cs` (reference, vykání) and `en`, then `pnpm i18n:check`.
- Every interactive element used by tests gets an id in `frontend/src/lib/testids.ts`.
- Events API stays snake_case (no camel aliases — match `CalendarEventOut` as-is).
- Code comments only for constraints code can't show; one line; no change-rationale comments.
- Commit after each task with the exact message given; stage explicit paths, never `git add -A`.

---

### Task 1: Migration + models

**Files:**
- Create: `backend/alembic/versions/20260817_1600_event_fields_addons.py` (hash suffix per house style — copy the naming of the newest file in that dir)
- Create: `backend/app/db/models/calendar_event_attendee.py`
- Modify: `backend/app/db/models/calendar_event.py` (new columns + relationship)
- Modify: `backend/app/db/models/__init__.py` (export `CalendarEventAttendee`)
- Test: `backend/tests/api/v1/test_events_fields.py` (new file, model-level test first)

**Interfaces:**
- Produces: `CalendarEvent.all_day: bool`, `CalendarEvent.reminders: list[dict]` (JSONB), `CalendarEvent.meet_requested: bool`, `CalendarEvent.meet_url: str | None`, `CalendarEvent.attendees: list[CalendarEventAttendee]` (relationship), `CalendarEventAttendee(event_id, contact_id, user_id)` with `.contact` / `.user` relationships.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/api/v1/test_events_fields.py
"""Event fields expansion: all-day, reminders, attendees, Meet link."""

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.db.models import CalendarEvent, CalendarEventAttendee, Contact, Organization, User
from app.db.session import AsyncSessionLocal

pytestmark = pytest.mark.asyncio


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
            await s.execute(
                select(CalendarEventAttendee).where(CalendarEventAttendee.event_id == event_id)
            )
        ).scalars().all()
        assert len(count) == 2
        org = await s.get(Organization, org_id)
        await s.delete(org)
        await s.commit()
```

Note: check `Contact`'s actual required fields in `backend/app/db/models/contact.py` before running; adjust the constructor to the real columns (the test's intent, not its literal kwargs, is normative). Check how `User` defaults `role` — add `role=UserRole.salesperson` if required.

- [ ] **Step 2: Run it to verify it fails** — `uv run pytest tests/api/v1/test_events_fields.py -q` (with env prefix). Expected: import error / `UndefinedColumnError`.

- [ ] **Step 3: Model changes**

`backend/app/db/models/calendar_event_attendee.py`:

```python
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.contact import Contact
    from app.db.models.user import User


class CalendarEventAttendee(Base):
    """One attendee row per event participant — a contact or a teammate.

    No email/name snapshots: values join live from the contact/user row, so
    deleting either cascades the attendee away and erasure has nothing extra
    to scrub. Google payloads skip attendees whose row has no email.
    """

    __tablename__ = "calendar_event_attendees"
    __table_args__ = (
        CheckConstraint(
            "(contact_id IS NULL) != (user_id IS NULL)",
            name="ck_calendar_event_attendees_one_subject",
        ),
        UniqueConstraint("event_id", "contact_id", name="uq_event_attendee_contact"),
        UniqueConstraint("event_id", "user_id", name="uq_event_attendee_user"),
        Index("ix_calendar_event_attendees_event_id", "event_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("calendar_events.id", ondelete="CASCADE"),
        nullable=False,
    )
    contact_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE")
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )

    contact: Mapped[Contact | None] = relationship()
    user: Mapped[User | None] = relationship()
```

`calendar_event.py` additions (after `location`, before the timestamps):

```python
    all_day: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # [{"method": "popup"|"email", "minutes": int}] — max 5, enforced in the
    # schema layer; Google fires these, the CRM has no notifier of its own.
    reminders: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    meet_requested: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    meet_url: Mapped[str | None] = mapped_column(String(1024))
```

plus the relationship next to `labels` (attendee rows die with the event):

```python
    attendees: Mapped[list[CalendarEventAttendee]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True
    )
```

Imports to add: `Boolean` from sqlalchemy, `JSONB` from sqlalchemy.dialects.postgresql, `Any` from typing, `CalendarEventAttendee` from its module. Export the new model in `db/models/__init__.py` (alphabetical spot).

- [ ] **Step 4: Migration** — first run `uv run alembic heads` (env prefix) and use that revision as `down_revision`. Body:

```python
def upgrade() -> None:
    op.add_column(
        "calendar_events",
        sa.Column("all_day", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "calendar_events",
        sa.Column(
            "reminders",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
    )
    op.add_column(
        "calendar_events",
        sa.Column("meet_requested", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column("calendar_events", sa.Column("meet_url", sa.String(length=1024), nullable=True))
    op.create_table(
        "calendar_event_attendees",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.CheckConstraint(
            "(contact_id IS NULL) != (user_id IS NULL)",
            name="ck_calendar_event_attendees_one_subject",
        ),
        sa.ForeignKeyConstraint(["event_id"], ["calendar_events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contact_id"], ["contacts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", "contact_id", name="uq_event_attendee_contact"),
        sa.UniqueConstraint("event_id", "user_id", name="uq_event_attendee_user"),
    )
    op.create_index(
        "ix_calendar_event_attendees_event_id", "calendar_event_attendees", ["event_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_calendar_event_attendees_event_id", table_name="calendar_event_attendees")
    op.drop_table("calendar_event_attendees")
    op.drop_column("calendar_events", "meet_url")
    op.drop_column("calendar_events", "meet_requested")
    op.drop_column("calendar_events", "reminders")
    op.drop_column("calendar_events", "all_day")
```

- [ ] **Step 5: Apply + test green** — `uv run alembic upgrade head`, then rerun the test. Expected: PASS. Also `uv run alembic downgrade -1 && uv run alembic upgrade head` once to prove the downgrade.

- [ ] **Step 6: Commit** — `feat(events): all-day/reminders/meet columns + attendees table`

---

### Task 2: Schemas

**Files:**
- Modify: `backend/app/schemas/calendar_event.py`
- Test: extend `backend/tests/api/v1/test_events_fields.py`

**Interfaces:**
- Produces: `EventReminder(method: Literal["popup","email"] = "popup", minutes: int)`, `AttendeeBrief(id, kind, name, email)`, and the widened `CalendarEventCreate/Update/Out` used by Task 4.

- [ ] **Step 1: Failing tests** (schema-level, no DB):

```python
from pydantic import ValidationError

from app.schemas.calendar_event import CalendarEventCreate


def _base(**over):
    payload = {
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
```

- [ ] **Step 2: Run — expect ValidationError missing / attribute errors.**

- [ ] **Step 3: Implement** in `schemas/calendar_event.py`:

```python
class EventReminder(BaseModel):
    method: Literal["popup", "email"] = "popup"
    # Google Calendar's own bound: up to 4 weeks before the event.
    minutes: int = Field(ge=0, le=40320)


class AttendeeBrief(BaseModel):
    id: uuid.UUID  # the contact/user id, not the join-row id
    kind: Literal["contact", "user"]
    name: str
    email: str | None
```

`CalendarEventCreate` additions:

```python
    all_day: bool = False
    reminders: list[EventReminder] = Field(default_factory=list, max_length=5)
    meet_requested: bool = False
    attendee_contact_ids: list[uuid.UUID] = Field(default_factory=list)
    attendee_user_ids: list[uuid.UUID] = Field(default_factory=list)
```

`CalendarEventUpdate` additions (tri-state, same comment style as `label_ids`):

```python
    all_day: bool | None = None
    reminders: list[EventReminder] | None = Field(default=None, max_length=5)
    meet_requested: bool | None = None
    attendee_contact_ids: list[uuid.UUID] | None = None
    attendee_user_ids: list[uuid.UUID] | None = None
```

`CalendarEventOut` additions:

```python
    all_day: bool
    reminders: list[EventReminder] = Field(default_factory=list)
    meet_url: str | None
    attendees: list[AttendeeBrief] = Field(default_factory=list)
```

- [ ] **Step 4: Test green.** Run the file; PASS.
- [ ] **Step 5: Commit** — `feat(events): reminder/attendee schemas + event field validation`

---

### Task 3: Google payload + client params

**Files:**
- Modify: `backend/app/services/google_calendar.py` (`event_payload`, protocol, `HttpGoogleCalendarClient.insert_event/patch_event`)
- Modify: `backend/tests/services/test_google_calendar.py` (fake client + payload tests)

**Interfaces:**
- Produces: `event_payload(*, title, description, location, starts_at, ends_at, all_day=False, reminders=(), attendees=(), create_meet=False, meet_request_id=None) -> dict`; `insert_event(token, payload, *, params=None) -> dict[str, Any]` (full response body); `patch_event(token, event_id, payload, *, params=None) -> None`.
- Consumes: `EventReminder` fields as plain dicts (`{"method","minutes"}`), attendees as `({"email": str, "displayName": str}, ...)` — the router builds those in Task 4.

- [ ] **Step 1: Failing payload tests** (pure function — add to `tests/services/test_google_calendar.py`):

```python
def test_event_payload_all_day_dates() -> None:
    body = event_payload(
        title="T",
        description=None,
        location=None,
        starts_at=datetime(2026, 9, 1, tzinfo=UTC),
        ends_at=datetime(2026, 9, 2, tzinfo=UTC),
        all_day=True,
    )
    assert body["start"] == {"date": "2026-09-01"}
    assert body["end"] == {"date": "2026-09-02"}


def test_event_payload_reminders_omitted_when_empty() -> None:
    body = event_payload(
        title="T", description=None, location=None,
        starts_at=datetime(2026, 9, 1, 10, tzinfo=UTC),
        ends_at=datetime(2026, 9, 1, 11, tzinfo=UTC),
    )
    assert "reminders" not in body
    body2 = event_payload(
        title="T", description=None, location=None,
        starts_at=datetime(2026, 9, 1, 10, tzinfo=UTC),
        ends_at=datetime(2026, 9, 1, 11, tzinfo=UTC),
        reminders=({"method": "email", "minutes": 60},),
    )
    assert body2["reminders"] == {
        "useDefault": False,
        "overrides": [{"method": "email", "minutes": 60}],
    }


def test_event_payload_attendees_and_meet() -> None:
    body = event_payload(
        title="T", description=None, location=None,
        starts_at=datetime(2026, 9, 1, 10, tzinfo=UTC),
        ends_at=datetime(2026, 9, 1, 11, tzinfo=UTC),
        attendees=({"email": "a@ex.cz", "displayName": "A"},),
        create_meet=True,
        meet_request_id="req-1",
    )
    assert body["attendees"] == [{"email": "a@ex.cz", "displayName": "A"}]
    assert body["conferenceData"] == {
        "createRequest": {
            "requestId": "req-1",
            "conferenceSolutionKey": {"type": "hangoutsMeet"},
        }
    }
```

- [ ] **Step 2: Run — expect TypeError (unexpected kwargs).**

- [ ] **Step 3: Implement `event_payload`:**

```python
def event_payload(
    *,
    title: str,
    description: str | None,
    location: str | None,
    starts_at: datetime,
    ends_at: datetime,
    all_day: bool = False,
    reminders: Sequence[dict[str, Any]] = (),
    attendees: Sequence[dict[str, str]] = (),
    create_meet: bool = False,
    meet_request_id: str | None = None,
) -> dict[str, Any]:
    """Google Calendar event body. `description`/`location` are always
    present (null clears them on PATCH); timed events go out as RFC3339 UTC,
    all-day ones as calendar dates (end date exclusive — the stored exclusive
    midnight already is that boundary). `reminders` is omitted when empty so
    the owner's calendar defaults keep applying."""
    if all_day:
        start: dict[str, Any] = {"date": starts_at.astimezone(UTC).date().isoformat()}
        end: dict[str, Any] = {"date": ends_at.astimezone(UTC).date().isoformat()}
    else:
        start = {"dateTime": starts_at.astimezone(UTC).isoformat()}
        end = {"dateTime": ends_at.astimezone(UTC).isoformat()}
    body: dict[str, Any] = {
        "summary": title,
        "description": description,
        "location": location,
        "start": start,
        "end": end,
    }
    if reminders:
        body["reminders"] = {"useDefault": False, "overrides": list(reminders)}
    if attendees:
        body["attendees"] = list(attendees)
    if create_meet and meet_request_id:
        body["conferenceData"] = {
            "createRequest": {
                "requestId": meet_request_id,
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        }
    return body
```

- [ ] **Step 4: Client interface.** Protocol: `insert_event(self, access_token: str, payload: dict[str, Any], *, params: dict[str, str] | None = None) -> dict[str, Any]` and `patch_event(..., *, params: dict[str, str] | None = None) -> None`. In `HttpGoogleCalendarClient`, pass `params=params or {}` through httpx and return `response.json()` from `insert_event`. Update the fake client in `tests/services/test_google_calendar.py` to the same signature, returning `{"id": f"gevent-{n}", "hangoutLink": "https://meet.google.com/fake"}` and recording `params` for assertions; grep for every other fake/caller: `rg -n "insert_event|patch_event" backend/app backend/tests` and update ALL to the new shapes (the router's `_sync_insert` is fixed properly in Task 4 — for this commit adjust it minimally: `event.google_event_id = (await client.insert_event(token, _google_body(event)))["id"]`).

- [ ] **Step 5: Run the whole backend suite** (env prefix) — only the pre-existing `test_invoicing_integrity.py` dev-DB failures are tolerated; everything else green.
- [ ] **Step 6: Commit** — `feat(google): payload support for all-day/reminders/attendees/meet + client params`

---

### Task 4: Router wiring + endpoint tests

**Files:**
- Modify: `backend/app/api/v1/events.py`
- Test: extend `backend/tests/api/v1/test_events_fields.py` (API-level, mirror fixtures/style of `backend/tests/api/v1/test_events.py` — read it first)

**Interfaces:**
- Consumes: Task 2 schemas, Task 3 payload/client.
- Produces: API accepting/returning the new fields; `_EVENT_LOADS` eager-loads `attendees` with their `contact`/`user`.

- [ ] **Step 1: Failing API tests** — written against the app the way `test_events.py` does (same client fixture + fake Google client override). Cover:

```text
1. POST /events with reminders + all_day + attendee ids of both kinds →
   201; response carries all_day=true, reminders echoed, attendees with
   kind/name/email; DB has 2 attendee rows.
2. POST with attendee_contact_ids containing another org's contact id →
   400 (same message style as label_ids).
3. PUT with attendee_contact_ids=[] clears contact attendees, leaves user
   attendees when attendee_user_ids omitted (tri-state per list).
4. POST with add_to_google=true and fake client → fake received
   params={"sendUpdates": "all", "conferenceDataVersion": "1"}; with
   meet_requested=true the stored event has meet_url from the fake's
   hangoutLink and the payload carried conferenceData.
5. Deleting a contact cascades its attendee rows (delete via session,
   assert row count drops; event survives).
```

Write them as real tests (5 functions, asserting exact values). Reuse the file's Task-1 fixtures.

- [ ] **Step 2: Run — failures on unknown fields / missing behavior.**

- [ ] **Step 3: Implement in `events.py`:**

1. `_EVENT_LOADS` += `selectinload(CalendarEvent.attendees).selectinload(CalendarEventAttendee.contact), selectinload(CalendarEvent.attendees).selectinload(CalendarEventAttendee.user)`.
2. `_attendee_briefs(attendees)` helper mirroring `_label_briefs` (snapshot before commit):

```python
def _attendee_briefs(attendees: Iterable[CalendarEventAttendee]) -> list[AttendeeBrief]:
    briefs: list[AttendeeBrief] = []
    for row in attendees:
        if row.contact is not None:
            name = f"{row.contact.first_name} {row.contact.last_name}".strip()
            briefs.append(
                AttendeeBrief(id=row.contact.id, kind="contact", name=name, email=row.contact.email)
            )
        elif row.user is not None:
            briefs.append(
                AttendeeBrief(id=row.user.id, kind="user", name=row.user.name, email=row.user.email)
            )
    return sorted(briefs, key=lambda b: b.name)
```

3. `_resolve_attendees(session, user, contact_ids, user_ids) -> list[CalendarEventAttendee]` — org-scoped selects over `Contact` / `User` exactly like `_resolve_labels` (dedupe, 400 with "attendee ids contain an id that does not exist in your organization" when counts differ), returning unsaved `CalendarEventAttendee(contact_id=...)` / `(user_id=...)` rows **with `.contact`/`.user` relationship objects assigned** so briefs can be built pre-commit.
4. `_google_body(event)` gains the new inputs — attendees built from the loaded relationship (skip rows whose subject has no email), `meet_request_id=str(event.id)`:

```python
def _google_body(event: CalendarEvent) -> dict[str, object]:
    attendees = []
    for row in event.attendees:
        subject = row.contact or row.user
        email = subject.email if subject else None
        if not email:
            continue
        name = (
            f"{row.contact.first_name} {row.contact.last_name}".strip()
            if row.contact
            else row.user.name
        )
        attendees.append({"email": email, "displayName": name})
    return event_payload(
        title=event.title,
        description=event.description,
        location=event.location,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        all_day=event.all_day,
        reminders=tuple(event.reminders),
        attendees=tuple(attendees),
        create_meet=event.meet_requested and event.meet_url is None,
        meet_request_id=str(event.id),
    )
```

5. `_SYNC_PARAMS = {"sendUpdates": "all", "conferenceDataVersion": "1"}`; `_sync_insert` becomes:

```python
        body = await client.insert_event(token, _google_body(event), params=_SYNC_PARAMS)
        event.google_event_id = body["id"]
        if body.get("hangoutLink"):
            event.meet_url = body["hangoutLink"]
```

`_sync_patch` passes `params=_SYNC_PARAMS` too.
6. `create_event`: `reminders=[r.model_dump() for r in payload.reminders]`, `all_day=payload.all_day`, `meet_requested=payload.meet_requested`, `attendees=_resolve_attendees(...)` assigned on the constructor; snapshot `attendee_briefs = _attendee_briefs(event.attendees)` next to the label snapshot; pass through `_event_out`.
7. `update_event`: extend the `exclude` set with `{"reminders", "attendee_contact_ids", "attendee_user_ids"}`; `reminders` handled explicitly (`if payload.reminders is not None: event.reminders = [r.model_dump() for r in payload.reminders]`); attendees tri-state **per list**: when `attendee_contact_ids` is set, drop existing contact rows and extend with fresh resolved ones (same for users); rebuild briefs.
8. `_event_out` signature gains `attendees: Sequence[AttendeeBrief] = ()` and fills the three new Out fields (`all_day=event.all_day`, `reminders=event.reminders`, `meet_url=event.meet_url`); `list_events` passes `_attendee_briefs(event.attendees)`.

- [ ] **Step 4: Suite green** (env prefix, same tolerance as Task 3). Also `uv run mypy app` and `uv run ruff check .`.
- [ ] **Step 5: Commit** — `feat(events): attendees/reminders/all-day/meet through the API + Google push`

---

### Task 5: API types regen + FE hooks

**Files:**
- Modify: `frontend/src/types/api.generated.ts` (generated — never by hand)
- Modify: `frontend/src/app/events/useEvents.ts`

**Interfaces:**
- Produces: `CalendarEventOut` TS type with the new fields; `useCreateEvent`/`useUpdateEvent` payload types accepting them; a `useOrgUsers()` hook (fetch-100 house pattern) exported from `useEvents.ts` for the picker.

- [ ] **Step 1: Restart the backend so it serves the new schema** (the agent-started uvicorn has no `--reload`), then `cd frontend && BACKEND_OPENAPI_URL=http://localhost:8000/api/v1/openapi.json pnpm types:generate`. Verify: `rg -n "meet_url" src/types/api.generated.ts` hits.
- [ ] **Step 2: Extend `useEvents.ts`** — the create/update input types there mirror the schema by hand or via `components["schemas"]`; read the file and follow its existing pattern. Add `useOrgUsers` (GET `/api/v1/users?limit=100` via `apiFetch`, react-query key `["org-users"]`) if no such hook exists elsewhere (`rg -ln "api/v1/users" frontend/src/app` first; reuse whatever exists).
- [ ] **Step 3: `npx tsc -b --noEmit` green.**
- [ ] **Step 4: Commit** — `feat(events): regen API types + org users hook`

---

### Task 6: EventFormModal — all-day, reminders, attendees, Meet

**Files:**
- Modify: `frontend/src/app/events/EventFormModal.tsx`
- Create: `frontend/src/app/events/AttendeePicker.tsx` (chips picker, modeled on `LabelPicker.tsx` — read it first)
- Create: `frontend/src/app/events/ReminderRows.tsx`
- Modify: `frontend/src/lib/testids.ts`, `frontend/src/locales/{cs,en}/deals.json` (the modal's namespace — verify with `rg -n "eventFormModal" frontend/src/locales/cs`)
- Test: `frontend/src/app/events/EventFormModal.test.tsx` (extend)

**Interfaces:**
- Consumes: Task 5 types/hooks.
- Produces: form state submitted as `all_day`, `reminders`, `meet_requested`, `attendee_contact_ids`, `attendee_user_ids`.

- [ ] **Step 1: Failing tests** (extend the existing test file — read its harness first, reuse its stubbing):

```text
1. all-day checkbox hides both TimeSelects and the submitted payload has
   all_day=true with starts_at=<date>T00:00:00.000Z and ends_at=+1 day.
2. reminder row add: picking preset "30" adds {method:"popup",minutes:30};
   a 6th add is blocked (button disabled at 5).
3. attendee chips: picking a teammate and a contact submits their ids in
   attendee_user_ids / attendee_contact_ids.
4. meet toggle renders only when the Google status stub says connected &&
   !sync_broken, and submits meet_requested=true when checked.
```

Each as a real test with assertions on the mutation body (the file already intercepts fetch — mirror how existing tests assert `createEvent` bodies).

- [ ] **Step 2: Run — expect failures on missing controls.**

- [ ] **Step 3: Implement.** Key behaviors (follow the modal's existing state/reset/dirty patterns — every new field joins the reset effect AND the `dirty` snapshot):

- `allDay: boolean` — checkbox above the TimeSelect row; when true the two TimeSelects unmount; submit builds `starts = new Date(`${date}T00:00:00.000Z`)`, `ends = +24h` (single-day v1 — the form has one date field; the model supports ranges for later).
- `reminders: {method, minutes}[]` — `ReminderRows` renders one row per entry: a minutes `<select>` (0 / 5 / 10 / 30 / 60 / 1440 with i18n labels "Při začátku/5 minut předem/…"), a method `<select>` (popup/email), a remove button; an add button appends `{method:"popup", minutes:30}` and disables at 5. Hint line: reminders fire via Google Calendar.
- `AttendeePicker` — chips + dropdown modeled on `LabelPicker`: options = org users (`useOrgUsers`) and contacts (`useContacts({limit:100})`), fold-matched via `matchesAny` (already imported in the modal), deal's company contacts sorted first when a deal is picked; chip removal; selected stored as `{kind, id, name}[]`.
- `meetRequested: boolean` — checkbox rendered only when `googleAvailable`; label copy: Meet link will be generated.
- Edit-mode prefill from `event.all_day`, `event.reminders`, `event.attendees`, `event.meet_requested`-equivalent (`meet_url != null || …` — prefill checked when `meet_url` exists; on update the backend keeps the existing conference).
- Submit payloads (both create and update) add: `all_day: allDay`, `reminders`, `meet_requested: meetRequested`, `attendee_contact_ids`, `attendee_user_ids`.
- New testids under `events.form.*`: `allDayToggle`, `reminderAdd`, `reminderRow(i)`, `reminderMinutes(i)`, `reminderMethod(i)`, `attendeeInput`, `attendeeChip(id)`, `meetToggle`.
- All new strings in cs+en `deals.json` under `eventFormModal.*` (allDay, reminders.title/add/hint/minutes options, attendees.label/placeholder/hint, meet.label) — cs first, vykání.

- [ ] **Step 4: Tests green, then `npx vitest run` + `npx tsc -b --noEmit` + `pnpm i18n:check`.**
- [ ] **Step 5: Commit** — `feat(events): form support for all-day, reminders, attendees, Meet`

---

### Task 7: Display — deal events list + calendar popover

**Files:**
- Modify: `frontend/src/app/events/DealEventsSection.tsx`
- Modify: `frontend/src/app/calendar/CalendarPage.tsx`
- Modify: testids + cs/en catalogs (same namespaces those files already use — check with `rg -n "useTranslation" <file>`)
- Test: extend the co-located tests of whichever files have them (`rg -ln "DealEventsSection" frontend/src/__tests__ frontend/src/app`)

**Interfaces:** consumes `CalendarEventOut.attendees/meet_url/all_day`.

- [ ] **Step 1: Failing test** — DealEventsSection row for an event with 2 attendees and a meet_url renders an attendee count ("2 účastníci" via i18n plural) and a Meet link (`<a href={meet_url} target="_blank" rel="noreferrer">`); an all-day event renders the all-day label instead of times.
- [ ] **Step 2: Implement** — small presentational additions; CalendarPage: all-day events render as a pill at the top of the day column (before timed events — extend however `calendarMath.ts` lays out; if the layout math makes this heavy, an acceptable v1 is rendering all-day events at the top of the day's event list with an "Celý den" time label, no absolute positioning change); popover/tooltip shows attendees + Meet link if CalendarPage has one, otherwise the pill links to the deal as timed events do.
- [ ] **Step 3: Green: `npx vitest run`, `npx tsc -b --noEmit`, `pnpm i18n:check`.**
- [ ] **Step 4: Commit** — `feat(events): show attendees, Meet link and all-day in lists`

---

### Task 8: Full verification + review gate

- [ ] Backend: env-prefixed `uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run alembic upgrade head && uv run pytest -q` (tolerate only the pre-existing `test_invoicing_integrity.py` dev-DB failures).
- [ ] Frontend: `npx eslint . && npx tsc -b --noEmit && npx prettier --check . && npx vitest run && npx vite build` + `pnpm i18n:check` + `cd frontend && node scripts/generate-api-types.mjs --check`.
- [ ] Playwright console check on `/app/calendar` and a deal detail with the event modal open (create an event with all four features against the seeded org; owner verifies visuals manually — console errors only).
- [ ] Load `reviewing-completed-tasks` and run the tier the diff earns (T1; DB migration touches → T2 refuter votes on P0/P1s).
- [ ] Triage findings, fix P0/P1, report the rest; push only after the gate.
