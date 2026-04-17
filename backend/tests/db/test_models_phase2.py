"""Smoke tests for the Phase 2 company + ownership-history models."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Company,
    Organization,
    OwnershipChangeReason,
    OwnershipHistory,
    User,
    UserRole,
)
from app.db.models.company import OWNERSHIP_WINDOW


async def _seed_org_and_user(db_session: AsyncSession) -> tuple[Organization, User]:
    org = Organization(name="Alfa Test s.r.o.")
    db_session.add(org)
    await db_session.flush()
    user = User(
        email=f"owner-{org.id.hex[:8]}@alfa.cz",
        name="Majitel",
        role=UserRole.admin,
        organization_id=org.id,
    )
    db_session.add(user)
    await db_session.flush()
    return org, user


async def test_company_default_ownership_expires_in_365_days(
    db_session: AsyncSession,
) -> None:
    org, owner = await _seed_org_and_user(db_session)
    before = datetime.now(tz=UTC)
    company = Company(
        organization_id=org.id,
        name="Alza.cz a.s.",
        ico="27082440",
        owner_user_id=owner.id,
    )
    db_session.add(company)
    await db_session.flush()
    await db_session.refresh(company)
    after = datetime.now(tz=UTC)

    # Default kicks in the client; the window is 365 days from insertion time.
    assert before + OWNERSHIP_WINDOW - timedelta(seconds=1) <= company.ownership_expires_at
    assert company.ownership_expires_at <= after + OWNERSHIP_WINDOW + timedelta(seconds=1)


async def test_company_ico_unique_per_organization(db_session: AsyncSession) -> None:
    org, _ = await _seed_org_and_user(db_session)
    db_session.add_all(
        [
            Company(organization_id=org.id, name="A", ico="27082440"),
            Company(organization_id=org.id, name="A duplikát", ico="27082440"),
        ]
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_same_ico_allowed_across_organizations(
    db_session: AsyncSession,
) -> None:
    first_org = Organization(name="First")
    second_org = Organization(name="Second")
    db_session.add_all([first_org, second_org])
    await db_session.flush()

    db_session.add_all(
        [
            Company(organization_id=first_org.id, name="Alza v First", ico="27082440"),
            Company(organization_id=second_org.id, name="Alza v Second", ico="27082440"),
        ]
    )
    await db_session.flush()  # should not raise


async def test_ownership_history_records_event(db_session: AsyncSession) -> None:
    org, owner = await _seed_org_and_user(db_session)
    company = Company(
        organization_id=org.id,
        name="Beta s.r.o.",
        owner_user_id=owner.id,
    )
    db_session.add(company)
    await db_session.flush()

    history = OwnershipHistory(
        company_id=company.id,
        user_id=owner.id,
        reason=OwnershipChangeReason.initial,
    )
    db_session.add(history)
    await db_session.flush()

    rows = (
        (
            await db_session.execute(
                select(OwnershipHistory).where(OwnershipHistory.company_id == company.id)
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1
    assert rows[0].reason is OwnershipChangeReason.initial
    assert rows[0].released_at is None
