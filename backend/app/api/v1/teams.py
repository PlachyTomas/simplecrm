"""Team CRUD endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db import get_db
from app.db.models import Team, User, UserRole
from app.schemas.pagination import Page, PaginationParams
from app.schemas.team import TeamCreate, TeamMemberUpdate, TeamOut, TeamUpdate

router = APIRouter(prefix="/teams", tags=["teams"])


async def _get_scoped(session: AsyncSession, user: User, team_id: uuid.UUID) -> Team:
    stmt = select(Team).where(
        Team.organization_id == user.organization_id,
        Team.id == team_id,
    )
    team: Team | None = (await session.execute(stmt)).scalar_one_or_none()
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    return team


async def _assert_user_in_org(
    session: AsyncSession, user: User, target_id: uuid.UUID | None
) -> None:
    if target_id is None:
        return
    stmt = select(User.id).where(User.organization_id == user.organization_id, User.id == target_id)
    if (await session.execute(stmt)).scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User does not exist in your organization",
        )


@router.get("", response_model=Page[TeamOut])
async def list_teams(
    pagination: PaginationParams = Depends(),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Page[TeamOut]:
    base = select(Team).where(Team.organization_id == user.organization_id)
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    stmt = base.order_by(Team.name).limit(pagination.limit).offset(pagination.offset)
    items = (await session.execute(stmt)).scalars().all()
    return Page[TeamOut](
        items=[TeamOut.model_validate(t) for t in items],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.get("/{team_id}", response_model=TeamOut)
async def get_team(
    team_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Team:
    return await _get_scoped(session, user, team_id)


@router.post("", response_model=TeamOut, status_code=status.HTTP_201_CREATED)
async def create_team(
    payload: TeamCreate,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> Team:
    await _assert_user_in_org(session, user, payload.manager_user_id)
    team = Team(
        organization_id=user.organization_id,
        name=payload.name,
        manager_user_id=payload.manager_user_id,
    )
    session.add(team)
    await session.commit()
    await session.refresh(team)
    return team


@router.put("/{team_id}", response_model=TeamOut)
async def update_team(
    team_id: uuid.UUID,
    payload: TeamUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Team:
    team = await _get_scoped(session, user, team_id)
    # Admins can edit anything; managers can edit only the team they manage.
    is_admin = user.role is UserRole.admin
    is_own_team_manager = user.role is UserRole.manager and team.manager_user_id == user.id
    if not (is_admin or is_own_team_manager):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins or the team's manager may edit this team",
        )

    updates = payload.model_dump(exclude_unset=True)
    if "manager_user_id" in updates:
        await _assert_user_in_org(session, user, updates["manager_user_id"])
    for field, value in updates.items():
        setattr(team, field, value)
    await session.commit()
    await session.refresh(team)
    return team


@router.put("/{team_id}/members", response_model=TeamOut)
async def replace_team_members(
    team_id: uuid.UUID,
    payload: TeamMemberUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Team:
    team = await _get_scoped(session, user, team_id)
    is_admin = user.role is UserRole.admin
    is_own_team_manager = user.role is UserRole.manager and team.manager_user_id == user.id
    if not (is_admin or is_own_team_manager):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins or the team's manager may edit members",
        )

    # All target users must belong to the org.
    if payload.member_ids:
        stmt = select(User.id).where(
            User.organization_id == user.organization_id,
            User.id.in_(payload.member_ids),
        )
        present = set((await session.execute(stmt)).scalars().all())
        missing = set(payload.member_ids) - present
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="One or more users are not in your organization",
            )

    # Clear existing members (set team_id to null) then reassign.
    await session.execute(update(User).where(User.team_id == team.id).values(team_id=None))
    if payload.member_ids:
        await session.execute(
            update(User)
            .where(
                User.organization_id == user.organization_id,
                User.id.in_(payload.member_ids),
            )
            .values(team_id=team.id)
        )
    await session.commit()
    await session.refresh(team)
    return team


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(
    team_id: uuid.UUID,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> None:
    team = await _get_scoped(session, user, team_id)
    # Clear members' team_id before drop so the SET NULL FK is definitely clean.
    await session.execute(update(User).where(User.team_id == team.id).values(team_id=None))
    await session.delete(team)
    await session.commit()
