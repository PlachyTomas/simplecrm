"""Authentication endpoints — Google OAuth sign-in + /auth/me + /auth/logout + /auth/refresh."""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.config import get_settings
from app.core.deps import require_active_trial_or_subscription
from app.core.security import (
    REFRESH_TOKEN_TYPE,
    IssuedRefreshToken,
    JWTError,
    create_access_token,
    create_refresh_token,
    decode_token,
    sign_oauth_state,
    verify_oauth_state,
)
from app.db import get_db
from app.db.models import RefreshToken, User
from app.schemas.auth import CurrentUser
from app.services.auth import (
    InvitationAlreadyConsumedError,
    InvitationEmailMismatchError,
    InvitationExpiredError,
    InvitationNotFoundError,
    UserAlreadyInOrganizationError,
    upsert_dev_user,
    upsert_user_from_google_profile,
)
from app.services.google_oauth import GoogleOAuthClient, get_google_oauth_client

router = APIRouter(prefix="/auth", tags=["auth"])

STATE_COOKIE_NAME = "simplecrm_oauth_state"
REFRESH_COOKIE_NAME = "simplecrm_refresh"


def _cookie_is_secure() -> bool:
    """HTTPS-only in production; plain in dev so localhost can test."""
    return get_settings().app_env != "dev"


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    """Single source of truth for refresh-cookie attributes."""
    settings = get_settings()
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=settings.refresh_token_ttl_days * 86400,
        httponly=True,
        secure=_cookie_is_secure(),
        samesite="lax",
        path="/api/v1/auth",
    )


async def _issue_and_record_refresh(
    session: AsyncSession, user_id: uuid.UUID
) -> IssuedRefreshToken:
    """Mint a refresh JWT and record its `jti` in the active-allowlist.

    QA-024 Part B: a refresh JWT is only honored when its `jti` is present
    in `refresh_tokens`. Issue inserts a row; rotation deletes the old row
    and inserts the new one; logout deletes the row outright. A leaked
    refresh JWT becomes useless at the moment the legitimate user refreshes.
    """
    issued = create_refresh_token(user_id)
    session.add(
        RefreshToken(jti=issued.jti, user_id=user_id, expires_at=issued.expires_at)
    )
    return issued


@router.get("/google/login")
async def google_login(
    invite: str | None = Query(default=None, max_length=2048),
    oauth: GoogleOAuthClient = Depends(get_google_oauth_client),
) -> RedirectResponse:
    """Kick off Google OAuth. An optional `invite` query carries a signed
    invitation token — we tunnel it through the OAuth `state` so it
    survives the round-trip back to `/google/callback`. Tokens are
    transparent to Google; they're only meaningful to us."""
    state_payload: dict[str, str] = {"nonce": secrets.token_urlsafe(16)}
    if invite is not None:
        state_payload["invite"] = invite
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
    state_payload = verify_oauth_state(state)
    if state_payload is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Expired OAuth state")

    try:
        profile = await oauth.exchange_code_for_profile(code)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google authorization failed",
        ) from exc

    invite_token = state_payload.get("invite") if isinstance(state_payload, dict) else None
    error_code: str | None = None
    try:
        user = await upsert_user_from_google_profile(
            session, profile, invite_token=invite_token if isinstance(invite_token, str) else None
        )
    except InvitationEmailMismatchError:
        error_code = "invitation_email_mismatch"
    except InvitationExpiredError:
        error_code = "invitation_expired"
    except InvitationAlreadyConsumedError:
        error_code = "invitation_consumed"
    except InvitationNotFoundError:
        error_code = "invitation_not_found"
    except UserAlreadyInOrganizationError:
        error_code = "user_already_in_organization"

    if error_code is not None:
        # Bounce back to the AcceptInvitePage so the user sees a localized
        # message — no token issued, no cookies set.
        await session.rollback()
        bounce_origin = _frontend_origin(settings.frontend_success_redirect)
        invite_for_url = invite_token if isinstance(invite_token, str) else ""
        redirect_url = (
            f"{bounce_origin}/invite/{invite_for_url}?error={error_code}"
            if invite_for_url
            else f"{bounce_origin}/login?error={error_code}"
        )
        response = RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)
        response.delete_cookie(STATE_COOKIE_NAME, path="/api/v1/auth")
        return response

    await session.commit()
    await session.refresh(user, attribute_names=["organization"])

    access_token = create_access_token(user.id, user.organization_id, user.role)
    issued = await _issue_and_record_refresh(session, user.id)
    await session.commit()

    redirect_url = f"{settings.frontend_success_redirect}#access_token={access_token}"
    response = RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)
    _set_refresh_cookie(response, issued.token)
    response.delete_cookie(STATE_COOKIE_NAME, path="/api/v1/auth")
    return response


def _frontend_origin(success_redirect: str) -> str:
    """Strip path off the configured frontend redirect so we can build
    sibling URLs (/login, /invite/...). Falls back to the original value
    if it isn't an absolute URL (test mode, custom configs)."""
    if success_redirect.startswith(("http://", "https://")):
        parts = success_redirect.split("/", 3)
        return "/".join(parts[:3])
    return success_redirect


@router.get("/me", response_model=CurrentUser)
async def me(user: User = Depends(require_active_trial_or_subscription)) -> User:
    """Returns the current user. Gated by trial status — when the org's trial
    has ended and no subscription is active, this 402s so the frontend's
    `ProtectedRoute` can render `<TrialExpiredGate />`."""
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    refresh_cookie: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
    session: AsyncSession = Depends(get_db),
) -> None:
    """Clear the refresh cookie + revoke the server-side allowlist row.

    Best-effort revoke: if the cookie's JWT is decodable and carries a `jti`,
    we delete the matching row so the rotated-out token can't be replayed
    even with a stolen pre-logout copy. A bad/missing cookie still 204s —
    logout is idempotent from the client's perspective.
    """
    if refresh_cookie:
        try:
            payload = decode_token(refresh_cookie)
        except JWTError:
            payload = None
        if (
            payload
            and payload.get("type") == REFRESH_TOKEN_TYPE
            and isinstance(payload.get("jti"), str)
        ):
            await session.execute(
                delete(RefreshToken).where(RefreshToken.jti == payload["jti"])
            )
            await session.commit()

    response.delete_cookie(
        REFRESH_COOKIE_NAME,
        path="/api/v1/auth",
        httponly=True,
        secure=_cookie_is_secure(),
        samesite="lax",
    )


class RefreshResponse(BaseModel):
    access_token: str
    user: CurrentUser


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(
    response: Response,
    refresh_cookie: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
    session: AsyncSession = Depends(get_db),
) -> RefreshResponse:
    """Exchange the httponly refresh cookie for a fresh access token + rotated refresh.

    401 when the cookie is missing, expired, malformed, the user no longer
    exists / is inactive, or the `jti` is not in the active allowlist (QA-024
    Part B — covers the leaked-then-rotated case). Frontend treats any 401
    here as "not logged in" and routes to /login. The trial gate is **not**
    applied here on purpose — refreshing the session must work even with an
    expired trial so the `<TrialExpiredGate />` can render after `/auth/me`
    402s.

    Rotation: on success, the incoming `jti` is deleted and a new row is
    inserted, so the old refresh JWT is server-side invalid even though it
    remains cryptographically valid until its `exp`.
    """
    if not refresh_cookie:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")
    try:
        payload = decode_token(refresh_cookie)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        ) from exc
    if payload.get("type") != REFRESH_TOKEN_TYPE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Wrong token type"
        )
    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed refresh token"
        ) from exc
    jti = payload.get("jti")
    if not isinstance(jti, str):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed refresh token"
        )

    record = await session.get(RefreshToken, jti)
    if record is None or record.user_id != user_id:
        # Either never issued, already rotated, already logged out, or stolen
        # and bound to a different user. All collapse to the same response.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token revoked"
        )
    if record.expires_at <= datetime.now(tz=UTC):
        # JWT `exp` would have caught this above — defense in depth, and
        # opportunistic cleanup of an expired row.
        await session.delete(record)
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired"
        )

    user = await session.get(User, user_id, options=[joinedload(User.organization)])
    if user is None or not user.is_active:
        # Revoke the orphan row so a re-activation of the user later can't
        # silently inherit a stale refresh.
        await session.delete(record)
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive"
        )

    # Rotate: delete the consumed jti, issue a new one (in the same txn).
    await session.delete(record)
    access_token = create_access_token(user.id, user.organization_id, user.role)
    issued = await _issue_and_record_refresh(session, user.id)
    await session.commit()

    _set_refresh_cookie(response, issued.token)
    return RefreshResponse(
        access_token=access_token,
        user=CurrentUser.model_validate(user),
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
    response: Response,
    session: AsyncSession = Depends(get_db),
) -> DevLoginResponse:
    """Dev-only: mint a JWT for an arbitrary email, no OAuth round-trip.

    Guarded by both `dev_auth_enabled=True` and `app_env=="dev"`. First
    call for an email provisions an Organization + admin User with the
    default pipeline; subsequent calls are idempotent. Also sets the
    refresh cookie so the dev workflow benefits from /auth/refresh on
    cold-load — exactly the same shape as the real OAuth callback.
    """
    _require_dev_auth()
    user = await upsert_dev_user(session, email=payload.email, name=payload.name)
    await session.commit()
    await session.refresh(user, attribute_names=["organization"])
    access_token = create_access_token(user.id, user.organization_id, user.role)
    issued = await _issue_and_record_refresh(session, user.id)
    await session.commit()
    _set_refresh_cookie(response, issued.token)
    return DevLoginResponse(
        access_token=access_token,
        user=CurrentUser.model_validate(user),
    )
