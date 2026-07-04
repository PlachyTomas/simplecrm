"""Company auto-freeing: return long-unused companies to the shared pool.

Core rule (brief §7 + Phase 9): a Company whose `ownership_expires_at` has
passed AND whose owner still holds it is released (`owner_user_id` set to
`NULL`). The release:
- writes an `OwnershipHistory` row with `reason=freed_timeout` and
  `released_at=now()`;
- writes an `Activity` row with `activity_type=company_freed`.

APScheduler wiring to run this daily at 03:00 Europe/Prague is a
follow-up; for MVP the service is exposed via a manual admin-only
endpoint (see `/api/v1/companies/:id/free`) and a caller can also trigger
the full sweep for ad-hoc runs.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Activity,
    ActivityEntityType,
    ActivityType,
    Company,
    OwnershipChangeReason,
    OwnershipHistory,
)


@dataclass(frozen=True)
class FreeingResult:
    freed_company_ids: list[uuid.UUID]

    @property
    def count(self) -> int:
        return len(self.freed_company_ids)


async def _record_release(
    session: AsyncSession,
    company: Company,
    released_by: uuid.UUID | None,
    reason: OwnershipChangeReason,
    activity_type: ActivityType = ActivityType.company_freed,
) -> None:
    now = datetime.now(tz=UTC)
    # Close out any open history row for the current owner.
    await session.execute(
        update(OwnershipHistory)
        .where(
            OwnershipHistory.company_id == company.id,
            OwnershipHistory.user_id == company.owner_user_id,
            OwnershipHistory.released_at.is_(None),
        )
        .values(released_at=now)
    )
    session.add(
        Activity(
            organization_id=company.organization_id,
            entity_type=ActivityEntityType.company,
            entity_id=company.id,
            user_id=released_by,
            activity_type=activity_type,
            payload={
                "previous_owner_user_id": str(company.owner_user_id)
                if company.owner_user_id
                else None,
                "reason": reason.value,
            },
        )
    )


async def free_expired_companies(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID | None = None,
    now: datetime | None = None,
) -> FreeingResult:
    """Release every company whose ownership window has expired.

    Scoped to a single organization when `organization_id` is supplied —
    admin-initiated manual sweeps can want this. The background cron passes
    `None` and iterates over all orgs.
    """
    cutoff = now or datetime.now(tz=UTC)
    stmt = select(Company).where(
        Company.owner_user_id.is_not(None),
        Company.ownership_expires_at < cutoff,
    )
    if organization_id is not None:
        stmt = stmt.where(Company.organization_id == organization_id)

    freed: list[uuid.UUID] = []
    for company in (await session.execute(stmt)).scalars():
        await _record_release(
            session, company, released_by=None, reason=OwnershipChangeReason.freed_timeout
        )
        company.owner_user_id = None
        freed.append(company.id)

    await session.commit()
    return FreeingResult(freed_company_ids=freed)


async def free_single_company(
    session: AsyncSession,
    *,
    company: Company,
    released_by: uuid.UUID,
    reason: OwnershipChangeReason = OwnershipChangeReason.reassigned,
) -> None:
    """Manual release path invoked from the admin/manager endpoint."""
    if company.owner_user_id is None:
        return
    await _record_release(session, company, released_by=released_by, reason=reason)
    company.owner_user_id = None
    await session.commit()


async def reassign_company(
    session: AsyncSession,
    *,
    company: Company,
    new_owner_id: uuid.UUID,
    released_by: uuid.UUID,
    window_days: int = 365,
) -> None:
    """Transfer ownership to a new user and record the change in history.

    Resets the ownership clock (review R4 P2): the new owner gets a fresh
    `window_days` window, matching creation and deal-win. Without this the new
    owner inherited the previous owner's (possibly already-expired) expiry and
    could be auto-freed by the nightly sweep before working the company.
    """
    now = datetime.now(tz=UTC)
    if company.owner_user_id is not None:
        await _record_release(
            session,
            company,
            released_by=released_by,
            reason=OwnershipChangeReason.reassigned,
            # Review R4 P3: log this as a reassignment, not a "company freed"
            # event — the company moved to a new owner, it wasn't released.
            activity_type=ActivityType.ownership_reassigned,
        )
    session.add(
        OwnershipHistory(
            company_id=company.id,
            user_id=new_owner_id,
            assigned_at=now,
            reason=OwnershipChangeReason.reassigned,
        )
    )
    company.owner_user_id = new_owner_id
    company.ownership_expires_at = now + timedelta(days=window_days)
    await session.commit()
