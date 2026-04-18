"""Pipeline + Kanban-board endpoints."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user
from app.core.scoping import scope_by_owner
from app.db import get_db
from app.db.models import Deal, Organization, Pipeline, User
from app.schemas.deal import DealOut
from app.schemas.pipeline import BoardStage, PipelineBoard, PipelineSummary

router = APIRouter(prefix="/pipelines", tags=["pipelines"])


async def _fetch_default_pipeline(session: AsyncSession, user: User) -> Pipeline:
    stmt = (
        select(Pipeline)
        .where(
            Pipeline.organization_id == user.organization_id,
            Pipeline.is_default.is_(True),
        )
        .options(selectinload(Pipeline.stages))
    )
    pipeline = (await session.execute(stmt)).scalar_one_or_none()
    if pipeline is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No default pipeline configured for your organization.",
        )
    return pipeline


@router.get("/default", response_model=PipelineSummary)
async def get_default_pipeline(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Pipeline:
    return await _fetch_default_pipeline(session, user)


@router.get("/default/board", response_model=PipelineBoard)
async def get_default_pipeline_board(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> PipelineBoard:
    pipeline = await _fetch_default_pipeline(session, user)

    # Load the org's currency once for the board total. Deals carry their
    # own currency per-row but the board uses the org's default currency
    # for per-stage totals (multi-currency sums land in a later task if needed).
    org = await session.get(Organization, user.organization_id)
    if org is None:
        raise RuntimeError("current user points at a missing organization")

    # Fetch every visible deal in one scoped query.
    stmt = select(Deal).where(
        Deal.organization_id == user.organization_id,
        Deal.stage_id.in_([s.id for s in pipeline.stages]),
    )
    scoped = await scope_by_owner(stmt, session=session, user=user, owner_col=Deal.owner_user_id)
    deals = (await session.execute(scoped)).scalars().all()

    grouped: dict[str, list[Deal]] = defaultdict(list)
    totals: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    for deal in deals:
        key = str(deal.stage_id)
        grouped[key].append(deal)
        # Only add to the stage total if the deal is in the org's currency;
        # cross-currency deals contribute to the list but not the total.
        if deal.currency == org.currency:
            totals[key] += deal.value

    board_stages = [
        BoardStage(
            id=stage.id,
            name=stage.name,
            color=stage.color,
            position=stage.position,
            stage_type=stage.stage_type,
            default_probability=stage.default_probability,
            deal_count=len(grouped[str(stage.id)]),
            total_value=totals[str(stage.id)],
            currency=org.currency,
            deals=[
                DealOut.model_validate(d)
                for d in sorted(
                    grouped[str(stage.id)],
                    key=lambda d: d.created_at,
                    reverse=True,
                )
            ],
        )
        for stage in sorted(pipeline.stages, key=lambda s: s.position)
    ]

    return PipelineBoard(
        id=pipeline.id,
        name=pipeline.name,
        is_default=pipeline.is_default,
        currency=org.currency,
        stages=board_stages,
    )
