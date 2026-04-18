"""Row-level visibility helpers.

Every list/get query that targets a table with an `owner_user_id` column
goes through `scope_by_owner` so the visibility rules live in one place.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import Select, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.db.models import User, UserRole


async def team_member_ids(session: AsyncSession, user: User) -> list[uuid.UUID]:
    """IDs of every user in the caller's team scope.

    - admin: every user in the organization.
    - manager: users belonging to the team they manage.
    - salesperson: users belonging to their own team.
    """
    if user.role is UserRole.admin:
        stmt = select(User.id).where(User.organization_id == user.organization_id)
    elif user.role is UserRole.manager:
        # Managers see everyone in any team they manage. A manager always
        # counts themselves.
        from app.db.models import Team

        managed_team_ids = (
            (await session.execute(select(Team.id).where(Team.manager_user_id == user.id)))
            .scalars()
            .all()
        )
        stmt = select(User.id).where(
            User.organization_id == user.organization_id,
            or_(User.team_id.in_(managed_team_ids), User.id == user.id),
        )
    else:
        # Salesperson: self + any teammates (shared team).
        if user.team_id is None:
            return [user.id]
        stmt = select(User.id).where(
            User.organization_id == user.organization_id,
            User.team_id == user.team_id,
        )
    rows: Sequence[uuid.UUID] = (await session.execute(stmt)).scalars().all()
    return list(rows)


async def scope_by_owner(
    stmt: Select[tuple[Any, ...]],
    *,
    session: AsyncSession,
    user: User,
    owner_col: InstrumentedAttribute[uuid.UUID | None],
) -> Select[tuple[Any, ...]]:
    """Apply the caller's visibility filter to `stmt`.

    Admins get no filter beyond what the caller already applied.
    Everyone else sees rows owned by a visible user OR rows with no owner
    (companies in the pool; deals without an owner assigned yet).
    """
    if user.role is UserRole.admin:
        return stmt

    visible_ids = await team_member_ids(session, user)
    return stmt.where(or_(owner_col.in_(visible_ids), owner_col.is_(None)))


async def can_write_row(
    session: AsyncSession,
    user: User,
    owner_id: uuid.UUID | None,
) -> bool:
    """Can the caller create/edit a row with the given owner?

    - admin: always.
    - manager: yes if `owner_id` is null or within their team membership.
    - salesperson: yes if `owner_id` is null, themselves, or a teammate.
    """
    if user.role is UserRole.admin:
        return True
    if owner_id is None:
        return True
    visible_ids = set(await team_member_ids(session, user))
    return owner_id in visible_ids
