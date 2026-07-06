"""Per-widget endpoints for the configurable Reports dashboard.

One endpoint per widget type so OpenAPI types stay tight (each
response is its own model — no `any` unions in the generated
TypeScript). Per REPORTS_TASK §6.1.

Common query params on every endpoint:
- `from` / `to` (ISO date, required)
- `team_id` (UUID, optional)
- `owner_user_id` (UUID, optional)

Plus widget-specific config params validated through the matching
Pydantic config schema.

The router is mounted under the same `/reports` prefix as the legacy
endpoints — see `routes.py`.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.core.scoping import assert_report_scope
from app.db import get_db
from app.db.models import User
from app.db.models.enums import UserRole
from app.schemas.reports import (
    AvgDealSizeResponse,
    CompaniesAtRiskResponse,
    DealsWonResponse,
    LeadToDealConversionResponse,
    LostReasonsBreakdownResponse,
    NewCompaniesResponse,
    PipelineValueResponse,
    RepActivityResponse,
    SalesCycleLengthResponse,
    SalesLeaderboardResponse,
    StaleDealsResponse,
    WinRateResponse,
)
from app.schemas.reports.widgets import (
    AvgDealSizeConfig,
    CompaniesAtRiskConfig,
    DealsWonConfig,
    LeadToDealConversionConfig,
    LostReasonsBreakdownConfig,
    NewCompaniesConfig,
    PipelineValueConfig,
    RepActivityConfig,
    SalesCycleLengthConfig,
    SalesLeaderboardConfig,
    StaleDealsConfig,
    WinRateConfig,
)
from app.services.reports.avg_deal_size import compute_avg_deal_size
from app.services.reports.companies_at_risk import compute_companies_at_risk
from app.services.reports.deals_won import compute_deals_won
from app.services.reports.lead_to_deal_conversion import (
    compute_lead_to_deal_conversion,
)
from app.services.reports.lost_reasons_breakdown import (
    compute_lost_reasons_breakdown,
)
from app.services.reports.new_companies import compute_new_companies
from app.services.reports.pipeline_value import compute_pipeline_value
from app.services.reports.rep_activity import compute_rep_activity
from app.services.reports.sales_cycle_length import compute_sales_cycle_length
from app.services.reports.sales_leaderboard import compute_sales_leaderboard
from app.services.reports.stale_deals import compute_stale_deals
from app.services.reports.win_rate import compute_win_rate


async def _enforce_widget_scope(
    team_id: UUID | None = Query(default=None),
    owner_user_id: UUID | None = Query(default=None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> None:
    """Router-level guard: reject a caller drilling into a team/rep outside
    their visibility (review R1 P2). Applies to every widget endpoint, which
    all accept the same `team_id` / `owner_user_id` query params."""
    await assert_report_scope(session, user, team_id=team_id, owner_user_id=owner_user_id)


# Mounted under /reports in routes.py — leading slash here makes the
# resulting paths /reports/widgets/<name>.
router = APIRouter(
    prefix="/reports/widgets",
    tags=["reports"],
    dependencies=[Depends(_enforce_widget_scope)],
)


def _validate_window(from_: date, to: date) -> None:
    if to < from_:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="`to` must be on or after `from`",
        )


@router.get("/pipeline-value", response_model=PipelineValueResponse)
async def widget_pipeline_value(
    from_: date = Query(alias="from"),
    to: date = Query(),
    team_id: UUID | None = Query(default=None),
    owner_user_id: UUID | None = Query(default=None),
    group_by: str = Query(default="none", pattern="^(none|stage|owner)$"),
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> PipelineValueResponse:
    _validate_window(from_, to)
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return await compute_pipeline_value(
        session,
        organization_id=user.organization_id,
        from_=from_,
        to=to,
        team_id=team_id,
        owner_user_id=owner_user_id,
        config=PipelineValueConfig(group_by=group_by),  # type: ignore[arg-type]
    )


@router.get("/deals-won", response_model=DealsWonResponse)
async def widget_deals_won(
    from_: date = Query(alias="from"),
    to: date = Query(),
    team_id: UUID | None = Query(default=None),
    owner_user_id: UUID | None = Query(default=None),
    display: str = Query(default="both", pattern="^(count|value|both)$"),
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> DealsWonResponse:
    _validate_window(from_, to)
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return await compute_deals_won(
        session,
        organization_id=user.organization_id,
        from_=from_,
        to=to,
        team_id=team_id,
        owner_user_id=owner_user_id,
        config=DealsWonConfig(display=display),  # type: ignore[arg-type]
    )


@router.get("/win-rate", response_model=WinRateResponse)
async def widget_win_rate(
    from_: date = Query(alias="from"),
    to: date = Query(),
    team_id: UUID | None = Query(default=None),
    owner_user_id: UUID | None = Query(default=None),
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> WinRateResponse:
    _validate_window(from_, to)
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return await compute_win_rate(
        session,
        organization_id=user.organization_id,
        from_=from_,
        to=to,
        team_id=team_id,
        owner_user_id=owner_user_id,
        config=WinRateConfig(),
    )


@router.get("/avg-deal-size", response_model=AvgDealSizeResponse)
async def widget_avg_deal_size(
    from_: date = Query(alias="from"),
    to: date = Query(),
    team_id: UUID | None = Query(default=None),
    owner_user_id: UUID | None = Query(default=None),
    scope: str = Query(default="won", pattern="^(won|open)$"),
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> AvgDealSizeResponse:
    _validate_window(from_, to)
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return await compute_avg_deal_size(
        session,
        organization_id=user.organization_id,
        from_=from_,
        to=to,
        team_id=team_id,
        owner_user_id=owner_user_id,
        config=AvgDealSizeConfig(scope=scope),  # type: ignore[arg-type]
    )


@router.get("/new-companies", response_model=NewCompaniesResponse)
async def widget_new_companies(
    from_: date = Query(alias="from"),
    to: date = Query(),
    team_id: UUID | None = Query(default=None),
    owner_user_id: UUID | None = Query(default=None),
    breakdown: str = Query(default="none", pattern="^(none|by_owner)$"),
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> NewCompaniesResponse:
    _validate_window(from_, to)
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return await compute_new_companies(
        session,
        organization_id=user.organization_id,
        from_=from_,
        to=to,
        team_id=team_id,
        owner_user_id=owner_user_id,
        config=NewCompaniesConfig(breakdown=breakdown),  # type: ignore[arg-type]
    )


@router.get("/sales-cycle-length", response_model=SalesCycleLengthResponse)
async def widget_sales_cycle_length(
    from_: date = Query(alias="from"),
    to: date = Query(),
    team_id: UUID | None = Query(default=None),
    owner_user_id: UUID | None = Query(default=None),
    metric: str = Query(default="median", pattern="^(mean|median)$"),
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> SalesCycleLengthResponse:
    _validate_window(from_, to)
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return await compute_sales_cycle_length(
        session,
        organization_id=user.organization_id,
        from_=from_,
        to=to,
        team_id=team_id,
        owner_user_id=owner_user_id,
        config=SalesCycleLengthConfig(metric=metric),  # type: ignore[arg-type]
    )


@router.get(
    "/lead-to-deal-conversion",
    response_model=LeadToDealConversionResponse,
)
async def widget_lead_to_deal_conversion(
    from_: date = Query(alias="from"),
    to: date = Query(),
    team_id: UUID | None = Query(default=None),
    owner_user_id: UUID | None = Query(default=None),
    breakdown: str = Query(default="none", pattern="^(none|by_owner)$"),
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> LeadToDealConversionResponse:
    _validate_window(from_, to)
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return await compute_lead_to_deal_conversion(
        session,
        organization_id=user.organization_id,
        from_=from_,
        to=to,
        team_id=team_id,
        owner_user_id=owner_user_id,
        config=LeadToDealConversionConfig(breakdown=breakdown),  # type: ignore[arg-type]
    )


@router.get(
    "/lost-reasons-breakdown",
    response_model=LostReasonsBreakdownResponse,
)
async def widget_lost_reasons_breakdown(
    from_: date = Query(alias="from"),
    to: date = Query(),
    team_id: UUID | None = Query(default=None),
    owner_user_id: UUID | None = Query(default=None),
    display: str = Query(default="count", pattern="^(count|value)$"),
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> LostReasonsBreakdownResponse:
    _validate_window(from_, to)
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return await compute_lost_reasons_breakdown(
        session,
        organization_id=user.organization_id,
        from_=from_,
        to=to,
        team_id=team_id,
        owner_user_id=owner_user_id,
        config=LostReasonsBreakdownConfig(display=display),  # type: ignore[arg-type]
    )


@router.get("/sales-leaderboard", response_model=SalesLeaderboardResponse)
async def widget_sales_leaderboard(
    from_: date = Query(alias="from"),
    to: date = Query(),
    team_id: UUID | None = Query(default=None),
    owner_user_id: UUID | None = Query(default=None),
    metric: str = Query(
        default="won_value",
        pattern="^(won_count|won_value|win_rate|deals_added)$",
    ),
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> SalesLeaderboardResponse:
    _validate_window(from_, to)
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return await compute_sales_leaderboard(
        session,
        organization_id=user.organization_id,
        from_=from_,
        to=to,
        team_id=team_id,
        owner_user_id=owner_user_id,
        config=SalesLeaderboardConfig(metric=metric),  # type: ignore[arg-type]
    )


@router.get("/rep-activity", response_model=RepActivityResponse)
async def widget_rep_activity(
    from_: date = Query(alias="from"),
    to: date = Query(),
    team_id: UUID | None = Query(default=None),
    owner_user_id: UUID | None = Query(default=None),
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> RepActivityResponse:
    _validate_window(from_, to)
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return await compute_rep_activity(
        session,
        organization_id=user.organization_id,
        from_=from_,
        to=to,
        team_id=team_id,
        owner_user_id=owner_user_id,
        config=RepActivityConfig(),
    )


@router.get("/stale-deals", response_model=StaleDealsResponse)
async def widget_stale_deals(
    from_: date = Query(alias="from"),
    to: date = Query(),
    team_id: UUID | None = Query(default=None),
    owner_user_id: UUID | None = Query(default=None),
    threshold: int = Query(default=60),
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> StaleDealsResponse:
    _validate_window(from_, to)
    if threshold not in (30, 60, 90):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="threshold must be one of 30, 60, 90",
        )
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return await compute_stale_deals(
        session,
        organization_id=user.organization_id,
        from_=from_,
        to=to,
        team_id=team_id,
        owner_user_id=owner_user_id,
        config=StaleDealsConfig(threshold=threshold),  # type: ignore[arg-type]
    )


@router.get("/companies-at-risk", response_model=CompaniesAtRiskResponse)
async def widget_companies_at_risk(
    from_: date = Query(alias="from"),
    to: date = Query(),
    team_id: UUID | None = Query(default=None),
    owner_user_id: UUID | None = Query(default=None),
    threshold: int = Query(default=30),
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> CompaniesAtRiskResponse:
    _validate_window(from_, to)
    if threshold not in (30, 14, 7):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="threshold must be one of 7, 14, 30",
        )
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return await compute_companies_at_risk(
        session,
        organization_id=user.organization_id,
        from_=from_,
        to=to,
        team_id=team_id,
        owner_user_id=owner_user_id,
        config=CompaniesAtRiskConfig(threshold=threshold),  # type: ignore[arg-type]
    )
