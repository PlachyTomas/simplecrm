"""User management endpoints (list + role/team/active updates)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db import get_db
from app.db.models import Team, User, UserRole
from app.schemas.pagination import Page, PaginationParams
from app.schemas.user import UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


async def _get_target(session: AsyncSession, user: User, user_id: uuid.UUID) -> User:
    stmt = select(User).where(User.organization_id == user.organization_id, User.id == user_id)
    target = (await session.execute(stmt)).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return target


@router.get("", response_model=Page[UserOut])
async def list_users(
    pagination: PaginationParams = Depends(),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Page[UserOut]:
    base = select(User).where(User.organization_id == user.organization_id)
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    stmt = base.order_by(User.name).limit(pagination.limit).offset(pagination.offset)
    rows = (await session.execute(stmt)).scalars().all()
    return Page[UserOut](
        items=[UserOut.model_validate(u) for u in rows],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> User:
    target = await _get_target(session, user, user_id)
    data = payload.model_dump(exclude_unset=True)

    # Guard: never strip the org of its last active admin — that would lock
    # everyone out of admin-only settings (pipeline, users, teams).
    would_lose_admin = ("role" in data and data["role"] is not UserRole.admin) or (
        "is_active" in data and data["is_active"] is False
    )
    if would_lose_admin and target.role is UserRole.admin:
        stmt = (
            select(func.count())
            .select_from(User)
            .where(
                User.organization_id == user.organization_id,
                User.role == UserRole.admin,
                User.is_active.is_(True),
                User.id != target.id,
            )
        )
        remaining = (await session.execute(stmt)).scalar_one()
        if remaining == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove or demote the only active admin.",
            )

    if "team_id" in data and data["team_id"] is not None:
        team_stmt = select(Team.id).where(
            Team.organization_id == user.organization_id, Team.id == data["team_id"]
        )
        if (await session.execute(team_stmt)).scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Team does not exist in your organization.",
            )

    if "role" in data and data["role"] is not None:
        target.role = data["role"]
    if "team_id" in data:
        target.team_id = data["team_id"]
    if "can_invite" in data and data["can_invite"] is not None:
        target.can_invite = data["can_invite"]
    if "is_active" in data and data["is_active"] is not None:
        target.is_active = data["is_active"]

    await session.commit()
    await session.refresh(target)
    return target
