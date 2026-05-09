"""Endpoints for the deals resource."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.core.scoping import can_write_row, scope_by_owner
from app.db import get_db
from app.db.models import (
    Activity,
    ActivityEntityType,
    ActivityType,
    Company,
    Contact,
    Deal,
    Organization,
    Pipeline,
    Stage,
    User,
    UserRole,
)
from app.db.models.enums import StageType
from app.schemas.deal import (
    DealCreate,
    DealMarkLost,
    DealOut,
    DealStageMove,
    DealUpdate,
)
from app.schemas.pagination import Page, PaginationParams

router = APIRouter(prefix="/deals", tags=["deals"])


async def _get_scoped(session: AsyncSession, user: User, deal_id: uuid.UUID) -> Deal:
    base = select(Deal).where(
        Deal.organization_id == user.organization_id,
        Deal.id == deal_id,
    )
    scoped = await scope_by_owner(base, session=session, user=user, owner_col=Deal.owner_user_id)
    deal: Deal | None = (await session.execute(scoped)).scalar_one_or_none()
    if deal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    return deal


async def _assert_company_in_org(session: AsyncSession, user: User, company_id: uuid.UUID) -> None:
    exists = (
        await session.execute(
            select(Company.id).where(
                Company.organization_id == user.organization_id,
                Company.id == company_id,
            )
        )
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="company_id does not exist in your organization",
        )


async def _assert_stage_in_org(session: AsyncSession, user: User, stage_id: uuid.UUID) -> None:
    exists = (
        await session.execute(
            select(Stage.id)
            .join(Pipeline, Pipeline.id == Stage.pipeline_id)
            .where(
                Pipeline.organization_id == user.organization_id,
                Stage.id == stage_id,
            )
        )
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="stage_id does not exist in your organization",
        )


async def _assert_contact_in_org(
    session: AsyncSession, user: User, contact_id: uuid.UUID | None
) -> None:
    if contact_id is None:
        return
    exists = (
        await session.execute(
            select(Contact.id).where(
                Contact.organization_id == user.organization_id,
                Contact.id == contact_id,
            )
        )
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="primary_contact_id does not exist in your organization",
        )


@router.get("", response_model=Page[DealOut])
async def list_deals(
    pagination: PaginationParams = Depends(),
    company_id: uuid.UUID | None = Query(default=None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Page[DealOut]:
    base = select(Deal).where(Deal.organization_id == user.organization_id)
    if company_id is not None:
        base = base.where(Deal.company_id == company_id)
    scoped = await scope_by_owner(base, session=session, user=user, owner_col=Deal.owner_user_id)
    count_stmt = select(func.count()).select_from(scoped.subquery())
    total = (await session.execute(count_stmt)).scalar_one()
    items_stmt = (
        scoped.order_by(Deal.created_at.desc()).limit(pagination.limit).offset(pagination.offset)
    )
    items = (await session.execute(items_stmt)).scalars().all()
    return Page[DealOut](
        items=[DealOut.model_validate(d) for d in items],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.get("/{deal_id}", response_model=DealOut)
async def get_deal(
    deal_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Deal:
    return await _get_scoped(session, user, deal_id)


@router.post("", response_model=DealOut, status_code=status.HTTP_201_CREATED)
async def create_deal(
    payload: DealCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Deal:
    owner_id = payload.owner_user_id
    if user.role is UserRole.salesperson and owner_id is not None and owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Salesperson can assign ownership only to themselves",
        )
    if owner_id is not None and not await can_write_row(session, user, owner_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot assign ownership outside your visibility scope",
        )

    await _assert_company_in_org(session, user, payload.company_id)
    await _assert_stage_in_org(session, user, payload.stage_id)
    await _assert_contact_in_org(session, user, payload.primary_contact_id)

    # Default currency to the org's configured currency.
    currency = payload.currency
    if currency is None:
        org = await session.get(Organization, user.organization_id)
        if org is None:
            raise RuntimeError("current user points at a missing organization")
        currency = org.currency

    deal = Deal(
        organization_id=user.organization_id,
        name=payload.name,
        company_id=payload.company_id,
        stage_id=payload.stage_id,
        owner_user_id=owner_id,
        primary_contact_id=payload.primary_contact_id,
        value=payload.value,
        currency=currency,
        probability_override=payload.probability_override,
        expected_close_date=payload.expected_close_date,
    )
    session.add(deal)
    await session.commit()
    await session.refresh(deal)
    return deal


@router.put("/{deal_id}", response_model=DealOut)
async def update_deal(
    deal_id: uuid.UUID,
    payload: DealUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Deal:
    deal = await _get_scoped(session, user, deal_id)
    if not await can_write_row(session, user, deal.owner_user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot edit deals outside your visibility scope",
        )
    updates = payload.model_dump(exclude_unset=True)

    if "owner_user_id" in updates and updates["owner_user_id"] != deal.owner_user_id:
        new_owner = updates["owner_user_id"]
        if not await can_write_row(session, user, new_owner):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot reassign ownership outside your scope",
            )
    if "company_id" in updates and updates["company_id"] is not None:
        await _assert_company_in_org(session, user, updates["company_id"])
    if "stage_id" in updates and updates["stage_id"] is not None:
        await _assert_stage_in_org(session, user, updates["stage_id"])
    if "primary_contact_id" in updates:
        await _assert_contact_in_org(session, user, updates["primary_contact_id"])

    for field, value in updates.items():
        setattr(deal, field, value)
    await session.commit()
    await session.refresh(deal)
    return deal


@router.post("/{deal_id}/move-stage", response_model=DealOut)
async def move_deal_stage(
    deal_id: uuid.UUID,
    payload: DealStageMove,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Deal:
    """Drag-and-drop endpoint for the kanban board.

    Syncs `closed_at` and `lost_reason` to the destination stage's type:
      * Drag into a `won` stage  → set `closed_at = now`, clear lost_reason,
        refresh the company's last_order_at + ownership_expires_at (matches
        `mark-won` semantics; otherwise the deal would be invisible from
        the board's won-window filter).
      * Drag into a `lost` stage → set `closed_at = now` so the deal is
        marked terminal. `lost_reason` is left as-is — drag has no UI for
        capturing it; the founder can edit via the deal detail page.
      * Drag into an `open` stage → clear `closed_at` and `lost_reason`
        ("reopen"). Without this, dragging a won deal back to an earlier
        stage would leave `closed_at` set, and the board's visibility
        filter would hide the row.
    """
    from datetime import UTC, datetime, timedelta

    deal = await _get_scoped(session, user, deal_id)
    if not await can_write_row(session, user, deal.owner_user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot move deals outside your visibility scope",
        )
    await _assert_stage_in_org(session, user, payload.stage_id)

    if deal.stage_id == payload.stage_id:
        return deal  # no-op; UI sometimes sends it on drop

    previous_stage = await session.get(Stage, deal.stage_id)
    previous_type = previous_stage.stage_type if previous_stage else StageType.open
    dest_stage = await session.get(Stage, payload.stage_id)
    # _assert_stage_in_org already verified existence + org ownership.
    assert dest_stage is not None  # noqa: S101 — guaranteed by the assert above

    previous_stage_id = deal.stage_id
    deal.stage_id = payload.stage_id

    now = datetime.now(tz=UTC)
    if dest_stage.stage_type is StageType.won:
        # Match mark-won: set closed_at + refresh the owning company so
        # the auto-free clock resets. Only on transition INTO won; drags
        # between won stages (multi-won pipelines) don't double-refresh.
        if previous_type is not StageType.won:
            deal.closed_at = now
            company = await session.get(Company, deal.company_id)
            if company is not None:
                company.last_order_at = now
                window_days = user.organization.ownership_window_days if user.organization else 365
                company.ownership_expires_at = now + timedelta(days=window_days)
        deal.lost_reason = None
    elif dest_stage.stage_type is StageType.lost:
        if previous_type is not StageType.lost:
            deal.closed_at = now
    else:  # StageType.open
        # Reopen: a deal moving back to an open stage stops being terminal.
        deal.closed_at = None
        deal.lost_reason = None

    session.add(
        Activity(
            organization_id=user.organization_id,
            entity_type=ActivityEntityType.deal,
            entity_id=deal.id,
            user_id=user.id,
            activity_type=ActivityType.stage_change,
            payload={
                "from_stage_id": str(previous_stage_id),
                "to_stage_id": str(payload.stage_id),
            },
        )
    )
    await session.commit()
    await session.refresh(deal)
    return deal


@router.post("/{deal_id}/mark-won", response_model=DealOut)
async def mark_deal_won(
    deal_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Deal:
    """Stamp the deal as won, move it to the pipeline's `won` stage, and
    refresh the company's last_order_at so the auto-free clock resets.
    """
    from datetime import UTC, datetime, timedelta

    deal = await _get_scoped(session, user, deal_id)
    if not await can_write_row(session, user, deal.owner_user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot mark deals outside your visibility scope",
        )

    # Find the won stage in the same pipeline as the current stage.
    stmt = (
        select(Stage)
        .join(Pipeline, Pipeline.id == Stage.pipeline_id)
        .where(
            Pipeline.organization_id == user.organization_id,
            Stage.stage_type == StageType.won,
        )
        .order_by(Stage.position)
    )
    won_stage = (await session.execute(stmt)).scalars().first()
    if won_stage is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No won stage configured in your pipeline.",
        )

    now = datetime.now(tz=UTC)
    previous_stage_id = deal.stage_id
    deal.stage_id = won_stage.id
    deal.closed_at = now
    deal.lost_reason = None

    # Refresh the owning company's last_order_at + ownership_expires_at
    # using the org's configured release window.
    company = await session.get(Company, deal.company_id)
    if company is not None:
        company.last_order_at = now
        window_days = user.organization.ownership_window_days if user.organization else 365
        company.ownership_expires_at = now + timedelta(days=window_days)

    session.add(
        Activity(
            organization_id=user.organization_id,
            entity_type=ActivityEntityType.deal,
            entity_id=deal.id,
            user_id=user.id,
            activity_type=ActivityType.deal_won,
            payload={
                "from_stage_id": str(previous_stage_id),
                "to_stage_id": str(won_stage.id),
                "value": str(deal.value),
                "currency": deal.currency,
            },
        )
    )
    await session.commit()
    await session.refresh(deal)
    return deal


@router.post("/{deal_id}/mark-lost", response_model=DealOut)
async def mark_deal_lost(
    deal_id: uuid.UUID,
    payload: DealMarkLost,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Deal:
    """Stamp the deal as lost with a required reason. Stage stays the same
    unless a dedicated `lost` stage exists, in which case we move to it."""
    from datetime import UTC, datetime

    deal = await _get_scoped(session, user, deal_id)
    if not await can_write_row(session, user, deal.owner_user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot mark deals outside your visibility scope",
        )

    previous_stage_id = deal.stage_id
    stmt = (
        select(Stage)
        .join(Pipeline, Pipeline.id == Stage.pipeline_id)
        .where(
            Pipeline.organization_id == user.organization_id,
            Stage.stage_type == StageType.lost,
        )
        .order_by(Stage.position)
    )
    lost_stage = (await session.execute(stmt)).scalars().first()
    if lost_stage is not None:
        deal.stage_id = lost_stage.id

    deal.closed_at = datetime.now(tz=UTC)
    deal.lost_reason = payload.lost_reason

    session.add(
        Activity(
            organization_id=user.organization_id,
            entity_type=ActivityEntityType.deal,
            entity_id=deal.id,
            user_id=user.id,
            activity_type=ActivityType.deal_lost,
            payload={
                "from_stage_id": str(previous_stage_id),
                "to_stage_id": str(deal.stage_id),
                "lost_reason": payload.lost_reason,
            },
        )
    )
    await session.commit()
    await session.refresh(deal)
    return deal


@router.delete("/{deal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_deal(
    deal_id: uuid.UUID,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> None:
    deal = await _get_scoped(session, user, deal_id)
    await session.delete(deal)
    await session.commit()
