"""`sales_forecast` widget — open deals bucketed by expected close month.

Forward-looking: reads ALL currently-open deals (org currency,
team/owner scope) and ignores the global date window — the widget
description says so. Buckets: `overdue` (expected close before today),
one per month for a fixed 6-month horizon starting with the current
month, `later` (beyond the horizon, so totals always reconcile), and
`no_date`. Weighted values use the same probability rule as
`weighted_pipeline`.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Deal, Organization, Stage
from app.db.models.enums import StageType
from app.schemas.reports import ForecastBucket, SalesForecastResponse
from app.schemas.reports.widgets import SalesForecastConfig

HORIZON_MONTHS = 6


def _add_months(year: int, month: int, delta: int) -> tuple[int, int]:
    index = year * 12 + (month - 1) + delta
    return index // 12, index % 12 + 1


class _Acc:
    __slots__ = ("count", "value", "weighted_value")

    def __init__(self) -> None:
        self.count = 0
        self.value = Decimal(0)
        self.weighted_value = Decimal(0)

    def add(self, value: Decimal, probability: int) -> None:
        self.count += 1
        self.value += value
        self.weighted_value += value * probability / 100


async def compute_sales_forecast(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_: date,
    to: date,
    team_id: UUID | None,
    owner_user_id: UUID | None,
    config: SalesForecastConfig,
) -> SalesForecastResponse:
    org = await session.get(Organization, organization_id)
    if org is None:
        raise RuntimeError(f"organization {organization_id} not found")

    stmt = (
        select(
            Deal.value,
            Deal.expected_close_date,
            Deal.probability_override,
            Stage.default_probability,
        )
        .join(Stage, Stage.id == Deal.stage_id)
        .where(Deal.organization_id == organization_id)
        .where(Stage.stage_type == StageType.open)
        .where(Deal.currency == org.currency)
    )
    if owner_user_id is not None:
        stmt = stmt.where(Deal.owner_user_id == owner_user_id)
    if team_id is not None:
        from app.db.models import User as _User

        stmt = stmt.join(_User, _User.id == Deal.owner_user_id).where(_User.team_id == team_id)

    today = datetime.now(tz=UTC).date()
    month_keys = [
        f"{y:04d}-{m:02d}"
        for y, m in (_add_months(today.year, today.month, i) for i in range(HORIZON_MONTHS))
    ]
    horizon_end_y, horizon_end_m = _add_months(today.year, today.month, HORIZON_MONTHS - 1)

    accs: dict[str, _Acc] = {key: _Acc() for key in ("overdue", "later", "no_date", *month_keys)}
    for value, expected, override, stage_probability in (await session.execute(stmt)).all():
        probability = override if override is not None else stage_probability
        if expected is None:
            bucket = "no_date"
        elif expected < today:
            bucket = "overdue"
        elif (expected.year, expected.month) > (horizon_end_y, horizon_end_m):
            bucket = "later"
        else:
            bucket = f"{expected.year:04d}-{expected.month:02d}"
        accs[bucket].add(value, probability)

    def _bucket(kind: str, key: str, year_month: str | None) -> ForecastBucket:
        acc = accs[key]
        return ForecastBucket(
            kind=kind,  # type: ignore[arg-type]
            year_month=year_month,
            count=acc.count,
            value=acc.value,
            weighted_value=acc.weighted_value,
        )

    buckets = [
        _bucket("overdue", "overdue", None),
        *(_bucket("month", key, key) for key in month_keys),
        _bucket("later", "later", None),
        _bucket("no_date", "no_date", None),
    ]
    return SalesForecastResponse(
        buckets=buckets,
        currency=org.currency,
        total_value=sum((a.value for a in accs.values()), Decimal(0)),
        total_weighted_value=sum((a.weighted_value for a in accs.values()), Decimal(0)),
    )
