"""Unit tests for the company auto-freeing service."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Activity,
    ActivityEntityType,
    ActivityType,
    Company,
    Organization,
    OwnershipChangeReason,
    OwnershipHistory,
    User,
    UserRole,
)
from app.db.session import AsyncSessionLocal
from app.services.freeing import (
    free_expired_companies,
    free_single_company,
    reassign_company,
)


async def _seed(session: AsyncSession) -> tuple[Organization, User]:
    org = Organization(name=f"Free-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.flush()
    user = User(
        email=f"u-{uuid.uuid4().hex[:6]}@ex.cz",
        name="Owner",
        role=UserRole.salesperson,
        organization_id=org.id,
    )
    session.add(user)
    await session.flush()
    return org, user


async def test_free_expired_companies_releases_past_due() -> None:
    async with AsyncSessionLocal() as setup:
        org, user = await _seed(setup)
        now = datetime.now(tz=UTC)
        expired = Company(
            organization_id=org.id,
            name="Expired",
            owner_user_id=user.id,
            ownership_expires_at=now - timedelta(days=1),
        )
        still_fresh = Company(
            organization_id=org.id,
            name="Fresh",
            owner_user_id=user.id,
            ownership_expires_at=now + timedelta(days=30),
        )
        setup.add_all([expired, still_fresh])
        await setup.flush()
        setup.add_all(
            [
                OwnershipHistory(
                    company_id=expired.id,
                    user_id=user.id,
                    reason=OwnershipChangeReason.initial,
                ),
                OwnershipHistory(
                    company_id=still_fresh.id,
                    user_id=user.id,
                    reason=OwnershipChangeReason.initial,
                ),
            ]
        )
        await setup.commit()
        expired_id = expired.id
        fresh_id = still_fresh.id
        org_id = org.id

    async with AsyncSessionLocal() as svc:
        result = await free_expired_companies(svc, organization_id=org_id)
        assert result.count == 1
        assert expired_id in result.freed_company_ids

    async with AsyncSessionLocal() as check:
        expired_row = await check.get(Company, expired_id)
        fresh_row = await check.get(Company, fresh_id)
        assert expired_row is not None and expired_row.owner_user_id is None
        assert fresh_row is not None and fresh_row.owner_user_id is not None

        history_rows = (
            (
                await check.execute(
                    select(OwnershipHistory).where(OwnershipHistory.company_id == expired_id)
                )
            )
            .scalars()
            .all()
        )
        assert any(h.released_at is not None for h in history_rows)

        activities = (
            (
                await check.execute(
                    select(Activity).where(
                        Activity.entity_type == ActivityEntityType.company,
                        Activity.entity_id == expired_id,
                    )
                )
            )
            .scalars()
            .all()
        )
        assert any(a.activity_type == ActivityType.company_freed for a in activities)

    # Cleanup left to teardown — CASCADE chains handle it when the org is deleted.


async def test_free_single_company_noop_when_no_owner() -> None:
    async with AsyncSessionLocal() as setup:
        org, _ = await _seed(setup)
        company = Company(organization_id=org.id, name="Pool", owner_user_id=None)
        setup.add(company)
        await setup.commit()
        company_id = company.id

    async with AsyncSessionLocal() as svc:
        company_row = await svc.get(Company, company_id)
        assert company_row is not None
        await free_single_company(
            svc, company=company_row, released_by=uuid.uuid4()
        )  # no-op; should not raise


async def test_reassign_company_transfers_and_records_history() -> None:
    async with AsyncSessionLocal() as setup:
        org, user = await _seed(setup)
        other = User(
            email=f"other-{uuid.uuid4().hex[:6]}@ex.cz",
            name="Other",
            role=UserRole.salesperson,
            organization_id=org.id,
        )
        setup.add(other)
        await setup.flush()

        company = Company(organization_id=org.id, name="R", owner_user_id=user.id)
        setup.add(company)
        await setup.flush()
        setup.add(
            OwnershipHistory(
                company_id=company.id,
                user_id=user.id,
                reason=OwnershipChangeReason.initial,
            )
        )
        await setup.commit()
        company_id = company.id
        new_owner_id = other.id
        original_owner_id = user.id

    async with AsyncSessionLocal() as svc:
        company_row = await svc.get(Company, company_id)
        assert company_row is not None
        await reassign_company(
            svc,
            company=company_row,
            new_owner_id=new_owner_id,
            released_by=original_owner_id,
        )

    async with AsyncSessionLocal() as check:
        refreshed = await check.get(Company, company_id)
        assert refreshed is not None
        assert refreshed.owner_user_id == new_owner_id

        history = (
            (
                await check.execute(
                    select(OwnershipHistory).where(OwnershipHistory.company_id == company_id)
                )
            )
            .scalars()
            .all()
        )
        # Two history rows total: one released (initial) + one active (reassigned).
        assert len(history) == 2
        assert sum(1 for h in history if h.released_at is None) == 1
