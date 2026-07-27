"""Monthly sales goals (`/api/v1/sales-goals`).

Reading is open to every member, but scoped: a salesperson sees their own
goals plus the org-wide ones; managers and admins see everything. Writing
(create/update/delete) is admin-or-manager — the same
`require_role(UserRole.manager)` gate org-shared email templates use.

Rows belonging to another organization answer 404, never 403 — the house
rule everywhere else: don't confirm that an id exists outside your tenant.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db import get_db
from app.db.models import Organization, SalesGoal, User, UserRole
from app.schemas.sales_goal import SalesGoalIn, SalesGoalList, SalesGoalProgress
from app.services.sales_goals import compute_progress

router = APIRouter(prefix="/sales-goals", tags=["sales-goals"])

_DUPLICATE = "Cíl pro tuto osobu, měsíc a metriku už existuje."


def _current_month() -> date:
    return datetime.now(tz=UTC).date().replace(day=1)


async def _org(session: AsyncSession, user: User) -> Organization:
    org = await session.get(Organization, user.organization_id)
    if org is None:  # pragma: no cover — PROTECTED_DEPS guarantees membership
        raise RuntimeError("current user points at a missing organization")
    return org


async def _user_names(session: AsyncSession, user: User) -> dict[uuid.UUID, str]:
    rows = (
        await session.execute(
            select(User.id, User.name).where(User.organization_id == user.organization_id)
        )
    ).all()
    return {row[0]: row[1] for row in rows}


async def _get_owned(session: AsyncSession, user: User, goal_id: uuid.UUID) -> SalesGoal:
    row = (
        await session.execute(
            select(SalesGoal).where(
                SalesGoal.id == goal_id,
                SalesGoal.organization_id == user.organization_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    return row


async def _assert_target_user(
    session: AsyncSession, user: User, target_id: uuid.UUID | None
) -> None:
    """A goal may only be pinned on a member of the caller's own org."""

    if target_id is None:
        return
    exists = (
        await session.execute(
            select(User.id).where(
                User.id == target_id,
                User.organization_id == user.organization_id,
            )
        )
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")


@router.get("", response_model=SalesGoalList)
async def list_sales_goals(
    month: date | None = Query(
        default=None,
        description="Any date in the month to list; defaults to the current month.",
    ),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SalesGoalList:
    """Goals for one month, with live progress attached.

    Salespeople get their own goals plus org-wide ones; managers and admins
    get every goal in the org. Not paginated — one month of goals is at most
    one row per member per metric.
    """

    period = (month or _current_month()).replace(day=1)
    stmt = select(SalesGoal).where(
        SalesGoal.organization_id == user.organization_id,
        SalesGoal.period_month == period,
    )
    if user.role is UserRole.salesperson:
        stmt = stmt.where(or_(SalesGoal.user_id == user.id, SalesGoal.user_id.is_(None)))
    rows = list((await session.execute(stmt.order_by(SalesGoal.created_at))).scalars().all())

    org = await _org(session, user)
    items = await compute_progress(
        session,
        rows,
        organization_id=org.id,
        org_currency=org.currency,
        user_names=await _user_names(session, user),
    )
    return SalesGoalList(items=items)


async def _one(session: AsyncSession, user: User, row: SalesGoal) -> SalesGoalProgress:
    org = await _org(session, user)
    items = await compute_progress(
        session,
        [row],
        organization_id=org.id,
        org_currency=org.currency,
        user_names=await _user_names(session, user),
    )
    return items[0]


@router.post("", response_model=SalesGoalProgress, status_code=status.HTTP_201_CREATED)
async def create_sales_goal(
    payload: SalesGoalIn,
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> SalesGoalProgress:
    await _assert_target_user(session, user, payload.user_id)
    row = SalesGoal(
        organization_id=user.organization_id,
        user_id=payload.user_id,
        period_month=payload.period_month,
        metric=payload.metric,
        target_value=payload.target_value,
    )
    session.add(row)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_DUPLICATE) from exc
    await session.refresh(row)
    return await _one(session, user, row)


@router.put("/{goal_id}", response_model=SalesGoalProgress)
async def update_sales_goal(
    goal_id: uuid.UUID,
    payload: SalesGoalIn,
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> SalesGoalProgress:
    row = await _get_owned(session, user, goal_id)
    await _assert_target_user(session, user, payload.user_id)
    row.user_id = payload.user_id
    row.period_month = payload.period_month
    row.metric = payload.metric
    row.target_value = payload.target_value
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_DUPLICATE) from exc
    await session.refresh(row)
    return await _one(session, user, row)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sales_goal(
    goal_id: uuid.UUID,
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> None:
    row = await _get_owned(session, user, goal_id)
    await session.delete(row)
    await session.commit()
