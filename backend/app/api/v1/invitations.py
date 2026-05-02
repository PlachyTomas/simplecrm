"""Invitations CRUD — admin / `can_invite`-only management of pending invites."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_can_invite
from app.db import get_db
from app.db.models import Invitation, User
from app.schemas.invitation import (
    InvitationCreate,
    InvitationCreated,
    InvitationOut,
)
from app.schemas.pagination import Page, PaginationParams
from app.services.invitations import (
    InvitationNotFoundError,
    SeatLimitReachedError,
    UserAlreadyInOrganizationError,
    build_invite_link,
    create_invitation,
    revoke_invitation,
)

router = APIRouter(prefix="/invitations", tags=["invitations"])


@router.get("", response_model=Page[InvitationOut])
async def list_invitations(
    pagination: PaginationParams = Depends(),
    user: User = Depends(require_can_invite),
    session: AsyncSession = Depends(get_db),
) -> Page[InvitationOut]:
    """List pending (unaccepted, unrevoked) invitations for the current org.
    Acceptance and revocation history is implicit and not exposed here —
    the create-form is the single source of truth for what's outstanding."""
    base = select(Invitation).where(
        Invitation.organization_id == user.organization_id,
        Invitation.accepted_at.is_(None),
        Invitation.revoked_at.is_(None),
    )
    total = (
        await session.execute(select(func.count()).select_from(base.subquery()))
    ).scalar_one()
    stmt = base.order_by(Invitation.created_at.desc()).limit(pagination.limit).offset(pagination.offset)
    rows = (await session.execute(stmt)).scalars().all()
    return Page[InvitationOut](
        items=[InvitationOut.model_validate(inv) for inv in rows],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.post("", response_model=InvitationCreated, status_code=status.HTTP_201_CREATED)
async def create(
    payload: InvitationCreate,
    user: User = Depends(require_can_invite),
    session: AsyncSession = Depends(get_db),
) -> InvitationCreated:
    # `require_can_invite` already 403s when org is None; the cast helps mypy.
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No organization")
    try:
        issued = await create_invitation(
            session,
            organization_id=user.organization_id,
            inviter=user,
            email=payload.email,
            role=payload.role,
            team_id=payload.team_id,
            can_invite=payload.can_invite,
        )
    except UserAlreadyInOrganizationError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "detail": "Tento e-mail už patří k jiné organizaci.",
                "code": "user_already_in_organization",
            },
        ) from exc
    except SeatLimitReachedError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "detail": (
                    "Dosáhli jste smluvního počtu uživatelů. "
                    "Navyšte počet v Nastavení → Organizace, nebo zrušte čekající pozvánku."
                ),
                "code": "seat_limit_reached",
            },
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    await session.commit()
    await session.refresh(issued.invitation)

    return InvitationCreated(
        invitation=InvitationOut.model_validate(issued.invitation),
        invite_url=build_invite_link(issued.token),
    )


@router.delete("/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke(
    invitation_id: uuid.UUID,
    user: User = Depends(require_can_invite),
    session: AsyncSession = Depends(get_db),
) -> None:
    try:
        await revoke_invitation(session, invitation_id=invitation_id, actor=user)
    except InvitationNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found"
        ) from exc
    await session.commit()
