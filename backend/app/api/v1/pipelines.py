"""Pipeline + Kanban-board endpoints."""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, require_role
from app.core.scoping import scope_by_owner
from app.db import get_db
from app.db.models import Deal, Organization, Pipeline, Stage, User, UserRole
from app.db.models.enums import StageType
from app.schemas.deal import DealOut
from app.schemas.pipeline import (
    BoardStage,
    PipelineBoard,
    PipelineSummary,
    StageCreate,
    StageOut,
    StageReorder,
    StageUpdate,
)

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
    won_window_days: int | None = Query(
        default=None,
        ge=1,
        le=3650,
        description=(
            "Rolling window (in days) for deals shown in won stages. "
            "Omit to show all wons; the frontend defaults to 30."
        ),
    ),
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

    # Open deals always show. Won-stage deals show within the rolling window
    # (default 30 days) so the won column doesn't pile up indefinitely.
    # Lost deals (open-type stage, closed_at + lost_reason set per the brief)
    # are excluded — see QA-027.
    won_stage_ids = [s.id for s in pipeline.stages if s.stage_type is StageType.won]
    visibility: list[Any] = [Deal.closed_at.is_(None)]
    if won_stage_ids:
        if won_window_days is None:
            visibility.append(Deal.stage_id.in_(won_stage_ids))
        else:
            cutoff = datetime.now(tz=UTC) - timedelta(days=won_window_days)
            visibility.append(and_(Deal.stage_id.in_(won_stage_ids), Deal.closed_at >= cutoff))

    stmt = select(Deal).where(
        Deal.organization_id == user.organization_id,
        Deal.stage_id.in_([s.id for s in pipeline.stages]),
        or_(*visibility),
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

    def _order_deals(stage: Stage, items: list[Deal]) -> list[Deal]:
        # Won column: unpaid first (so the salesperson sees what's still
        # owed at the top), then paid deals ordered by paid_at desc so
        # the most recently collected sit just below the unpaid pile.
        # `paid_at` is NULL for unpaid rows; we coerce to closed_at so
        # the unpaid block keeps the "freshest win at top" feel.
        if stage.stage_type is StageType.won:
            from datetime import UTC, datetime

            sentinel = datetime.min.replace(tzinfo=UTC)
            return sorted(
                items,
                key=lambda d: (
                    d.is_paid,  # False (=unpaid) < True (=paid)
                    -(d.paid_at or d.closed_at or sentinel).timestamp(),
                ),
            )
        return sorted(items, key=lambda d: d.created_at, reverse=True)

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
            deals=[DealOut.model_validate(d) for d in _order_deals(stage, grouped[str(stage.id)])],
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


async def _load_stage_for_write(session: AsyncSession, stage_id: uuid.UUID, user: User) -> Stage:
    stmt = (
        select(Stage)
        .join(Pipeline, Pipeline.id == Stage.pipeline_id)
        .where(Stage.id == stage_id, Pipeline.organization_id == user.organization_id)
    )
    stage = (await session.execute(stmt)).scalar_one_or_none()
    if stage is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")
    return stage


@router.post(
    "/default/stages",
    response_model=StageOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_stage(
    payload: StageCreate,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> Stage:
    pipeline = await _fetch_default_pipeline(session, user)
    max_pos = max((s.position for s in pipeline.stages), default=0)
    stage = Stage(
        pipeline_id=pipeline.id,
        name=payload.name.strip(),
        default_probability=payload.default_probability,
        color=payload.color,
        position=max_pos + 10,
        stage_type=payload.stage_type,
    )
    session.add(stage)
    await session.commit()
    await session.refresh(stage)
    return stage


@router.patch("/stages/{stage_id}", response_model=StageOut)
async def update_stage(
    stage_id: uuid.UUID,
    payload: StageUpdate,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> Stage:
    stage = await _load_stage_for_write(session, stage_id, user)
    data = payload.model_dump(exclude_unset=True)
    if data.get("name"):
        stage.name = data["name"].strip()
    if data.get("default_probability") is not None:
        stage.default_probability = data["default_probability"]
    if data.get("color"):
        stage.color = data["color"]
    if data.get("stage_type") is not None:
        stage.stage_type = data["stage_type"]
    await session.commit()
    await session.refresh(stage)
    return stage


@router.delete("/stages/{stage_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stage(
    stage_id: uuid.UUID,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> None:
    stage = await _load_stage_for_write(session, stage_id, user)

    # Guard: never leave a pipeline without at least one won stage — that
    # would break mark-as-won.
    if stage.stage_type is StageType.won:
        other_won_stmt = (
            select(func.count())
            .select_from(Stage)
            .where(
                Stage.pipeline_id == stage.pipeline_id,
                Stage.stage_type == StageType.won,
                Stage.id != stage.id,
            )
        )
        remaining = (await session.execute(other_won_stmt)).scalar_one()
        if remaining == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the only won stage in the pipeline.",
            )

    # Guard: refuse to delete a stage that still has deals. The UI should
    # move them first; we avoid silent data loss by returning 409.
    count_stmt = select(func.count()).select_from(Deal).where(Deal.stage_id == stage.id)
    in_use = (await session.execute(count_stmt)).scalar_one()
    if in_use:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Stage still holds {in_use} deal(s); move them first.",
        )

    await session.delete(stage)
    await session.commit()


@router.post("/default/reorder-stages", response_model=PipelineSummary)
async def reorder_stages(
    payload: StageReorder,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> Pipeline:
    pipeline = await _fetch_default_pipeline(session, user)
    existing = {s.id: s for s in pipeline.stages}
    if set(payload.stage_ids) != set(existing.keys()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="stage_ids must be a permutation of the pipeline's stages.",
        )

    # Two-pass rewrite to avoid colliding on the
    # unique (pipeline_id, position) constraint: first push every row to a
    # high temp offset, then write final positions.
    offset = 1000
    for stage in pipeline.stages:
        stage.position += offset
    await session.flush()

    for idx, sid in enumerate(payload.stage_ids):
        existing[sid].position = (idx + 1) * 10
    await session.commit()
    await session.refresh(pipeline, attribute_names=["stages"])
    return pipeline
