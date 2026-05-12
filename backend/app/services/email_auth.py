"""Email + password authentication business logic.

This module owns everything the Google flow doesn't:
  * signup (with the Google-link special case for an existing oauth-only user)
  * email verification (two-step: check vs. consume so the consume step can
    accept an optional password for the link-add-password path)
  * email/password login
  * password reset request + confirm

DB writes happen here; the route layer only handles HTTP shape and cookies.
That keeps `services/auth.py` focused on the Google profile -> User mapping
and lets us test these flows with an `AsyncSession` fixture, no FastAPI.
"""

from __future__ import annotations

import secrets
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.auth_tokens import (
    EMAIL_VERIFY_TTL_SECONDS,
    PASSWORD_RESET_TTL_SECONDS,
    RESEND_COOLDOWN_SECONDS,
    ActionTokenExpiredError,
    ActionTokenInvalidError,
    sign_action_token,
    verify_action_token,
)
from app.core.passwords import (
    WeakPasswordError,
    hash_password,
    validate_password_strength,
    verify_password,
)
from app.db.models import AuthActionToken, RefreshToken, User, UserRole
from app.services.email import (
    build_password_reset_email,
    build_verification_email,
    send_email,
)

PURPOSE_VERIFY_EMAIL = "verify_email"
PURPOSE_RESET_PASSWORD = "reset_password"  # noqa: S105 — DB enum value, not a credential

# Maps a signed action token into the absolute URL that goes into the email
# link. Provided by the route layer so this module stays free of FastAPI
# imports and URL construction concerns.
LinkBuilder = Callable[[str], str]


class EmailAuthError(Exception):
    """Parent for all expected business-logic errors in this module."""


class EmailAlreadyRegisteredError(EmailAuthError):
    """Signup hit an email that already has a password set."""


class InvalidCredentialsError(EmailAuthError):
    """Wrong email or password (kept generic on purpose)."""


class OAuthOnlyAccountError(EmailAuthError):
    """Login attempt against an account that has no password_hash."""


class TokenCooldownError(EmailAuthError):
    """A new token was requested within the cooldown window."""

    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__(f"Wait {retry_after_seconds}s before requesting again.")
        self.retry_after_seconds = retry_after_seconds


class ActionTokenError(EmailAuthError):
    """Verify/reset token is invalid, expired, or for the wrong purpose."""


class PasswordRequiredError(EmailAuthError):
    """Verify-consume hit an oauth-only user but the caller didn't supply a password."""


@dataclass(frozen=True)
class TokenCheckResult:
    """What `check_verification_token` tells the frontend so VerifyEmailPage
    can decide whether to prompt for a password before consuming the token."""

    email: str
    requires_password: bool


def _now() -> datetime:
    return datetime.now(tz=UTC)


def _normalize_email(email: str) -> str:
    return email.strip().lower()


async def _get_user_by_email(session: AsyncSession, email: str) -> User | None:
    stmt = select(User).where(User.email == _normalize_email(email))
    return (await session.execute(stmt)).scalar_one_or_none()


async def _get_user_by_id(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    stmt = select(User).where(User.id == user_id).options(joinedload(User.organization))
    return (await session.execute(stmt)).scalar_one_or_none()


async def _latest_token(
    session: AsyncSession, *, user_id: uuid.UUID, purpose: str
) -> AuthActionToken | None:
    stmt = (
        select(AuthActionToken)
        .where(AuthActionToken.user_id == user_id, AuthActionToken.purpose == purpose)
        .order_by(AuthActionToken.created_at.desc())
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def _enforce_cooldown(session: AsyncSession, *, user_id: uuid.UUID, purpose: str) -> None:
    """60-second debounce on resend-email actions.

    Raises `TokenCooldownError(retry_after_seconds=...)` if the most recent
    row of the given (user, purpose) was created less than `RESEND_COOLDOWN_SECONDS`
    ago. Cheap, no rate-limit infra; just one indexed query per request.
    """
    latest = await _latest_token(session, user_id=user_id, purpose=purpose)
    if latest is None:
        return
    elapsed = (_now() - latest.created_at).total_seconds()
    if elapsed < RESEND_COOLDOWN_SECONDS:
        raise TokenCooldownError(retry_after_seconds=int(RESEND_COOLDOWN_SECONDS - elapsed) + 1)


async def _issue_action_token(
    session: AsyncSession, *, user: User, purpose: str, ttl_seconds: int
) -> str:
    """Insert a fresh `AuthActionToken` row and return the signed link token.

    Deletes any prior rows for this (user, purpose) so only the newest link
    is honored. Caller is responsible for cooldown enforcement.
    """
    await session.execute(
        delete(AuthActionToken).where(
            AuthActionToken.user_id == user.id,
            AuthActionToken.purpose == purpose,
        )
    )
    jti = secrets.token_urlsafe(16)
    session.add(
        AuthActionToken(
            jti=jti,
            user_id=user.id,
            purpose=purpose,
            expires_at=_now() + timedelta(seconds=ttl_seconds),
        )
    )
    await session.flush()
    return sign_action_token(jti)


async def _resolve_action_token(
    session: AsyncSession, *, signed_token: str, expected_purpose: str, ttl_seconds: int
) -> tuple[AuthActionToken, User]:
    """Validate the signed token and return the matching DB row + user.

    Raises `ActionTokenError` for any signature, expiry, purpose-mismatch,
    or vanished-row condition. The TTL on the signature must match the TTL
    used at signing — pass `EMAIL_VERIFY_TTL_SECONDS` or
    `PASSWORD_RESET_TTL_SECONDS` from `core.auth_tokens`.
    """
    try:
        jti = verify_action_token(signed_token, max_age_seconds=ttl_seconds)
    except (ActionTokenInvalidError, ActionTokenExpiredError) as exc:
        raise ActionTokenError() from exc
    row = await session.get(AuthActionToken, jti)
    if row is None or row.purpose != expected_purpose:
        raise ActionTokenError()
    if row.expires_at <= _now():
        # Defense in depth: signature TTL should have caught this. Clean up.
        await session.delete(row)
        await session.commit()
        raise ActionTokenError()
    user = await _get_user_by_id(session, row.user_id)
    if user is None or not user.is_active:
        await session.delete(row)
        await session.commit()
        raise ActionTokenError()
    return row, user


# --------------------------------------------------------------------------- #
# Signup
# --------------------------------------------------------------------------- #


async def signup_email_user(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    name: str,
    link_builder: LinkBuilder,
) -> User | None:
    """Sign up a new user (or start the link-a-password flow for a Google user).

    `link_builder` is a callable `(signed_token: str) -> str` provided by the
    route layer; it builds the absolute URL that goes into the verification
    email. Keeping URL construction at the route layer means this service
    has zero dependency on `app/api/...`.

    Returns the freshly created `User` for a brand-new signup so the route
    can mint a session and log them in immediately — we no longer block on
    email verification, just nudge with an in-app banner. Returns `None` for
    the Google-only-linking case: the password isn't persisted until the
    verify link is clicked (defends against a stranger overwriting a pending
    password), so we have nothing to log in.

    Raises:
        WeakPasswordError: password fails strength rules.
        EmailAlreadyRegisteredError: email already has a password_hash.
        TokenCooldownError: another verification was issued <60 s ago.
    """
    validate_password_strength(password)

    normalized_email = _normalize_email(email)
    existing = await _get_user_by_email(session, normalized_email)

    if existing is not None and existing.password_hash is not None:
        # Already-registered email with a password — surface a clear 409 so
        # the frontend can route the user to /login or /forgot-password.
        raise EmailAlreadyRegisteredError()

    if existing is None:
        user = User(
            email=normalized_email,
            name=name,
            password_hash=hash_password(password),
            email_verified=False,
            role=UserRole.salesperson,
            organization_id=None,
        )
        session.add(user)
        await session.flush()
        is_new_user = True
    else:
        # Google-only user re-signing-up with a password. We do NOT persist
        # the password here — anyone who knew the email could otherwise
        # overwrite a pending password. The verify endpoint will accept the
        # password as a parameter and write it then, after proving inbox
        # ownership.
        user = existing
        is_new_user = False

    await _enforce_cooldown(session, user_id=user.id, purpose=PURPOSE_VERIFY_EMAIL)
    signed = await _issue_action_token(
        session, user=user, purpose=PURPOSE_VERIFY_EMAIL, ttl_seconds=EMAIL_VERIFY_TTL_SECONDS
    )
    await session.commit()

    await send_email(
        build_verification_email(
            recipient=user.email,
            name=user.name,
            link=link_builder(signed),
        )
    )

    if is_new_user:
        # Refresh so the route can build CurrentUser without a second round-
        # trip. A brand-new user has no organization yet — the frontend's
        # ProtectedRoute routes them to /onboarding/create-org.
        await session.refresh(user, attribute_names=["organization"])
        return user
    return None


async def resend_verification(
    session: AsyncSession, *, email: str, link_builder: LinkBuilder
) -> None:
    """Resend the verification email for an unverified user.

    Silent no-op when the email is unknown or already verified — the route
    surfaces a generic 202 either way so this can't be used to enumerate
    accounts.

    Raises:
        TokenCooldownError: another verification was issued <60 s ago.
    """
    user = await _get_user_by_email(session, email)
    if user is None or user.email_verified:
        return
    await _enforce_cooldown(session, user_id=user.id, purpose=PURPOSE_VERIFY_EMAIL)
    signed = await _issue_action_token(
        session, user=user, purpose=PURPOSE_VERIFY_EMAIL, ttl_seconds=EMAIL_VERIFY_TTL_SECONDS
    )
    await session.commit()
    await send_email(
        build_verification_email(
            recipient=user.email,
            name=user.name,
            link=link_builder(signed),
        )
    )


# --------------------------------------------------------------------------- #
# Verify email
# --------------------------------------------------------------------------- #


async def check_verification_token(session: AsyncSession, *, signed_token: str) -> TokenCheckResult:
    """Inspect a verification token without consuming it.

    Powers VerifyEmailPage's first call — the page uses `requires_password`
    to decide whether to prompt for a password before calling consume. This
    is also a soft pre-check that gives a nicer error than 'invalid token'
    when the user lands on a stale link.
    """
    _row, user = await _resolve_action_token(
        session,
        signed_token=signed_token,
        expected_purpose=PURPOSE_VERIFY_EMAIL,
        ttl_seconds=EMAIL_VERIFY_TTL_SECONDS,
    )
    return TokenCheckResult(
        email=user.email,
        requires_password=user.password_hash is None,
    )


async def consume_verification_token(
    session: AsyncSession, *, signed_token: str, password: str | None
) -> User:
    """Consume a verification token and return the now-verified user.

    Two paths:
      * `password is None` → user already had a password_hash from signup;
        we just flip email_verified.
      * `password is not None` → user was Google-only and just set their
        first password; we hash & store it, then flip email_verified.

    Raises:
        ActionTokenError: signature/expiry/purpose mismatch.
        PasswordRequiredError: oauth-only user but no password supplied
            (route layer maps this to 422 password_required).
        WeakPasswordError: password parameter fails strength rules.
    """
    row, user = await _resolve_action_token(
        session,
        signed_token=signed_token,
        expected_purpose=PURPOSE_VERIFY_EMAIL,
        ttl_seconds=EMAIL_VERIFY_TTL_SECONDS,
    )

    if user.password_hash is None:
        if password is None:
            raise PasswordRequiredError()
        validate_password_strength(password)
        user.password_hash = hash_password(password)

    user.email_verified = True
    user.email_verified_at = _now()
    user.last_login_at = _now()

    await session.delete(row)
    await session.flush()
    return user


# --------------------------------------------------------------------------- #
# Login
# --------------------------------------------------------------------------- #


async def authenticate_email_user(session: AsyncSession, *, email: str, password: str) -> User:
    """Validate an email/password pair and return the user.

    Email verification is *not* required to log in — unverified users are
    let through with an in-app banner. We will revisit human verification
    later; gating login on a working email pipeline blocks signup whenever
    SMTP misbehaves, which is the bug this change is undoing.

    Raises:
        InvalidCredentialsError: no user, or wrong password.
        OAuthOnlyAccountError: user exists but has no password_hash.
    """
    user = await _get_user_by_email(session, email)
    if user is None or not user.is_active:
        raise InvalidCredentialsError()
    if user.password_hash is None:
        raise OAuthOnlyAccountError()
    if not verify_password(password, user.password_hash):
        raise InvalidCredentialsError()
    user.last_login_at = _now()
    await session.flush()
    # Refresh organization so the route can build CurrentUser without a
    # second DB roundtrip.
    await session.refresh(user, attribute_names=["organization"])
    return user


# --------------------------------------------------------------------------- #
# Password reset
# --------------------------------------------------------------------------- #


async def issue_password_reset(
    session: AsyncSession, *, email: str, link_builder: LinkBuilder
) -> None:
    """Email a password-reset link to the user (if they exist + have a row).

    Silently does nothing when the email is unknown, the user is inactive,
    or the user is OAuth-only — for OAuth-only accounts a reset would need
    to also create a password row first, which is what `signup_email_user`
    handles via the link-add-password flow. Sending a reset email to an
    OAuth-only address would be confusing, so we steer users back through
    signup for that path.

    Raises:
        TokenCooldownError: another reset was issued <60 s ago.
    """
    user = await _get_user_by_email(session, email)
    if user is None or not user.is_active or user.password_hash is None:
        return
    await _enforce_cooldown(session, user_id=user.id, purpose=PURPOSE_RESET_PASSWORD)
    signed = await _issue_action_token(
        session, user=user, purpose=PURPOSE_RESET_PASSWORD, ttl_seconds=PASSWORD_RESET_TTL_SECONDS
    )
    await session.commit()
    await send_email(
        build_password_reset_email(
            recipient=user.email,
            name=user.name,
            link=link_builder(signed),
        )
    )


async def consume_password_reset(
    session: AsyncSession, *, signed_token: str, new_password: str
) -> User:
    """Consume a reset token, write the new password, and revoke all sessions.

    Revoking every existing `refresh_tokens` row for this user is the
    defense-in-depth half of the reset: even if the original session was
    stolen, it can't outlive the reset.

    Raises:
        ActionTokenError: signature/expiry/purpose mismatch.
        WeakPasswordError: new_password fails strength rules.
    """
    row, user = await _resolve_action_token(
        session,
        signed_token=signed_token,
        expected_purpose=PURPOSE_RESET_PASSWORD,
        ttl_seconds=PASSWORD_RESET_TTL_SECONDS,
    )
    validate_password_strength(new_password)

    user.password_hash = hash_password(new_password)
    # If somehow they got here without being verified yet, completing a
    # reset proves email ownership — flip the flag.
    if not user.email_verified:
        user.email_verified = True
        user.email_verified_at = _now()
    user.last_login_at = _now()

    await session.delete(row)
    await session.execute(delete(RefreshToken).where(RefreshToken.user_id == user.id))
    await session.flush()
    return user


__all__ = [
    "PURPOSE_RESET_PASSWORD",
    "PURPOSE_VERIFY_EMAIL",
    "ActionTokenError",
    "EmailAlreadyRegisteredError",
    "EmailAuthError",
    "InvalidCredentialsError",
    "OAuthOnlyAccountError",
    "PasswordRequiredError",
    "TokenCheckResult",
    "TokenCooldownError",
    "WeakPasswordError",
    "authenticate_email_user",
    "check_verification_token",
    "consume_password_reset",
    "consume_verification_token",
    "issue_password_reset",
    "resend_verification",
    "signup_email_user",
]
