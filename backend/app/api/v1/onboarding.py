"""Endpoints used while a user is between Google login and a usable session.

These bypass the org/trial gates because, by definition, the user has
either no org yet (`POST /onboarding/organization`) or no auth at all
(`GET /onboarding/invite/{token}` is hit by an invitee before login).
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.companies import get_registry_cache, get_registry_rate_limiter
from app.core.deps import get_current_user
from app.db import get_db
from app.db.models import User
from app.schemas.auth import CurrentUser
from app.schemas.invitation import CreateOrganizationIn, InvitationPreview
from app.schemas.registry import RegistryLookupResult
from app.services.business_registry import (
    BusinessRegistryError,
    BusinessRegistryRegistry,
    get_business_registry,
)
from app.services.invitations import (
    InvitationAlreadyConsumedError,
    InvitationExpiredError,
    InvitationNotFoundError,
    get_invitation_by_token,
)
from app.services.lookup_cache import RateLimiter, TtlCache
from app.services.onboarding import create_organization_with_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.post("/organization", response_model=CurrentUser, status_code=status.HTTP_201_CREATED)
async def create_organization(
    payload: CreateOrganizationIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    registry: BusinessRegistryRegistry = Depends(get_business_registry),
) -> User:
    """Provision a new Organization for the currently logged-in user.

    Only callable by users who don't already belong to an org — calling
    this from an existing-org user is a 409 (the create-org page is
    front-end-gated, so this is just a defense-in-depth check).

    When `payload.ico` is provided, an ARES lookup is attempted to
    prefill name/address/DIČ. ARES failures are logged but don't block
    onboarding — the IČO alone is still persisted so the admin can fill
    the rest later in Nastavení.
    """
    if user.organization_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Already a member of an organization",
        )

    billing_kwargs: dict[str, Any] = {}
    if payload.ico:
        billing_kwargs["ico"] = payload.ico
        try:
            data = await registry.resolve("CZ").lookup("CZ", payload.ico)
        except (BusinessRegistryError, ValueError) as exc:
            logger.warning("ARES lookup failed for IČO %s during onboarding: %s", payload.ico, exc)
        else:
            if data is not None:
                billing_kwargs.update(
                    ico=data.ico,
                    dic=data.dic,
                    address_street=data.address_street,
                    address_city=data.address_city,
                    address_zip=data.address_zip,
                    legal_form=data.legal_form,
                )

    await create_organization_with_admin(
        session,
        name=payload.name.strip(),
        founder=user,
        seat_count=payload.seat_count,
        intended_plan_code=payload.intended_plan_code,
        **billing_kwargs,
    )
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


@router.get("/lookup-registry", response_model=RegistryLookupResult)
async def onboarding_lookup_registry(
    country: str = Query(min_length=2, max_length=2, description="ISO-ish country code"),
    number: str = Query(min_length=1, max_length=32, description="Registration number (e.g. IČO)"),
    user: User = Depends(get_current_user),
    registry: BusinessRegistryRegistry = Depends(get_business_registry),
    cache: TtlCache[RegistryLookupResult] = Depends(get_registry_cache),
    rate_limiter: RateLimiter = Depends(get_registry_rate_limiter),
) -> RegistryLookupResult:
    """ARES lookup callable during the create-org wizard.

    Mirrors `GET /companies/lookup-registry` but is mounted on the
    onboarding router so it bypasses `require_org_membership` — the user
    by definition has no org yet at this point. Shares the same cache +
    per-user rate limiter as the org-scoped endpoint to keep behavior
    identical once the user gets in.
    """
    if not await rate_limiter.try_acquire(user.id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many registry lookups — slow down a moment.",
        )

    key = (country.upper(), number)
    cached = await cache.get(key)
    if cached is not None:
        return cached

    try:
        service = registry.resolve(country)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    try:
        registry_data = await service.lookup(country, number)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except BusinessRegistryError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Business registry is unavailable, please try again in a minute.",
        ) from exc

    if registry_data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No company found in the {country.upper()} registry for {number}.",
        )

    result = RegistryLookupResult.model_validate(registry_data)
    await cache.set(key, result)
    return result
