# Manual Deal Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the deal's Průběh timeline into a user-authored log of actions carried out (kind + text + user-settable time, editable inline with no Save button), leave only pipeline movements as automatic rows, and cut the company Aktivita tab down to deal created / won / lost with won and lost separable by color alone.

**Architecture:** Additive only. `activities` gains `occurred_at` (user-settable, backfilled from `created_at`) and a nullable `label_id` FK into the existing org-shared `event_labels` vocabulary, plus a `manual_action` enum value. Every automatic activity keeps being written — `companies_at_risk` and `stale_deals` read the table — so decluttering happens at read time through a new `activity_types` filter on `GET /activities`. Editing is a generic `PATCH`/`DELETE /activities/{id}` guarded to manual types and author-or-admin.

**Tech Stack:** FastAPI + SQLAlchemy 2 async + Alembic + Postgres native enums · React 18 + TanStack Query + Tailwind semantic tokens + i18next (cs reference, en translation) · pytest + vitest.

Spec: `docs/superpowers/specs/2026-08-12-manual-deal-timeline-design.md` (commit 44e7f6f). Read it before Task 1.

## Global Constraints

- Every backend command must be prefixed with the host-mode env, on macOS:
  `DATABASE_URL=postgresql+asyncpg://simplecrm:simplecrm@localhost:5432/simplecrm POSTGRES_HOST=localhost DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib`. Without `DYLD_FALLBACK_LIBRARY_PATH` any process importing the backend dies with `OSError: cannot load library 'libgobject-2.0-0'`; without the DB vars ~485 tests fail with connection noise that looks real and isn't.
- Frontend commands use `npx`, never `pnpm run` (`pnpm vitest` / `pnpm typecheck` intermittently die in deps-status-check).
- Every user-facing string is an i18next key present in **both** `frontend/src/locales/cs/*.json` and `frontend/src/locales/en/*.json`. Czech is the reference language and uses vykání. `npx pnpm i18n:check` must pass.
- Colors come from semantic tokens only. **Won = magenta** (`bg-win` / `bg-win-subtle`, alias of `brand-accent`), **lost = `danger`**. Never green for won. The single sanctioned exception to "no inline styles" is an API-driven label color (`labelTint(color)`), exactly as `LabelPicker.tsx` already does it.
- Money and dates render through `@/lib/format` with the locale from `useLocale()`. Never hardcode `Kč` or a date pattern.
- Every new interactive element gets an id in `frontend/src/lib/testids.ts`.
- Icons: Lucide only, `strokeWidth={1.75}`.
- Never `git add -A` in this repo — parallel sessions drop files into the tree. Stage explicit paths.
- Work happens in the worktree `/Users/tomasplachy/Documents/SideHustles/simplecrm/.claude/worktrees/deal-manual-timeline` on branch `worktree-deal-manual-timeline`.

## File structure

**Backend — create**

| File | Responsibility |
|---|---|
| `backend/alembic/versions/20260812_1200_activity_type_manual_action_e1f2a3b4c5d6.py` | `ALTER TYPE activity_type ADD VALUE 'manual_action'`, alone in its own migration. |
| `backend/alembic/versions/20260812_1205_activity_occurred_at_label_a4b5c6d7e8f9.py` | `occurred_at` + `label_id` columns, backfill, index. |

**Backend — modify**

| File | Change |
|---|---|
| `backend/app/db/models/enums.py` | `ActivityType.manual_action`. |
| `backend/app/db/models/activity.py` | `occurred_at`, `label_id`, `label` relationship, new index. |
| `backend/app/services/activity_log.py` | `MANUAL_ACTIVITY_TYPES`; `record_activity(..., occurred_at=None, label_id=None)`. |
| `backend/app/schemas/activity.py` | `ActivityOut.occurred_at / label / can_edit`; new `ActivityUpdate`. |
| `backend/app/schemas/deal.py` | New `DealActionCreate`. |
| `backend/app/api/v1/deals.py` | `POST /deals/{deal_id}/actions`. |
| `backend/app/api/v1/activities.py` | `activity_types` filter, `occurred_at` ordering, `can_edit`, label eager-load, `PATCH`, `DELETE`. |
| `backend/tests/api/v1/test_activity_feed.py` | Filter / ordering / `can_edit` tests. |
| `backend/tests/api/v1/test_deals.py` | `POST /actions` tests. |
| `backend/tests/api/v1/test_activity_edit.py` *(create)* | `PATCH` / `DELETE` permission matrix. |

**Frontend — create**

| File | Responsibility |
|---|---|
| `frontend/src/app/activities/useActivityEdit.ts` | `useCreateDealAction`, `useUpdateActivity`, `useDeleteActivity`. |
| `frontend/src/app/activities/ActivityKindPicker.tsx` | Single-select label combobox with inline create. |
| `frontend/src/app/deals/TimelineDraftRow.tsx` | The "Přidat akci" composer. |
| `frontend/src/app/deals/TimelineEntryRow.tsx` | An inline-editable manual entry. |
| `frontend/src/app/deals/TimelineDraftRow.test.tsx` | Draft commit/skip behavior. |
| `frontend/src/app/deals/TimelineEntryRow.test.tsx` | Inline autosave + revert. |
| `frontend/src/app/companies/CompanyActivityTab.tsx` | The decluttered company timeline + its own test file `CompanyActivityTab.test.tsx`. |

**Frontend — modify**

| File | Change |
|---|---|
| `frontend/src/app/activities/useActivities.ts` | `activityTypes` query param. |
| `frontend/src/app/deals/DealTimelineSection.tsx` | Filtered query, draft row, entry-row dispatch. |
| `frontend/src/app/companies/CompanyDetailPage.tsx` | Delete the inline `ActivityTab`, render `CompanyActivityTab`. |
| `frontend/src/app/pipeline/DealCardPreview.tsx` | Same type filter as the timeline. |
| `frontend/src/lib/testids.ts` | New ids. |
| `frontend/src/locales/{cs,en}/{deals,companies,common}.json` | New keys. |
| `frontend/src/types/api.generated.ts` | Regenerated (Task 4). |

---

### Task 1: Schema foundation — columns, enum value, model, serialization

**Files:**
- Create: `backend/alembic/versions/20260812_1200_activity_type_manual_action_e1f2a3b4c5d6.py`
- Create: `backend/alembic/versions/20260812_1205_activity_occurred_at_label_a4b5c6d7e8f9.py`
- Modify: `backend/app/db/models/enums.py`, `backend/app/db/models/activity.py`, `backend/app/services/activity_log.py`, `backend/app/schemas/activity.py`
- Test: `backend/tests/api/v1/test_activity_feed.py`

**Interfaces:**
- Produces: `ActivityType.manual_action`; `Activity.occurred_at: datetime`, `Activity.label_id: uuid.UUID | None`, `Activity.label: EventLabel | None`; `MANUAL_ACTIVITY_TYPES: frozenset[ActivityType]` in `app.services.activity_log`; `record_activity(..., occurred_at: datetime | None = None, label_id: uuid.UUID | None = None)`; `ActivityOut.occurred_at`, `.label`, `.can_edit`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/api/v1/test_activity_feed.py`:

```python
async def test_activity_defaults_occurred_at_to_created_at(owned_cleanup: dict[str, list]) -> None:
    """A row written without an explicit occurred_at is stamped like created_at."""
    async with AsyncSessionLocal() as session:
        org, admin, company, _stage = await _seed(session, owned_cleanup)
        activity = record_activity(
            session,
            organization_id=org.id,
            entity_type=ActivityEntityType.company,
            entity_id=company.id,
            company_id=company.id,
            user_id=admin.id,
            activity_type=ActivityType.manual_action,
            payload={"note": "Volali jsme"},
        )
        await session.commit()
        await session.refresh(activity)
        assert activity.occurred_at is not None
        assert abs((activity.occurred_at - activity.created_at).total_seconds()) < 5
        assert activity.label_id is None


async def test_record_activity_accepts_backdated_occurred_at(owned_cleanup: dict[str, list]) -> None:
    """occurred_at is caller-supplied and independent of the write stamp."""
    backdated = datetime.now(UTC) - timedelta(days=3)
    async with AsyncSessionLocal() as session:
        org, admin, company, _stage = await _seed(session, owned_cleanup)
        activity = record_activity(
            session,
            organization_id=org.id,
            entity_type=ActivityEntityType.company,
            entity_id=company.id,
            company_id=company.id,
            user_id=admin.id,
            activity_type=ActivityType.manual_action,
            occurred_at=backdated,
            payload={"note": "Zpětný zápis"},
        )
        await session.commit()
        await session.refresh(activity)
        assert abs((activity.occurred_at - backdated).total_seconds()) < 1
        assert activity.created_at > activity.occurred_at
```

Add `from app.services.activity_log import record_activity` to the file's imports if it is not already there.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && DATABASE_URL=postgresql+asyncpg://simplecrm:simplecrm@localhost:5432/simplecrm POSTGRES_HOST=localhost DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run pytest tests/api/v1/test_activity_feed.py -k occurred_at -v
```

Expected: FAIL — `AttributeError: 'Activity' object has no attribute 'occurred_at'` (and `manual_action` missing from the enum).

- [ ] **Step 3: Add the enum value**

In `backend/app/db/models/enums.py`, after `deal_reopened`:

```python
    # User-authored timeline entry: "what I did", with a caller-set
    # `occurred_at` and a kind drawn from the shared calendar-label
    # vocabulary. `note` and `call_logged` are its predecessors and stay
    # valid — all three are editable (services/activity_log.MANUAL_ACTIVITY_TYPES).
    manual_action = "manual_action"
```

- [ ] **Step 4: Write the enum migration**

`backend/alembic/versions/20260812_1200_activity_type_manual_action_e1f2a3b4c5d6.py`:

```python
"""activity_type: add manual_action

Revision ID: e1f2a3b4c5d6
Revises: d5e6f7a8b9c0
Create Date: 2026-08-12 12:00:00.000000+00:00

One new `activity_type` value for user-authored timeline entries. Alone in
its own migration so the value is committed before anything can reference
it (same pattern as f7a8b9c0d1e2).
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: str | None = "d5e6f7a8b9c0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'manual_action'")


def downgrade() -> None:
    # Postgres can't drop a single enum value without recreating the type;
    # leaving an unused value in place is harmless (same as f7a8b9c0d1e2).
    pass
```

- [ ] **Step 5: Write the column migration**

`backend/alembic/versions/20260812_1205_activity_occurred_at_label_a4b5c6d7e8f9.py`:

```python
"""activities: user-settable occurred_at + shared event label

Revision ID: a4b5c6d7e8f9
Revises: e1f2a3b4c5d6
Create Date: 2026-08-12 12:05:00.000000+00:00

`created_at` stays the immutable write stamp; `occurred_at` is when the user
says the thing happened, and is what the timelines order by. Existing rows
are backfilled to their write stamp, so nothing reorders until someone
backdates an entry.

The column keeps a `now()` server default on purpose: code paths that predate
this migration (and any parallel branch checked out against the same dev DB)
insert activities without naming the column, and a bare NOT NULL would break
them.

`label_id` reuses the org-shared calendar vocabulary (`event_labels`) so the
kind list is the same one users already curate from the event form.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a4b5c6d7e8f9"
down_revision: str | None = "e1f2a3b4c5d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "activities",
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            nullable=True,
            server_default=sa.text("now()"),
        ),
    )
    op.execute("UPDATE activities SET occurred_at = created_at")
    op.alter_column("activities", "occurred_at", nullable=False)
    op.add_column(
        "activities",
        sa.Column("label_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_activities_label_id",
        "activities",
        "event_labels",
        ["label_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_activities_entity_occurred",
        "activities",
        ["entity_type", "entity_id", sa.text("occurred_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_activities_entity_occurred", table_name="activities")
    op.drop_constraint("fk_activities_label_id", "activities", type_="foreignkey")
    op.drop_column("activities", "label_id")
    op.drop_column("activities", "occurred_at")
```

- [ ] **Step 6: Extend the model**

In `backend/app/db/models/activity.py`: add `EventLabel` to the `TYPE_CHECKING` imports, add the index to `__table_args__`, and add the columns after `payload`:

```python
        Index("ix_activities_entity_occurred", "entity_type", "entity_id", "occurred_at"),
```

```python
    # When the thing happened, as opposed to when the row was written.
    # User-settable for manual entries; equal to `created_at` for everything
    # the system logs. Timelines order by this so a backdated entry lands in
    # the right place. Keeps a server default — see migration a4b5c6d7e8f9.
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # The action's kind, drawn from the org-shared calendar-label vocabulary
    # so "Hovor" means the same thing on a timeline and in the calendar.
    # NULL for every automatic row and for unlabelled manual ones; a deleted
    # label leaves the entry intact (SET NULL).
    label_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("event_labels.id", ondelete="SET NULL"),
    )
```

and next to the existing relationships:

```python
    label: Mapped[EventLabel | None] = relationship()
```

- [ ] **Step 7: Extend `record_activity` and declare the manual set**

In `backend/app/services/activity_log.py`, add `ActivityType` members to the manual set below the imports:

```python
# The activity types a user authored by hand, and therefore the only ones
# `PATCH`/`DELETE /activities/{id}` will touch. `note` and `call_logged`
# predate `manual_action` but are just as user-authored, so historical rows
# become editable too — no data migration needed.
MANUAL_ACTIVITY_TYPES: frozenset[ActivityType] = frozenset(
    {ActivityType.manual_action, ActivityType.note, ActivityType.call_logged}
)
```

and give `record_activity` two more keyword arguments (defaulted, so all ~20 existing call sites are unaffected):

```python
def record_activity(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    entity_type: ActivityEntityType,
    entity_id: uuid.UUID,
    activity_type: ActivityType,
    company_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    payload: dict[str, Any] | None = None,
    occurred_at: datetime | None = None,
    label_id: uuid.UUID | None = None,
) -> Activity:
```

Inside, pass them through — but only set `occurred_at` when it is not `None`, so the server default still applies:

```python
    activity = Activity(
        organization_id=organization_id,
        entity_type=entity_type,
        entity_id=entity_id,
        company_id=company_id,
        user_id=user_id,
        activity_type=activity_type,
        payload=payload or {},
        label_id=label_id,
    )
    if occurred_at is not None:
        activity.occurred_at = occurred_at
```

Update the docstring to say `occurred_at` defaults to the write time.

- [ ] **Step 8: Extend the output schema**

In `backend/app/schemas/activity.py` add the import `from app.schemas.event_label import EventLabelBrief` and these fields to `ActivityOut`:

```python
    # When it happened (user-settable on manual entries). `created_at` stays
    # the write stamp; timelines sort on this one.
    occurred_at: datetime
    # The kind chip, from the org's shared calendar-label vocabulary.
    label: EventLabelBrief | None = None
    # Computed per request: this row is a manual entry AND the caller either
    # wrote it or is an admin. Keeps the role rule out of the frontend.
    can_edit: bool = False
```

- [ ] **Step 9: Run the migrations and the tests**

```bash
cd backend && DATABASE_URL=postgresql+asyncpg://simplecrm:simplecrm@localhost:5432/simplecrm POSTGRES_HOST=localhost DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run alembic upgrade head
cd backend && DATABASE_URL=postgresql+asyncpg://simplecrm:simplecrm@localhost:5432/simplecrm POSTGRES_HOST=localhost DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run pytest tests/api/v1/test_activity_feed.py -v
```

Expected: `alembic upgrade head` reports both revisions applied; every test in the file passes, including the two new ones.

- [ ] **Step 10: Commit**

```bash
git add backend/app/db/models/enums.py backend/app/db/models/activity.py backend/app/services/activity_log.py backend/app/schemas/activity.py backend/alembic/versions/20260812_1200_activity_type_manual_action_e1f2a3b4c5d6.py backend/alembic/versions/20260812_1205_activity_occurred_at_label_a4b5c6d7e8f9.py backend/tests/api/v1/test_activity_feed.py
git commit -m "feat(activities): user-settable occurred_at + shared event label"
```

---

### Task 2: `POST /deals/{deal_id}/actions`

**Files:**
- Modify: `backend/app/schemas/deal.py`, `backend/app/api/v1/deals.py`
- Test: `backend/tests/api/v1/test_deals.py`

**Interfaces:**
- Consumes: `ActivityType.manual_action`, `record_activity(..., occurred_at=, label_id=)` from Task 1.
- Produces: `POST /api/v1/deals/{deal_id}/actions` → 201 `ActivityOut`; request body `DealActionCreate{label_id, body, occurred_at}`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/api/v1/test_deals.py` (reuse whatever seeding fixture the file already uses; the names below assume a seeded `deal`, `label` and auth headers helper — mirror the file's existing style exactly):

```python
async def test_create_deal_action_persists_kind_body_and_time(...) -> None:
    when = "2026-08-10T09:00:00+00:00"
    resp = await client.post(
        f"/api/v1/deals/{deal.id}/actions",
        headers=_auth(admin),
        json={"label_id": str(label.id), "body": "Prošli jsme rozpočet", "occurred_at": when},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["activity_type"] == "manual_action"
    assert data["payload"]["note"] == "Prošli jsme rozpočet"
    assert data["label"]["id"] == str(label.id)
    assert data["occurred_at"].startswith("2026-08-10T09:00")
    assert data["can_edit"] is True


async def test_create_deal_action_defaults_occurred_at_to_now(...) -> None:
    resp = await client.post(
        f"/api/v1/deals/{deal.id}/actions",
        headers=_auth(admin),
        json={"body": "Zavolal jsem"},
    )
    assert resp.status_code == 201, resp.text
    occurred = datetime.fromisoformat(resp.json()["occurred_at"])
    assert abs((occurred - datetime.now(UTC)).total_seconds()) < 30


async def test_create_deal_action_rejects_empty_payload(...) -> None:
    resp = await client.post(
        f"/api/v1/deals/{deal.id}/actions", headers=_auth(admin), json={"body": "   "}
    )
    assert resp.status_code == 422


async def test_create_deal_action_rejects_foreign_label(...) -> None:
    """A label id from another org must not attach — it would leak its name."""
    resp = await client.post(
        f"/api/v1/deals/{deal.id}/actions",
        headers=_auth(admin),
        json={"label_id": str(other_org_label.id), "body": "x"},
    )
    assert resp.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && DATABASE_URL=postgresql+asyncpg://simplecrm:simplecrm@localhost:5432/simplecrm POSTGRES_HOST=localhost DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run pytest tests/api/v1/test_deals.py -k deal_action -v
```

Expected: FAIL with 404 (route does not exist).

- [ ] **Step 3: Add the request schema**

In `backend/app/schemas/deal.py`, after `DealCallCreate`:

```python
class DealActionCreate(BaseModel):
    """An action the user carried out, logged by hand on a deal's timeline.

    The kind is an `event_labels` row — the same org vocabulary the calendar
    uses — and `occurred_at` is when it happened, defaulting to now. At least
    one of kind/body must be present: an untouched draft row must not be able
    to create an empty entry.
    """

    model_config = ConfigDict(extra="forbid")

    label_id: uuid.UUID | None = None
    body: str | None = Field(default=None, max_length=2000)
    occurred_at: datetime | None = None

    @field_validator("body")
    @classmethod
    def _trim_body(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None

    @model_validator(mode="after")
    def _require_content(self) -> DealActionCreate:
        if self.label_id is None and self.body is None:
            raise ValueError("an action needs a kind, a description, or both")
        return self
```

Add whatever of `ConfigDict`, `field_validator`, `model_validator`, `datetime`, `uuid` the file does not already import.

- [ ] **Step 4: Add the endpoint**

In `backend/app/api/v1/deals.py`, directly after `create_deal_note`:

```python
@router.post(
    "/{deal_id}/actions",
    response_model=ActivityOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_deal_action(
    deal_id: uuid.UUID,
    payload: DealActionCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ActivityOut:
    """Log an action the user carried out, at a time they choose.

    The counterpart to the automatic pipeline rows: this is the half of the
    timeline the user writes. Body text lands under the `note` payload key so
    the one renderer covers `manual_action`, `note` and `call_logged` alike.
    """
    deal = await _get_scoped(session, user, deal_id)
    if not await can_write_row(session, user, deal.owner_user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot log actions on deals outside your visibility scope",
        )

    label: EventLabel | None = None
    if payload.label_id is not None:
        label = (
            await session.execute(
                select(EventLabel).where(
                    EventLabel.id == payload.label_id,
                    EventLabel.organization_id == user.organization_id,
                )
            )
        ).scalar_one_or_none()
        if label is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Unknown label",
            )

    activity = record_activity(
        session,
        organization_id=deal.organization_id,
        entity_type=ActivityEntityType.deal,
        entity_id=deal.id,
        company_id=deal.company_id,
        user_id=user.id,
        activity_type=ActivityType.manual_action,
        occurred_at=payload.occurred_at,
        label_id=payload.label_id,
        payload={"deal_name": deal.name, **({"note": payload.body} if payload.body else {})},
    )
    await session.commit()
    await session.refresh(activity)
    out = ActivityOut.model_validate(activity)
    out.user_name = user.name
    out.label = EventLabelBrief.model_validate(label) if label else None
    out.can_edit = True
    return out
```

Add the imports it needs: `EventLabel` from `app.db.models`, `EventLabelBrief` from `app.schemas.event_label`, `DealActionCreate` from `app.schemas.deal`.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && DATABASE_URL=postgresql+asyncpg://simplecrm:simplecrm@localhost:5432/simplecrm POSTGRES_HOST=localhost DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run pytest tests/api/v1/test_deals.py -k deal_action -v
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/deal.py backend/app/api/v1/deals.py backend/tests/api/v1/test_deals.py
git commit -m "feat(deals): POST /deals/{id}/actions for hand-logged timeline entries"
```

---

### Task 3: Edit, delete, filter and reorder activities

**Files:**
- Modify: `backend/app/schemas/activity.py`, `backend/app/api/v1/activities.py`
- Test: `backend/tests/api/v1/test_activity_edit.py` (create), `backend/tests/api/v1/test_activity_feed.py`

**Interfaces:**
- Consumes: `MANUAL_ACTIVITY_TYPES`, `Activity.occurred_at`, `Activity.label`, `ActivityOut.can_edit` from Task 1.
- Produces: `PATCH /api/v1/activities/{activity_id}` → 200 `ActivityOut`; `DELETE /api/v1/activities/{activity_id}` → 204; `GET /api/v1/activities?activity_types=…` (repeatable).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/api/v1/test_activity_edit.py`, copying the fixture/seed helpers from `test_activity_feed.py` (`owned_cleanup`, `_seed`, `_auth`) so the file stands alone:

```python
"""PATCH/DELETE on manually logged activities, and the read-side filter.

The timeline is user-authored, so entries are editable after the fact — but
only the manual ones, and only by their author or an admin. Everything else
is audit trail.
"""
```

Tests to write (each async, each seeding via `_seed`):

1. `test_author_can_edit_body_label_and_time` — author PATCHes all three fields, asserts the response reflects each and that a re-`GET` agrees.
2. `test_admin_can_edit_another_users_entry` — a salesperson writes it, the org admin PATCHes it → 200.
3. `test_non_author_non_admin_cannot_edit` — a second salesperson PATCHes → 403.
4. `test_automatic_activity_cannot_be_edited` — PATCH a `stage_change` row → 403.
5. `test_cross_org_activity_is_not_found` — PATCH an id from another org → 404.
6. `test_explicit_null_clears_label_omitted_field_is_untouched`:

```python
    resp = await client.patch(
        f"/api/v1/activities/{activity.id}",
        headers=_auth(admin),
        json={"label_id": None},
    )
    assert resp.status_code == 200
    assert resp.json()["label"] is None
    assert resp.json()["payload"]["note"] == "Původní text"   # omitted → untouched
```

7. `test_occurred_at_cannot_be_cleared` — `{"occurred_at": None}` → 422.
8. `test_delete_removes_the_row` — author DELETEs → 204, subsequent GET list omits it; and a non-author salesperson gets 403.
9. `test_activity_types_filter_returns_only_requested_types`:

```python
    resp = await client.get(
        f"/api/v1/activities?entity_type=deal&entity_id={deal.id}"
        "&activity_types=manual_action&activity_types=stage_change",
        headers=_auth(admin),
    )
    types = {item["activity_type"] for item in resp.json()["items"]}
    assert types <= {"manual_action", "stage_change"}
    assert "deal_updated" not in types
```

10. `test_list_orders_by_occurred_at` — write row A now, then row B backdated 3 days; assert A precedes B in the list even though B was written later.
11. `test_can_edit_is_false_for_automatic_rows` — a `stage_change` row comes back with `can_edit: false`, a manual row by the caller with `can_edit: true`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && DATABASE_URL=postgresql+asyncpg://simplecrm:simplecrm@localhost:5432/simplecrm POSTGRES_HOST=localhost DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run pytest tests/api/v1/test_activity_edit.py -v
```

Expected: FAIL — 405/404 on PATCH and DELETE, filter ignored.

- [ ] **Step 3: Add the update schema**

In `backend/app/schemas/activity.py`:

```python
class ActivityUpdate(BaseModel):
    """Partial edit of a hand-logged activity.

    Omitting a field leaves it alone; sending an explicit `null` clears it.
    The two are told apart by `model_fields_set`, which is why every field
    defaults to `None` rather than to a sentinel.
    """

    model_config = ConfigDict(extra="forbid")

    label_id: uuid.UUID | None = None
    body: str | None = Field(default=None, max_length=2000)
    occurred_at: datetime | None = None

    @field_validator("body")
    @classmethod
    def _trim_body(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None
```

- [ ] **Step 4: Implement the read-side changes**

In `backend/app/api/v1/activities.py`, rework `_activity_out` to take the caller and compute `can_edit`, and extend `list_activities`:

```python
def _activity_out(activity: Activity, user: User) -> ActivityOut:
    out = ActivityOut.model_validate(activity)
    out.user_name = activity.user.name if activity.user else None
    out.label = EventLabelBrief.model_validate(activity.label) if activity.label else None
    out.can_edit = _can_edit(activity, user)
    return out


def _can_edit(activity: Activity, user: User) -> bool:
    """Manual entries only, and only for their author or an org admin.

    A row whose author was deleted (`user_id` NULL) is admin-only — nobody
    else can claim to have written it.
    """
    if activity.activity_type not in MANUAL_ACTIVITY_TYPES:
        return False
    if user.role is UserRole.admin:
        return True
    return activity.user_id is not None and activity.user_id == user.id
```

In the signature add:

```python
    activity_types: list[ActivityType] | None = Query(
        default=None,
        description=(
            "Repeatable. Restricts the feed to these activity types — the deal "
            "timeline asks for manual entries plus pipeline movements, the "
            "company tab for deal created/won/lost. Omit for everything."
        ),
    ),
```

then after the existing filters:

```python
    if activity_types:
        base = base.where(Activity.activity_type.in_(activity_types))
```

and change the ordering and eager-loading:

```python
    items_stmt = (
        base.options(selectinload(Activity.user), selectinload(Activity.label))
        .order_by(Activity.occurred_at.desc(), Activity.created_at.desc())
        .limit(pagination.limit)
        .offset(pagination.offset)
    )
```

Finally pass `user` into `_activity_out(a, user)` in the return.

- [ ] **Step 5: Implement PATCH and DELETE**

Append to `backend/app/api/v1/activities.py`:

```python
async def _get_editable(
    session: AsyncSession, user: User, activity_id: uuid.UUID
) -> Activity:
    """Load a manual activity the caller is allowed to change, or raise.

    404 for anything outside the caller's org (never confirm that an id
    exists elsewhere), 403 for an automatic row or someone else's entry.
    """
    activity = (
        await session.execute(
            select(Activity)
            .options(selectinload(Activity.user), selectinload(Activity.label))
            .where(
                Activity.id == activity_id,
                Activity.organization_id == user.organization_id,
            )
        )
    ).scalar_one_or_none()
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")
    if activity.activity_type not in MANUAL_ACTIVITY_TYPES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only manually logged actions can be edited",
        )
    if not _can_edit(activity, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the author or an admin can change this entry",
        )
    return activity


@router.patch("/{activity_id}", response_model=ActivityOut)
async def update_activity(
    activity_id: uuid.UUID,
    payload: ActivityUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ActivityOut:
    """Edit a hand-logged entry after the fact — the timeline is a record the
    user maintains, not an append-only log."""
    activity = await _get_editable(session, user, activity_id)
    fields = payload.model_fields_set

    if "occurred_at" in fields:
        if payload.occurred_at is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="occurred_at cannot be cleared",
            )
        activity.occurred_at = payload.occurred_at

    if "label_id" in fields:
        if payload.label_id is None:
            activity.label_id = None
        else:
            label = (
                await session.execute(
                    select(EventLabel).where(
                        EventLabel.id == payload.label_id,
                        EventLabel.organization_id == user.organization_id,
                    )
                )
            ).scalar_one_or_none()
            if label is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Unknown label",
                )
            activity.label_id = label.id

    if "body" in fields:
        # JSONB is mutated by replacement — SQLAlchemy won't see an in-place
        # dict edit without flag_modified, so rebuild the dict.
        updated = dict(activity.payload or {})
        if payload.body is None:
            updated.pop("note", None)
        else:
            updated["note"] = payload.body
        activity.payload = updated

    await session.commit()
    await session.refresh(activity, attribute_names=["label", "user"])
    return _activity_out(activity, user)


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_activity(
    activity_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> None:
    """Remove a hand-logged entry. Automatic rows are never deletable."""
    activity = await _get_editable(session, user, activity_id)
    await session.delete(activity)
    await session.commit()
```

Imports to add: `HTTPException`, `status` from fastapi; `EventLabel`, `UserRole` from `app.db.models`; `ActivityType` from `app.db.models.enums`; `ActivityUpdate` from `app.schemas.activity`; `EventLabelBrief` from `app.schemas.event_label`; `MANUAL_ACTIVITY_TYPES` from `app.services.activity_log`.

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd backend && DATABASE_URL=postgresql+asyncpg://simplecrm:simplecrm@localhost:5432/simplecrm POSTGRES_HOST=localhost DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run pytest tests/api/v1/test_activity_edit.py tests/api/v1/test_activity_feed.py -v
```

Expected: all pass.

- [ ] **Step 7: Lint, type-check, commit**

```bash
cd backend && uv run ruff check --fix . && uv run ruff format .
cd backend && DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run mypy app
git add backend/app/schemas/activity.py backend/app/api/v1/activities.py backend/tests/api/v1/test_activity_edit.py backend/tests/api/v1/test_activity_feed.py
git commit -m "feat(activities): edit/delete manual entries, filter and order the feed"
```

---

### Task 4: Regenerate the API types

**Files:**
- Modify: `frontend/src/types/api.generated.ts`

**Interfaces:**
- Consumes: every schema change from Tasks 1–3.
- Produces: `components["schemas"]["ActivityOut"]` with `occurred_at`, `label`, `can_edit`; `["ActivityUpdate"]`; `["DealActionCreate"]`.

The default generator mode imports the backend in-process, which crashes on macOS without the Homebrew glib path. Boot a server on a spare port instead.

- [ ] **Step 1: Boot the worktree backend on port 8001**

```bash
cd backend && DATABASE_URL=postgresql+asyncpg://simplecrm:simplecrm@localhost:5432/simplecrm POSTGRES_HOST=localhost DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run uvicorn app.main:app --port 8001
```

Run it in the background; wait for `Application startup complete`.

- [ ] **Step 2: Generate**

```bash
cd frontend && BACKEND_OPENAPI_URL=http://localhost:8001/api/v1/openapi.json npx pnpm types:generate
```

- [ ] **Step 3: Verify the new fields landed**

```bash
grep -n "occurred_at" frontend/src/types/api.generated.ts | head
grep -n "DealActionCreate\|ActivityUpdate" frontend/src/types/api.generated.ts | head
```

Expected: `occurred_at`, `label`, `can_edit` inside `ActivityOut`; both new schemas present. Stop the port-8001 server afterwards.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/api.generated.ts
git commit -m "chore(api-types): regenerate for activity occurred_at/label/can_edit"
```

---

### Task 5: i18n keys and test ids

**Files:**
- Modify: `frontend/src/locales/cs/{deals,companies,common}.json`, `frontend/src/locales/en/{deals,companies,common}.json`, `frontend/src/lib/testids.ts`

**Interfaces:**
- Produces: every key and id Tasks 6–9 consume. **Do this task alone** — later tasks touch disjoint files, but these two are shared, and two agents editing one JSON catalog lose each other's writes.

- [ ] **Step 1: Add the deals keys**

`frontend/src/locales/cs/deals.json`, under `dealDetail.timeline`, alongside the existing `title` / `empty` / `loading` / `loadError` / `loadMore`:

```json
"draft": {
  "legend": "Přidat akci",
  "kindLabel": "Druh",
  "kindPlaceholder": "Vyberte druh…",
  "bodyLabel": "Popis",
  "bodyPlaceholder": "Co jste udělali?",
  "timeLabel": "Kdy",
  "hint": "Uloží se samo, jakmile kliknete jinam.",
  "saveError": "Akci se nepodařilo uložit. Zkuste to prosím znovu."
},
"entry": {
  "editBody": "Upravit popis akce",
  "editKind": "Změnit druh akce",
  "editTime": "Změnit datum a čas",
  "delete": "Smazat akci",
  "saving": "Ukládám…",
  "saved": "Uloženo",
  "saveError": "Změnu se nepodařilo uložit.",
  "deleteConfirmTitle": "Smazat akci?",
  "deleteConfirmBody": "Záznam se z časové osy nenávratně odstraní.",
  "deleteConfirm": "Smazat",
  "deleteCancel": "Zrušit",
  "deleteError": "Akci se nepodařilo smazat.",
  "noKind": "Bez druhu"
},
"kindPicker": {
  "placeholder": "Hledat nebo vytvořit…",
  "create": "Vytvořit „{{name}}“",
  "creating": "Vytvářím…",
  "createError": "Druh se nepodařilo vytvořit.",
  "loading": "Načítám…",
  "loadError": "Druhy se nepodařilo načíst.",
  "noMatch": "Nic neodpovídá.",
  "clear": "Bez druhu",
  "sharedHint": "Druhy sdílíte se štítky v kalendáři."
}
```

English mirror (`frontend/src/locales/en/deals.json`): `"Add action"`, `"Kind"`, `"Pick a kind…"`, `"Description"`, `"What did you do?"`, `"When"`, `"Saves itself when you click away."`, `"Could not save the action. Please try again."`, `"Edit description"`, `"Change kind"`, `"Change date and time"`, `"Delete action"`, `"Saving…"`, `"Saved"`, `"Could not save the change."`, `"Delete action?"`, `"The entry will be permanently removed from the timeline."`, `"Delete"`, `"Cancel"`, `"Could not delete the action."`, `"No kind"`, `"Search or create…"`, `"Create “{{name}}”"`, `"Creating…"`, `"Could not create the kind."`, `"Loading…"`, `"Could not load kinds."`, `"Nothing matches."`, `"No kind"`, `"Kinds are shared with your calendar labels."`.

Also reword the timeline empty state — the section is now something you write into:

- cs `dealDetail.timeline.empty`: `"Zatím nic. Zapište první akci výše."`
- en: `"Nothing yet. Log your first action above."`

- [ ] **Step 2: Add the companies keys**

`frontend/src/locales/cs/companies.json`, under `companyDetail.activityTab`:

```json
"dealCreated": "Nový obchod",
"dealWon": "Vyhráno",
"dealLost": "Prohráno",
"empty": "Zatím žádné obchody. Až nějaký založíte nebo uzavřete, uvidíte to tady."
```

English: `"New deal"`, `"Won"`, `"Lost"`, `"No deals yet. When you create or close one, it shows up here."`

- [ ] **Step 3: Add the common key**

`frontend/src/locales/{cs,en}/common.json`, under `activities` where the other type labels live: cs `"manual_action": "Akce"`, en `"manual_action": "Action"`. Wire it into `ACTIVITY_LABEL_KEY` in `frontend/src/app/activities/activityLabels.ts` following the existing entries.

- [ ] **Step 4: Add the test ids**

`frontend/src/lib/testids.ts`, inside `deals.detail`:

```ts
      timelineDraft: "deals-detail-timeline-draft",
      timelineDraftKind: "deals-detail-timeline-draft-kind",
      timelineDraftBody: "deals-detail-timeline-draft-body",
      timelineDraftTime: "deals-detail-timeline-draft-time",
      timelineEntry: (id: string) => `deals-detail-timeline-entry-${id}`,
      timelineEntryBody: (id: string) => `deals-detail-timeline-entry-body-${id}`,
      timelineEntryKind: (id: string) => `deals-detail-timeline-entry-kind-${id}`,
      timelineEntryTime: (id: string) => `deals-detail-timeline-entry-time-${id}`,
      timelineEntryDelete: (id: string) => `deals-detail-timeline-entry-delete-${id}`,
```

and inside `companies`:

```ts
    activityRow: (id: string) => `company-activity-row-${id}`,
```

- [ ] **Step 5: Verify parity and commit**

```bash
cd frontend && npx pnpm i18n:check
```

Expected: passes with no missing keys in either direction.

```bash
git add frontend/src/locales frontend/src/lib/testids.ts frontend/src/app/activities/activityLabels.ts
git commit -m "i18n(timeline): keys and test ids for the manual deal timeline"
```

---

### Task 6: Frontend data layer and kind picker

**Files:**
- Modify: `frontend/src/app/activities/useActivities.ts`
- Create: `frontend/src/app/activities/useActivityEdit.ts`, `frontend/src/app/activities/ActivityKindPicker.tsx`

**Interfaces:**
- Consumes: regenerated `ActivityOut` (Task 4); i18n keys and testids (Task 5); `useEventLabels`, `nextEventLabelColor`, `labelTint`, `EventLabelBrief` from `@/app/events/useEventLabels`; `matches` from `@/lib/fold`.
- Produces:
  - `useActivities({ …, activityTypes?: string[] })`
  - `useCreateDealAction(dealId: string): UseMutationResult<ActivityOut, Error, {label_id: string | null; body: string | null; occurred_at: string}>`
  - `useUpdateActivity(): UseMutationResult<ActivityOut, Error, {id: string; patch: {label_id?: string | null; body?: string | null; occurred_at?: string}}>`
  - `useDeleteActivity(): UseMutationResult<void, Error, string>`
  - `<ActivityKindPicker value={EventLabelBrief | null} onChange={(l: EventLabelBrief | null) => void} testId={string} />`

- [ ] **Step 1: Add the filter param to `useActivities`**

Add `activityTypes?: string[]` to `UseActivitiesOptions`, include it in the query key, and append one `activity_types` param per entry:

```ts
      for (const type of activityTypes ?? []) params.append("activity_types", type);
```

Keep the key stable: `queryKey: ["activities", { entityType, entityId, companyId, limit, activityTypes }]`.

- [ ] **Step 2: Write the mutations**

`frontend/src/app/activities/useActivityEdit.ts`. Follow the shape of `useCreateDealNote` in `useActivities.ts` — `useAuth()` for the token, `apiFetch`, and on success `void qc.invalidateQueries({ queryKey: ["activities"] })` so the deal timeline, card preview and company tab all refresh. `useDeleteActivity` calls `apiFetch` with `method: "DELETE"` and returns void.

- [ ] **Step 3: Write the kind picker**

`ActivityKindPicker.tsx` — a single-select sibling of `LabelPicker.tsx`. Copy from it verbatim: the `useEventLabels` fetch, diacritic-folded filtering with `matchesFolded`, the diacritic-**sensitive** `exists` duplicate check before offering create, `nextEventLabelColor(all.length)` on create, the `role="combobox"` / `role="listbox"` wiring, `onMouseDown={(e) => e.preventDefault()}` on options so the click lands before blur, and the `labelTint` chip style.

Differences from `LabelPicker`:

- Renders **one** chip (or the `kindPicker.clear` placeholder) as a button that opens the list, not a chip array.
- Picking an option calls `onChange(label)` and closes; a "Bez druhu" row at the top calls `onChange(null)`.
- Reads its strings from the `deals` namespace under `dealDetail.timeline.kindPicker`.
- Shows `sharedHint` as `text-xs text-text-tertiary` under the list, so nobody is surprised that creating a kind here also adds a calendar label.

- [ ] **Step 4: Type-check and commit**

```bash
cd frontend && npx tsc -b --noEmit
git add frontend/src/app/activities/useActivities.ts frontend/src/app/activities/useActivityEdit.ts frontend/src/app/activities/ActivityKindPicker.tsx
git commit -m "feat(timeline): activity mutations and shared-kind picker"
```

---

### Task 7: The deal timeline — draft row and inline editing

**Files:**
- Create: `frontend/src/app/deals/TimelineDraftRow.tsx`, `frontend/src/app/deals/TimelineEntryRow.tsx`, `frontend/src/app/deals/TimelineDraftRow.test.tsx`, `frontend/src/app/deals/TimelineEntryRow.test.tsx`
- Modify: `frontend/src/app/deals/DealTimelineSection.tsx`

**Interfaces:**
- Consumes: everything from Task 6, `ActivityRow` (unchanged, for read-only rows), `ConfirmDialog` from `@/components/ui/ConfirmDialog`, `useToast`, `formatDate` + `useLocale`.
- Produces: `DEAL_TIMELINE_TYPES` exported from `DealTimelineSection.tsx` (Task 9 imports it).

- [ ] **Step 1: Write the failing draft-row test**

`TimelineDraftRow.test.tsx`, with the mutation hook mocked:

```tsx
it("does not POST when the draft was never touched", async () => {
  render(<TimelineDraftRow dealId="d1" />, { wrapper });
  fireEvent.blur(screen.getByTestId(testIds.deals.detail.timelineDraft));
  await waitFor(() => expect(mutateAsync).not.toHaveBeenCalled());
});

it("POSTs once on blur after typing, then clears the field", async () => {
  render(<TimelineDraftRow dealId="d1" />, { wrapper });
  const body = screen.getByTestId(testIds.deals.detail.timelineDraftBody);
  fireEvent.change(body, { target: { value: "Zavolal jsem Petrovi" } });
  fireEvent.blur(screen.getByTestId(testIds.deals.detail.timelineDraft));
  await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  expect(mutateAsync.mock.calls[0][0]).toMatchObject({ body: "Zavolal jsem Petrovi" });
  await waitFor(() => expect((body as HTMLInputElement).value).toBe(""));
});

it("commits on Ctrl+Enter without waiting for blur", async () => { /* keyDown ctrlKey Enter */ });
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend && npx vitest run src/app/deals/TimelineDraftRow.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the draft row**

Key mechanics:

```tsx
const [label, setLabel] = useState<EventLabelBrief | null>(null);
const [body, setBody] = useState("");
const [when, setWhen] = useState(() => toLocalInputValue(new Date()));

// Blur fires while moving between the draft's own controls; only a focus
// leaving the whole draft should commit.
function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
  void commit();
}

async function commit() {
  const trimmed = body.trim();
  if (!trimmed && !label) return;          // untouched draft never saves
  try {
    await create.mutateAsync({
      label_id: label?.id ?? null,
      body: trimmed || null,
      // datetime-local is naive local time; the API stores tz-aware.
      occurred_at: new Date(when).toISOString(),
    });
    setLabel(null);
    setBody("");
    setWhen(toLocalInputValue(new Date()));   // fresh "now" for the next entry
  } catch {
    toast.error(t("dealDetail.timeline.draft.saveError"));  // keep the draft
  }
}
```

`toLocalInputValue(d: Date)` returns `YYYY-MM-DDTHH:mm` in local time — put it in the same file and unit-test it implicitly through the component. ⌘/Ctrl+Enter on any field calls `commit()`; Escape resets all three fields.

Layout: a `rounded-lg border border-border-subtle bg-surface-overlay p-3` block above the list, `flex flex-wrap items-center gap-2` — kind picker, then a flex-1 text input, then a `datetime-local` input (`h-9 rounded-md border border-border bg-surface px-2 text-sm tabular-nums`). The hint renders as `text-xs text-text-tertiary` beneath.

- [ ] **Step 4: Run to verify it passes**

```bash
cd frontend && npx vitest run src/app/deals/TimelineDraftRow.test.tsx
```

- [ ] **Step 5: Write the failing entry-row test**

`TimelineEntryRow.test.tsx`:

```tsx
it("PATCHes the body on blur", async () => { /* change + blur → mutateAsync with {id, patch:{body}} */ });
it("reverts and toasts when the PATCH fails", async () => { /* mutateAsync rejects → old text back, toast.error called */ });
it("renders no edit affordances when can_edit is false", () => {
  render(<TimelineEntryRow activity={{ ...manual, can_edit: false }} />, { wrapper });
  expect(screen.queryByTestId(testIds.deals.detail.timelineEntryDelete("a1"))).toBeNull();
});
```

- [ ] **Step 6: Implement the entry row**

- Text: a `textarea` with `rows={1}` that autosizes (`e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`;`), transparent background, no border until hover/focus (`border border-transparent hover:border-border focus:border-accent`), so it reads as text and behaves as a field. Saves on blur and on an 800 ms debounce while typing — clear the timer on unmount.
- Kind: the chip is a `button`; clicking swaps it for `ActivityKindPicker`, and `onChange` saves immediately and closes.
- Time: the formatted timestamp is a `button`; clicking swaps it for a `datetime-local` input that saves on change/blur and closes.
- Delete: a `✕` (`X` from lucide, `size={14}`) shown at `opacity-0 group-hover:opacity-100 focus-visible:opacity-100`, opening `ConfirmDialog` with the `entry.deleteConfirm*` copy.
- Status: a `saving` / `saved` word in the meta line; `saved` clears after 2 s via `setTimeout` (clear it on unmount).
- Optimistic update: on `onMutate`, write the new value into the `["activities"]` caches; on error, restore the snapshot and toast. Follow whatever optimistic pattern the repo already uses if one exists; otherwise `qc.setQueryData` + rollback in `onError`.
- Dot: `bg-accent` when unlabelled, else the label color inline (`style={{ backgroundColor: label.color }}`) — the sanctioned data-driven exception.

- [ ] **Step 7: Rewrite the section**

In `DealTimelineSection.tsx`:

```tsx
/** Manual entries plus pipeline movement — everything else is audit data
 *  that lives in the Události / E-maily sections or nowhere. */
export const DEAL_TIMELINE_TYPES = [
  "manual_action",
  "note",
  "call_logged",
  "stage_change",
  "deal_won",
  "deal_lost",
  "deal_reopened",
] as const;
```

Pass `activityTypes: [...DEAL_TIMELINE_TYPES]` to `useActivities`. Render `<TimelineDraftRow dealId={dealId} />` above the `<ol>`, always — including in the empty and error states, so an empty timeline can still be written into. In the list, dispatch per row: `activity.can_edit ? <TimelineEntryRow …/> : <ActivityRow … hideDealName onOpenEmail={setOpenEmailId} />`.

- [ ] **Step 8: Run the frontend checks**

```bash
cd frontend && npx vitest run src/app/deals
cd frontend && npx tsc -b --noEmit
cd frontend && npx eslint src/app/deals src/app/activities
```

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/deals/TimelineDraftRow.tsx frontend/src/app/deals/TimelineEntryRow.tsx frontend/src/app/deals/TimelineDraftRow.test.tsx frontend/src/app/deals/TimelineEntryRow.test.tsx frontend/src/app/deals/DealTimelineSection.tsx
git commit -m "feat(deals): author and edit timeline actions inline"
```

---

### Task 8: Company Aktivita tab

**Files:**
- Create: `frontend/src/app/companies/CompanyActivityTab.tsx`, `frontend/src/app/companies/CompanyActivityTab.test.tsx`
- Modify: `frontend/src/app/companies/CompanyDetailPage.tsx` (delete the local `ActivityTab`, import the new one)

**Interfaces:**
- Consumes: `useActivities` with `activityTypes` (Task 6), the `companies` keys and `activityRow` testid (Task 5), `formatMoney`/`formatDate` from `@/lib/format`, `useLocale`.

- [ ] **Step 1: Write the failing test**

```tsx
it("renders won in magenta and lost in danger, and nothing else", () => {
  render(<CompanyActivityTab companyId="c1" />, { wrapper });   // 3 seeded rows + one email_sent
  const won = screen.getByTestId(testIds.companies.activityRow("won-1"));
  expect(won.className).toContain("bg-win-subtle");
  const lost = screen.getByTestId(testIds.companies.activityRow("lost-1"));
  expect(lost.className).toContain("bg-danger-subtle");
  expect(screen.queryByText(/E-mail/)).toBeNull();
});
```

Also assert the request carried the three `activity_types` params.

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend && npx vitest run src/app/companies/CompanyActivityTab.test.tsx
```

- [ ] **Step 3: Implement the tab**

```tsx
const COMPANY_TIMELINE_TYPES = ["deal_created", "deal_won", "deal_lost"] as const;

const ROW_STYLE = {
  deal_created: { dot: "bg-accent", row: "", labelKey: "companyDetail.activityTab.dealCreated" },
  deal_won: { dot: "bg-win", row: "bg-win-subtle", labelKey: "companyDetail.activityTab.dealWon" },
  deal_lost: { dot: "bg-danger", row: "bg-danger-subtle", labelKey: "companyDetail.activityTab.dealLost" },
} as const;
```

Each row: a `<li>` with `rounded-md px-3 py-2` plus the row wash, the dot at `h-2.5 w-2.5 rounded-full`, the label in `text-sm font-medium`, the deal name as a `<Link to={`/app/deals/${activity.entity_id}`} className="text-accent hover:text-accent-hover">`, and a meta line with the value (`formatMoney(payload.value, locale, currency)` when the payload carries one), the date (`formatDate(occurred_at, locale, { dateStyle: "medium" })`) and the actor.

Keep the existing loading / error / empty branches; use the reworded empty copy. Won and lost keep their text label as well as their color, so the tab does not rely on color alone for a11y even though color alone suffices visually.

- [ ] **Step 4: Swap it in**

In `CompanyDetailPage.tsx` delete the local `ActivityTab` function and its now-unused `ActivityRow` / `useActivities` imports, import `CompanyActivityTab`, and render `<CompanyActivityTab companyId={company.id} />` in the `activeTab === "activity"` branch. If `EmailDetailModal` becomes unused in that file, drop the import too — but check the emails tab first.

- [ ] **Step 5: Run the checks**

```bash
cd frontend && npx vitest run src/app/companies
cd frontend && npx tsc -b --noEmit
cd frontend && npx eslint src/app/companies
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/companies/CompanyActivityTab.tsx frontend/src/app/companies/CompanyActivityTab.test.tsx frontend/src/app/companies/CompanyDetailPage.tsx
git commit -m "feat(companies): Aktivita shows only deals created, won and lost"
```

---

### Task 9: Align the pipeline card preview

**Files:**
- Modify: `frontend/src/app/pipeline/DealCardPreview.tsx`

- [ ] **Step 1: Filter the query**

Import `DEAL_TIMELINE_TYPES` from `@/app/deals/DealTimelineSection` and pass `activityTypes: [...DEAL_TIMELINE_TYPES]` to the preview's `useActivities` call, so "Poslední akce" cannot surface a field edit the timeline itself no longer shows.

- [ ] **Step 2: Verify and commit**

```bash
cd frontend && npx vitest run src/app/pipeline
cd frontend && npx tsc -b --noEmit
git add frontend/src/app/pipeline/DealCardPreview.tsx
git commit -m "fix(pipeline): card preview shows the same activity set as the timeline"
```

---

### Task 10: Full local CI

**Files:** none — verification only.

- [ ] **Step 1: Autofix formatting first** (the formatters are what actually go red)

```bash
cd backend && uv run ruff check --fix . && uv run ruff format .
cd frontend && npx prettier --write .
```

- [ ] **Step 2: Backend job** (fail-fast: ruff runs before mypy and pytest, so a lint error hides every test failure behind it)

```bash
cd backend && DATABASE_URL=postgresql+asyncpg://simplecrm:simplecrm@localhost:5432/simplecrm POSTGRES_HOST=localhost DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run ruff check .
cd backend && DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run ruff format --check .
cd backend && DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run mypy app
cd backend && DATABASE_URL=postgresql+asyncpg://simplecrm:simplecrm@localhost:5432/simplecrm POSTGRES_HOST=localhost DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run alembic upgrade head
cd backend && DATABASE_URL=postgresql+asyncpg://simplecrm:simplecrm@localhost:5432/simplecrm POSTGRES_HOST=localhost DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run pytest
```

- [ ] **Step 3: Frontend job**

```bash
cd frontend && npx eslint .
cd frontend && npx tsc -b --noEmit
cd frontend && npx prettier --check .
cd frontend && npx vitest run
cd frontend && npx vite build
cd frontend && npx pnpm i18n:check
```

- [ ] **Step 4: api-types job** (needs the port-8001 server from Task 4 running again)

```bash
cd frontend && BACKEND_OPENAPI_URL=http://localhost:8001/api/v1/openapi.json node scripts/generate-api-types.mjs --check
```

- [ ] **Step 5: Commit any formatter churn**

```bash
git add -u backend frontend
git commit -m "chore: formatter pass"
```

---

## Self-review notes

- **Spec coverage.** occurred_at + label + enum → T1; create → T2; edit/delete/filter/order/`can_edit` → T3; types → T4; i18n + testids → T5; picker + hooks → T6; draft row, inline edit, no-save semantics, section filter → T7; company tab and its colors → T8; card-preview alignment → T9; the whole test matrix is distributed across T1–T3 (backend) and T7–T8 (frontend).
- **Ordering constraint.** T1 → {T2, T3} → T4 → T5 → {T7, T8, T9} with T6 between T5 and T7. T7/T8/T9 touch disjoint files and may run in parallel; T5 must not.
- **Known divergence from the spec.** The spec did not mention `occurred_at`'s server default. It is required: main-branch and parallel-branch code inserts activities without naming the column against the same dev database, and a bare `NOT NULL` would break those inserts. Recorded in the migration docstring.
