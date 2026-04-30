"""Endpoints used while a user is between Google login and a usable session.

These bypass the org/trial gates because, by definition, the user has
either no org yet (`POST /onboarding/organization`) or no auth at all
(`GET /onboarding/invite/{token}` is hit by an invitee before login).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db import get_db
from app.db.models import User
from app.schemas.auth import CurrentUser
from app.schemas.invitation import CreateOrganizationIn, InvitationPreview
from app.services.invitations import (
    InvitationAlreadyConsumedError,
    InvitationExpiredError,
    InvitationNotFoundError,
    get_invitation_by_token,
)
from app.services.onboarding import create_organization_with_admin

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.post("/organization", response_model=CurrentUser, status_code=status.HTTP_201_CREATED)
async def create_organization(
    payload: CreateOrganizationIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> User:
    """Provision a new Organization for the currently logged-in user.

    Only callable by users who don't already belong to an org — calling
    this from an existing-org user is a 409 (the create-org page is
    front-end-gated, so this is just a defense-in-depth check).
    """
    if user.organization_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Already a member of an organization",
        )
    await create_organization_with_admin(session, name=payload.name.strip(), founder=user)
    await session.commit()
    await session.refresh(user, attribute_names=["organization"])
    return user


@router.get("/invite/{token}", response_model=InvitationPreview)
async def preview_invitation(
    token: str,
    session: AsyncSession = Depends(get_db),
) -> InvitationPreview:
    """Public preview for the AcceptInvitePage. Distinguishes signature
    failure (404), expiry (410 Gone), and already-consumed (409) so the
    UI can render a precise message."""
    try:
        invitation = await get_invitation_by_token(session, token)
    except InvitationNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found"
        ) from exc
    except InvitationExpiredError as exc:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={"detail": "Invitation expired", "code": "invitation_expired"},
        ) from exc
    except InvitationAlreadyConsumedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"detail": "Invitation already used", "code": "invitation_consumed"},
        ) from exc

    return InvitationPreview(
        organization_name=invitation.organization.name if invitation.organization else "",
        email=invitation.email,
        role=invitation.role,
        team_name=invitation.team.name if invitation.team else None,
    )
