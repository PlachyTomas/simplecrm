"""Authentication endpoints — Google OAuth sign-in + /auth/me + /auth/logout + /auth/refresh."""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.config import get_settings
from app.core.deps import require_active_trial_or_subscription
from app.core.passwords import (
    validate_password_strength,
)
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
from app.schemas.auth import (
    AuthSuccessResponse,
    CurrentUser,
    InviteAcceptRequest,
    LoginRequest,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    ResendVerificationRequest,
    SignupRequest,
    TokenCheckRequest,
    TokenCheckResponse,
    VerifyConsumeRequest,
)
from app.services.auth import (
    InvitationAlreadyConsumedError,
    InvitationEmailMismatchError,
    InvitationExpiredError,
    InvitationNotFoundError,
    UserAlreadyInOrganizationError,
    upsert_user_from_google_profile,
)
from app.services.email_auth import (
    ActionTokenError,
    EmailAlreadyRegisteredError,
    InvalidCredentialsError,
    OAuthOnlyAccountError,
    PasswordRequiredError,
    TokenCooldownError,
    WeakPasswordError,
    authenticate_email_user,
    check_verification_token,
    consume_password_reset,
    consume_verification_token,
    issue_password_reset,
    resend_verification,
    signup_email_user,
)
from app.services.google_oauth import GoogleOAuthClient, get_google_oauth_client
from app.services.invitations import (
    InvitationPasswordMismatchError,
    accept_invitation_for_email_signup,
)

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
    session.add(RefreshToken(jti=issued.jti, user_id=user_id, expires_at=issued.expires_at))
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
            await session.execute(delete(RefreshToken).where(RefreshToken.jti == payload["jti"]))
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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Wrong token type")
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


# --------------------------------------------------------------------------- #
# Email + password auth
#
# Lives next to the Google OAuth flow above. Reuses _set_refresh_cookie and
# _issue_and_record_refresh; verify/reset links are built off the same
# `frontend_success_redirect` origin used by the Google callback.
# --------------------------------------------------------------------------- #


def _verify_email_link(signed_token: str) -> str:
    settings = get_settings()
    return (
        f"{_frontend_origin(settings.frontend_success_redirect)}"
        f"{settings.frontend_verify_email_path}?token={signed_token}"
    )


def _reset_password_link(signed_token: str) -> str:
    settings = get_settings()
    return (
        f"{_frontend_origin(settings.frontend_success_redirect)}"
        f"{settings.frontend_reset_password_path}?token={signed_token}"
    )


def _cooldown_response(exc: TokenCooldownError) -> HTTPException:
    """Map a cooldown error to a 429 with a Retry-After header."""
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={"code": "cooldown", "retry_after_seconds": exc.retry_after_seconds},
        headers={"Retry-After": str(exc.retry_after_seconds)},
    )


async def _issue_session(
    session: AsyncSession, response: Response, user: User
) -> AuthSuccessResponse:
    """Mint access+refresh tokens for `user`, set the refresh cookie, commit.

    Shared tail of signup-verify, login, and password-reset-confirm so all
    three return the same shape and update the same allowlist.
    """
    access_token = create_access_token(user.id, user.organization_id, user.role)
    issued = await _issue_and_record_refresh(session, user.id)
    await session.commit()
    _set_refresh_cookie(response, issued.token)
    return AuthSuccessResponse(
        access_token=access_token,
        user=CurrentUser.model_validate(user),
    )


@router.post("/signup")
async def signup(
    body: SignupRequest,
    response: Response,
    session: AsyncSession = Depends(get_db),
) -> AuthSuccessResponse | dict[str, str]:
    """Start an email-signup flow.

    For a brand-new email this creates the User and immediately mints a
    session — verification is no longer a hard gate, it surfaces as an
    in-app banner the user can dismiss once they click the verification
    link. Returns the same `AuthSuccessResponse` shape as `/login` so the
    frontend can drop the user into the app right away.

    For an email that already belongs to a Google-only user, we still send
    a "verify to add a password" link without touching the row — the
    password is written when the link is consumed (so a stranger who knows
    your email can't overwrite a pending password). In that case the
    response stays a 202 with `detail`, and the frontend keeps showing the
    "check your email" panel.
    """
    try:
        user = await signup_email_user(
            session,
            email=body.email,
            password=body.password,
            name=body.name,
            link_builder=_verify_email_link,
        )
    except WeakPasswordError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "weak_password", "message": str(exc)},
        ) from exc
    except EmailAlreadyRegisteredError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "email_already_registered"},
        ) from exc
    except TokenCooldownError as exc:
        raise _cooldown_response(exc) from exc
    if user is None:
        # Google-only-linking path: no session is issued until the verify
        # link is consumed (consume writes the password).
        response.status_code = status.HTTP_202_ACCEPTED
        return {"detail": "Verification email sent."}
    return await _issue_session(session, response, user)


@router.post("/verify-email/check", response_model=TokenCheckResponse)
async def verify_email_check(
    body: TokenCheckRequest,
    session: AsyncSession = Depends(get_db),
) -> TokenCheckResponse:
    """Inspect a verification token without consuming it.

    Powers VerifyEmailPage's first call: the page uses `requires_password`
    to decide whether to prompt for a password before calling consume.
    """
    try:
        result = await check_verification_token(session, signed_token=body.token)
    except ActionTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "token_invalid"},
        ) from exc
    return TokenCheckResponse(email=result.email, requires_password=result.requires_password)


@router.post("/verify-email/consume", response_model=AuthSuccessResponse)
async def verify_email_consume(
    body: VerifyConsumeRequest,
    response: Response,
    session: AsyncSession = Depends(get_db),
) -> AuthSuccessResponse:
    """Consume a verification token, mark the user verified, auto-login.

    Same auto-login shape as the Google callback (access token in body,
    refresh cookie set), so the frontend can hand the user a logged-in app
    immediately after they click the link.
    """
    try:
        user = await consume_verification_token(
            session, signed_token=body.token, password=body.password
        )
    except ActionTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "token_invalid"},
        ) from exc
    except PasswordRequiredError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "password_required"},
        ) from exc
    except WeakPasswordError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "weak_password", "message": str(exc)},
        ) from exc
    return await _issue_session(session, response, user)


@router.post("/verify-email/resend", status_code=status.HTTP_202_ACCEPTED)
async def verify_email_resend(
    body: ResendVerificationRequest,
    session: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Resend the verification email if the user is unverified.

    Always returns 202 — we don't reveal whether the email is registered or
    already verified. A 429 cooldown is the one exception (carries a clear
    'wait N seconds' signal which the user already knows applies to them).
    """
    try:
        await resend_verification(session, email=body.email, link_builder=_verify_email_link)
    except TokenCooldownError as exc:
        raise _cooldown_response(exc) from exc
    return {"detail": "If your email is registered and not verified, we sent a new link."}


@router.post("/login", response_model=AuthSuccessResponse)
async def login(
    body: LoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_db),
) -> AuthSuccessResponse:
    """Log in with email + password. Issues access + refresh tokens.

    Returns 401 with `code=oauth_only_account` when the email belongs to a
    Google-only user; the frontend renders a "use Google to sign in" CTA.
    Unverified emails are *not* rejected — the user is logged in and the
    app shows a "verify your email" banner instead.
    """
    try:
        user = await authenticate_email_user(session, email=body.email, password=body.password)
    except InvalidCredentialsError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_credentials"},
        ) from exc
    except OAuthOnlyAccountError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "oauth_only_account"},
        ) from exc
    return await _issue_session(session, response, user)


@router.post("/password-reset/request", status_code=status.HTTP_202_ACCEPTED)
async def password_reset_request(
    body: PasswordResetRequest,
    session: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Email a password-reset link to the user (if they exist + have a password).

    Silent on missing / oauth-only emails; only the cooldown surfaces a
    distinct 429.
    """
    try:
        await issue_password_reset(session, email=body.email, link_builder=_reset_password_link)
    except TokenCooldownError as exc:
        raise _cooldown_response(exc) from exc
    return {"detail": "If your email is registered, we sent a reset link."}


@router.post("/password-reset/confirm", response_model=AuthSuccessResponse)
async def password_reset_confirm(
    body: PasswordResetConfirmRequest,
    response: Response,
    session: AsyncSession = Depends(get_db),
) -> AuthSuccessResponse:
    """Set a new password and auto-login. Revokes every existing refresh
    token for the user so a stolen pre-reset session can't outlive the
    reset."""
    try:
        user = await consume_password_reset(
            session, signed_token=body.token, new_password=body.new_password
        )
    except ActionTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "token_invalid"},
        ) from exc
    except WeakPasswordError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "weak_password", "message": str(exc)},
        ) from exc
    return await _issue_session(session, response, user)


@router.post("/invite/accept", response_model=AuthSuccessResponse)
async def invite_accept(
    body: InviteAcceptRequest,
    response: Response,
    session: AsyncSession = Depends(get_db),
) -> AuthSuccessResponse:
    """Accept an invitation by signing up with email + password.

    Mirrors the Google invite path on `/auth/google/callback` but for
    email-only invitees: the invite click is treated as proof of email
    ownership (the link was sent to that exact address), so we mark the
    user verified and auto-login without a separate verify-email step.

    Errors map to the same set the Google path emits, so the AcceptInvitePage
    can render one localized message for each:
      404 invitation_not_found
      410 invitation_expired
      409 invitation_consumed
      409 user_already_in_organization
      422 weak_password
    """
    try:
        validate_password_strength(body.password)
    except WeakPasswordError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "weak_password", "message": str(exc)},
        ) from exc
    try:
        user = await accept_invitation_for_email_signup(
            session, token=body.token, password=body.password, name=body.name
        )
    except InvitationNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "invitation_not_found"},
        ) from exc
    except InvitationExpiredError as exc:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={"code": "invitation_expired"},
        ) from exc
    except InvitationAlreadyConsumedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "invitation_consumed"},
        ) from exc
    except UserAlreadyInOrganizationError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "user_already_in_organization"},
        ) from exc
    except InvitationPasswordMismatchError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invitation_password_mismatch"},
        ) from exc
    return await _issue_session(session, response, user)
