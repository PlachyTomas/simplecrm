"""`companies_at_risk` widget — companies whose ownership expires soon.

REPORTS_TASK §4 widget #12. Companies where
`ownership_expires_at` is within `threshold` days from now AND
`owner_user_id IS NOT NULL`. Up to 20 rows. Sorted ascending by
days remaining.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Activity, Company, User
from app.schemas.reports import CompaniesAtRiskResponse, CompanyAtRiskItem
from app.schemas.reports.widgets import CompaniesAtRiskConfig

MAX_ROWS = 20


async def compute_companies_at_risk(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_: date,
    to: date,
    team_id: UUID | None,
    owner_user_id: UUID | None,
    config: CompaniesAtRiskConfig,
) -> CompaniesAtRiskResponse:
    threshold = config.threshold
    now = datetime.now(tz=UTC)
    cutoff = now + timedelta(days=threshold)

    # Last activity timestamp per-company so the UI can show "last
    # activity DD.MM.RR" alongside the days-remaining badge.
    last_activity_subq = (
        select(
            Activity.organization_id,
            Activity.entity_id.label("company_id"),
            func.max(Activity.created_at).label("last_activity_at"),
        )
        .where(Activity.organization_id == organization_id)
        .group_by(Activity.organization_id, Activity.entity_id)
        .subquery()
    )

    stmt = (
        select(
            Company,
            User,
            last_activity_subq.c.last_activity_at,
        )
        .join(User, User.id == Company.owner_user_id, isouter=True)
        .join(
            last_activity_subq,
            last_activity_subq.c.company_id == Company.id,
            isouter=True,
        )
        .where(Company.organization_id == organization_id)
        .where(Company.owner_user_id.is_not(None))
        .where(Company.ownership_expires_at <= cutoff)
        .where(Company.ownership_expires_at >= now)
    )
    if owner_user_id is not None:
        stmt = stmt.where(Company.owner_user_id == owner_user_id)
    if team_id is not None:
        stmt = stmt.where(User.team_id == team_id)
    rows = (await session.execute(stmt)).all()

    items: list[CompanyAtRiskItem] = []
    for company, owner, last_activity_at in rows:
        days_remaining = (company.ownership_expires_at - now).days
        items.append(
            CompanyAtRiskItem(
                company_id=company.id,
                company_name=company.name,
                owner_user_id=owner.id if owner is not None else None,
                owner_name=owner.name if owner is not None else "—",
                days_until_freeing=days_remaining,
                last_activity_at=(last_activity_at.date() if last_activity_at else None),
            )
        )
    items.sort(key=lambda i: i.days_until_freeing)
    items = items[:MAX_ROWS]
    return CompaniesAtRiskResponse(items=items, threshold_days=threshold)
