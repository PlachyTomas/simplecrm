"""`sales_cycle_length` widget — days from Company.created_at to Deal.closed_at.

REPORTS_TASK §4 widget #6. Computes both mean and median in Python so
the response can show one as the headline (`config.metric`) and the
other in the tooltip — Postgres percentile_cont would also work but
we expect tiny SMB sample counts where Python's statistics module
is plenty.
"""

from __future__ import annotations

import statistics
from datetime import UTC, date, datetime, time
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Company, Deal, Stage, User
from app.db.models.enums import StageType
from app.schemas.reports import SalesCycleLengthResponse
from app.schemas.reports.widgets import SalesCycleLengthConfig


async def compute_sales_cycle_length(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_: date,
    to: date,
    team_id: UUID | None,
    owner_user_id: UUID | None,
    config: SalesCycleLengthConfig,
) -> SalesCycleLengthResponse:
    from_dt = datetime.combine(from_, time.min, tzinfo=UTC)
    to_dt = datetime.combine(to, time.max, tzinfo=UTC)

    stmt = (
        select(Deal.closed_at, Company.created_at)
        .join(Stage, Stage.id == Deal.stage_id)
        .join(Company, Company.id == Deal.company_id)
        .where(Deal.organization_id == organization_id)
        .where(Stage.stage_type == StageType.won)
        .where(Deal.closed_at.is_not(None))
        .where(Deal.closed_at >= from_dt)
        .where(Deal.closed_at <= to_dt)
    )
    if owner_user_id is not None:
        stmt = stmt.where(Deal.owner_user_id == owner_user_id)
    if team_id is not None:
        stmt = stmt.join(User, User.id == Deal.owner_user_id).where(User.team_id == team_id)
    rows = (await session.execute(stmt)).all()

    days = [
        (closed - created).days
        for closed, created in rows
        if closed is not None and created is not None and closed >= created
    ]

    n = len(days)
    if n == 0:
        return SalesCycleLengthResponse(
            value=None,
            median_days=None,
            mean_days=None,
            sample_count=0,
        )
    mean = round(statistics.mean(days), 1)
    median = round(statistics.median(days), 1)
    headline = mean if config.metric == "mean" else median
    return SalesCycleLengthResponse(
        value=headline,
        median_days=median,
        mean_days=mean,
        sample_count=n,
    )
