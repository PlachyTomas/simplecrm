"""Undo one committed import.

Deletes only what the run **created** (rows carrying its `import_run_id`), in
FK-safe order — deals → contacts → companies — inside the caller's single
transaction.

What undo deliberately does NOT do:

* **It does not revert updates.** An import that overwrote a phone number on a
  company that already existed leaves that company alone: the row predates the
  run, so deleting it would destroy data the import never created, and we do
  not snapshot old values. The response reports the update counts under
  `updates_not_reverted` so the UI can say so out loud.
* **It does not touch anything that has been worked on since.** Four signals
  make a row survive undo:

  - `updated_at > created_at` — the row was edited after the import;
  - an `activities` row points at it — someone logged a call/note/e-mail on it,
    and that history has no FK to protect it (polymorphic `entity_id`), so
    deleting the row would leave the activity dangling;
  - a deal has `calendar_events` — those cascade on delete, so removing the
    deal would silently destroy real meetings;
  - a company still has contacts or deals that undo is *not* deleting — a deal
    created by hand after the import cascades away with its company.

Everything skipped is reported with a machine-readable `code` so the UI can
explain the leftovers instead of quietly under-deleting.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Activity,
    ActivityEntityType,
    CalendarEvent,
    Company,
    Contact,
    Deal,
    ImportRun,
    ImportRunStatus,
)

EntityType = Literal["company", "contact", "deal"]
SkipCode = Literal[
    "modified_after_import",
    "has_activity",
    "has_calendar_events",
    "has_other_records",
]

# Same ceiling as the preview's update-diff list: a 5 000-row import where
# everything was edited must not answer with a 5 000-entry payload.
MAX_SKIP_REASONS = 200

# `csv_reader.MAX_ROWS` allows 50 000 rows per file, which is well past
# asyncpg's 32 767 bind parameters per statement — every `IN (…)` below is
# therefore chunked rather than handed the whole id list.
_ID_CHUNK = 1_000

_COUNT_KEY: dict[EntityType, str] = {
    "company": "companies",
    "contact": "contacts",
    "deal": "deals",
}


def _chunked(ids: Sequence[uuid.UUID]) -> Iterator[Sequence[uuid.UUID]]:
    for start in range(0, len(ids), _ID_CHUNK):
        yield ids[start : start + _ID_CHUNK]


@dataclass(frozen=True)
class UndoSkip:
    entity_type: EntityType
    entity_id: uuid.UUID
    name: str
    code: SkipCode
    message: str


@dataclass
class UndoResult:
    status: ImportRunStatus
    deleted: dict[str, int] = field(
        default_factory=lambda: {"companies": 0, "contacts": 0, "deals": 0}
    )
    skipped: dict[str, int] = field(
        default_factory=lambda: {"companies": 0, "contacts": 0, "deals": 0}
    )
    skipped_reasons: list[UndoSkip] = field(default_factory=list)
    skipped_reasons_truncated: bool = False


def _was_modified(created_at: datetime, updated_at: datetime) -> bool:
    """The "someone touched this after the import" signal.

    Both columns are `server_default now()`, and Postgres' `now()` is the
    transaction timestamp, so a row inserted by the import has
    `updated_at == created_at` to the microsecond. Every later ORM write bumps
    `updated_at` via `onupdate=func.now()`. Strictly greater therefore means
    "written again in some later transaction".
    """
    return updated_at > created_at


async def _ids_with_activity(
    session: AsyncSession,
    organization_id: uuid.UUID,
    entity_type: ActivityEntityType,
    ids: Sequence[uuid.UUID],
) -> set[uuid.UUID]:
    found: set[uuid.UUID] = set()
    for chunk in _chunked(ids):
        stmt = (
            select(Activity.entity_id)
            .where(
                Activity.organization_id == organization_id,
                Activity.entity_type == entity_type,
                Activity.entity_id.in_(chunk),
            )
            .distinct()
        )
        found |= set((await session.execute(stmt)).scalars().all())
    return found


async def _deal_ids_with_events(
    session: AsyncSession, deal_ids: Sequence[uuid.UUID]
) -> set[uuid.UUID]:
    found: set[uuid.UUID] = set()
    for chunk in _chunked(deal_ids):
        stmt = select(CalendarEvent.deal_id).where(CalendarEvent.deal_id.in_(chunk)).distinct()
        found |= set((await session.execute(stmt)).scalars().all())
    return found


async def _child_counts(
    session: AsyncSession, company_ids: Sequence[uuid.UUID]
) -> tuple[dict[uuid.UUID, int], dict[uuid.UUID, int]]:
    """Contacts and deals still attached to each company.

    Called **after** the deal/contact deletions are flushed, so what it counts
    is exactly what would survive the company delete.
    """
    contacts: dict[uuid.UUID, int] = {}
    deals: dict[uuid.UUID, int] = {}
    for chunk in _chunked(company_ids):
        contact_rows = (
            await session.execute(
                select(Contact.company_id, func.count())
                .where(Contact.company_id.in_(chunk))
                .group_by(Contact.company_id)
            )
        ).all()
        deal_rows = (
            await session.execute(
                select(Deal.company_id, func.count())
                .where(Deal.company_id.in_(chunk))
                .group_by(Deal.company_id)
            )
        ).all()
        contacts.update({cid: count for cid, count in contact_rows if cid is not None})
        deals.update({cid: count for cid, count in deal_rows if cid is not None})
    return contacts, deals


async def _delete_by_ids(
    session: AsyncSession, model: type[Company] | type[Contact] | type[Deal], ids: list[uuid.UUID]
) -> None:
    for chunk in _chunked(ids):
        await session.execute(
            delete(model).where(model.id.in_(chunk)).execution_options(synchronize_session=False)
        )
    await session.flush()


async def undo_import_run(
    session: AsyncSession,
    *,
    run: ImportRun,
    actor_user_id: uuid.UUID,
) -> UndoResult:
    """Delete what `run` created and flip its status. Commits once.

    The caller is responsible for having checked the run's organization and
    that it is still `committed` (see the API layer) — this function assumes a
    row it is allowed to undo and locks nothing itself.
    """
    result = UndoResult(status=ImportRunStatus.undone)

    def note(
        entity_type: EntityType,
        entity_id: uuid.UUID,
        name: str,
        code: SkipCode,
        message: str,
    ) -> None:
        result.skipped[_COUNT_KEY[entity_type]] += 1
        if len(result.skipped_reasons) < MAX_SKIP_REASONS:
            result.skipped_reasons.append(
                UndoSkip(
                    entity_type=entity_type,
                    entity_id=entity_id,
                    name=name,
                    code=code,
                    message=message,
                )
            )
        else:
            result.skipped_reasons_truncated = True

    # ---- Deals first: they reference companies and contacts. ----
    deals = list(
        (
            await session.execute(
                select(Deal).where(
                    Deal.import_run_id == run.id,
                    Deal.organization_id == run.organization_id,
                )
            )
        )
        .scalars()
        .all()
    )
    deal_ids = [d.id for d in deals]
    deals_with_events = await _deal_ids_with_events(session, deal_ids)
    deals_with_activity = await _ids_with_activity(
        session, run.organization_id, ActivityEntityType.deal, deal_ids
    )
    deals_to_delete: list[uuid.UUID] = []
    for deal in deals:
        if _was_modified(deal.created_at, deal.updated_at):
            note(
                "deal",
                deal.id,
                deal.name,
                "modified_after_import",
                f"Obchod {deal.name!r} byl po importu upraven — ponecháváme ho beze změny.",
            )
        elif deal.id in deals_with_events:
            note(
                "deal",
                deal.id,
                deal.name,
                "has_calendar_events",
                f"K obchodu {deal.name!r} je naplánovaná událost — smazáním by zmizela.",
            )
        elif deal.id in deals_with_activity:
            note(
                "deal",
                deal.id,
                deal.name,
                "has_activity",
                f"K obchodu {deal.name!r} přibyla aktivita — ponecháváme ho beze změny.",
            )
        else:
            deals_to_delete.append(deal.id)
    await _delete_by_ids(session, Deal, deals_to_delete)
    result.deleted["deals"] = len(deals_to_delete)

    # ---- Contacts. ----
    contacts = list(
        (
            await session.execute(
                select(Contact).where(
                    Contact.import_run_id == run.id,
                    Contact.organization_id == run.organization_id,
                )
            )
        )
        .scalars()
        .all()
    )
    contact_ids = [c.id for c in contacts]
    contacts_with_activity = await _ids_with_activity(
        session, run.organization_id, ActivityEntityType.contact, contact_ids
    )
    contacts_to_delete: list[uuid.UUID] = []
    for contact in contacts:
        label = f"{contact.first_name} {contact.last_name}".strip()
        if _was_modified(contact.created_at, contact.updated_at):
            note(
                "contact",
                contact.id,
                label,
                "modified_after_import",
                f"Kontakt {label!r} byl po importu upraven — ponecháváme ho beze změny.",
            )
        elif contact.id in contacts_with_activity:
            note(
                "contact",
                contact.id,
                label,
                "has_activity",
                f"Ke kontaktu {label!r} přibyla aktivita — ponecháváme ho beze změny.",
            )
        else:
            contacts_to_delete.append(contact.id)
    await _delete_by_ids(session, Contact, contacts_to_delete)
    result.deleted["contacts"] = len(contacts_to_delete)

    # ---- Companies last, and only when nothing else hangs off them. ----
    companies = list(
        (
            await session.execute(
                select(Company).where(
                    Company.import_run_id == run.id,
                    Company.organization_id == run.organization_id,
                )
            )
        )
        .scalars()
        .all()
    )
    company_ids = [c.id for c in companies]
    companies_with_activity = await _ids_with_activity(
        session, run.organization_id, ActivityEntityType.company, company_ids
    )
    remaining_contacts, remaining_deals = await _child_counts(session, company_ids)
    companies_to_delete: list[uuid.UUID] = []
    for company in companies:
        left_contacts = remaining_contacts.get(company.id, 0)
        left_deals = remaining_deals.get(company.id, 0)
        if _was_modified(company.created_at, company.updated_at):
            note(
                "company",
                company.id,
                company.name,
                "modified_after_import",
                f"Firma {company.name!r} byla po importu upravena — ponecháváme ji beze změny.",
            )
        elif left_contacts or left_deals:
            # `deals.company_id` is ON DELETE CASCADE: deleting this company
            # would take a hand-made deal with it. Contacts would "only" be
            # orphaned (SET NULL), which is still someone else's work.
            note(
                "company",
                company.id,
                company.name,
                "has_other_records",
                (
                    f"U firmy {company.name!r} zůstávají další záznamy "
                    f"({left_deals} obchodů, {left_contacts} kontaktů) — mazáním by zmizely."
                ),
            )
        elif company.id in companies_with_activity:
            note(
                "company",
                company.id,
                company.name,
                "has_activity",
                f"K firmě {company.name!r} přibyla aktivita — ponecháváme ji beze změny.",
            )
        else:
            companies_to_delete.append(company.id)
    await _delete_by_ids(session, Company, companies_to_delete)
    result.deleted["companies"] = len(companies_to_delete)

    if any(result.skipped.values()):
        result.status = ImportRunStatus.partially_undone
    run.status = result.status
    run.undone_at = datetime.now(tz=UTC)
    run.undone_by_user_id = actor_user_id
    await session.commit()
    return result


def updates_not_reverted(counts: Mapping[str, object]) -> dict[str, int]:
    """`{companies, contacts}` the run UPDATED — untouched by undo.

    Read straight off the stored `counts` blob so the UI can be honest about
    what stays behind without a second bookkeeping source.
    """
    out: dict[str, int] = {}
    for key, name in (("companies_to_update", "companies"), ("contacts_to_update", "contacts")):
        value = counts.get(key)
        out[name] = value if isinstance(value, int) else 0
    return out
