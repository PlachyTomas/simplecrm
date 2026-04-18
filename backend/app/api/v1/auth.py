"""Authentication endpoints — Google OAuth sign-in + /auth/me + /auth/logout."""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    sign_oauth_state,
    verify_oauth_state,
)
from app.db import get_db
from app.db.models import User
from app.schemas.auth import CurrentUser
from app.services.auth import upsert_dev_user, upsert_user_from_google_profile
from app.services.google_oauth import GoogleOAuthClient, get_google_oauth_client

router = APIRouter(prefix="/auth", tags=["auth"])

STATE_COOKIE_NAME = "simplecrm_oauth_state"
REFRESH_COOKIE_NAME = "simplecrm_refresh"


def _cookie_is_secure() -> bool:
    """HTTPS-only in production; plain in dev so localhost can test."""
    return get_settings().app_env != "dev"


@router.get("/google/login")
async def google_login(
    oauth: GoogleOAuthClient = Depends(get_google_oauth_client),
) -> RedirectResponse:
    state_payload = {"nonce": secrets.token_urlsafe(16)}
    signed_state = sign_oauth_state(state_payload)
    authorize_url = oauth.build_authorize_url(signed_state)

    response = RedirectResponse(url=authorize_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    response.set_cookie(
        key=STATE_COOKIE_NAME,
        value=signed_state,
        max_age=600,
        httponly=True,
        secure=_cookie_is_secure(),
        samesite="lax",
        path="/api/v1/auth",
    )
    return response


@router.get("/google/callback")
async def google_callback(
    code: str = Query(..., min_length=1),
    state: str = Query(..., min_length=1),
    state_cookie: str | None = Cookie(default=None, alias=STATE_COOKIE_NAME),
    session: AsyncSession = Depends(get_db),
    oauth: GoogleOAuthClient = Depends(get_google_oauth_client),
) -> RedirectResponse:
    settings = get_settings()

    if state_cookie is None or not secrets.compare_digest(state, state_cookie):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OAuth state")
    if verify_oauth_state(state) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Expired OAuth state")

    try:
        profile = await oauth.exchange_code_for_profile(code)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google authorization failed",
        ) from exc

    user = await upsert_user_from_google_profile(session, profile)
    await session.commit()
    await session.refresh(user, attribute_names=["organization"])

    access_token = create_access_token(user.id, user.organization_id, user.role)
    refresh_token = create_refresh_token(user.id)

    redirect_url = f"{settings.frontend_success_redirect}#access_token={access_token}"
    response = RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=settings.refresh_token_ttl_days * 86400,
        httponly=True,
        secure=_cookie_is_secure(),
        samesite="lax",
        path="/api/v1/auth",
    )
    response.delete_cookie(STATE_COOKIE_NAME, path="/api/v1/auth")
    return response


@router.get("/me", response_model=CurrentUser)
async def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    response.delete_cookie(
        REFRESH_COOKIE_NAME,
        path="/api/v1/auth",
        httponly=True,
        secure=_cookie_is_secure(),
        samesite="lax",
    )


class DevLoginRequest(BaseModel):
    email: EmailStr = Field(default="admin@example.com")
    name: str | None = None


class DevLoginResponse(BaseModel):
    access_token: str
    user: CurrentUser


def _require_dev_auth() -> None:
    settings = get_settings()
    if not (settings.dev_auth_enabled and settings.app_env == "dev"):
        # 404 (not 403) so prod deploys don't even advertise that this
        # endpoint exists.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


@router.post("/dev-login", response_model=DevLoginResponse)
async def dev_login(
    payload: DevLoginRequest,
    session: AsyncSession = Depends(get_db),
) -> DevLoginResponse:
    """Dev-only: mint a JWT for an arbitrary email, no OAuth round-trip.

    Guarded by both `dev_auth_enabled=True` and `app_env=="dev"`. First
    call for an email provisions an Organization + admin User with the
    default pipeline; subsequent calls are idempotent.
    """
    _require_dev_auth()
    user = await upsert_dev_user(session, email=payload.email, name=payload.name)
    await session.commit()
    await session.refresh(user, attribute_names=["organization"])
    access_token = create_access_token(user.id, user.organization_id, user.role)
    return DevLoginResponse(
        access_token=access_token,
        user=CurrentUser.model_validate(user),
    )
