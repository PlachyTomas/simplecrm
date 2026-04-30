"""JWT and state-cookie utilities.

`create_access_token` / `create_refresh_token` issue signed JWTs. The OAuth
state-cookie round-trip uses `itsdangerous.URLSafeTimedSerializer` so state
payloads cannot be forged and cannot outlive their short TTL.
"""

from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from jose import JWTError, jwt

from app.core.config import get_settings
from app.db.models.enums import UserRole

ACCESS_TOKEN_TYPE = "access"  # noqa: S105 — JWT type claim, not a credential
REFRESH_TOKEN_TYPE = "refresh"  # noqa: S105 — JWT type claim, not a credential
STATE_COOKIE_SALT = "simplecrm.oauth.state"
INVITE_TOKEN_SALT = "simplecrm.invitation"  # noqa: S105 — itsdangerous salt
INVITE_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60  # 7 days


def _now() -> datetime:
    return datetime.now(tz=UTC)


def create_access_token(
    user_id: uuid.UUID, organization_id: uuid.UUID | None, role: UserRole
) -> str:
    """Mint a JWT access token. `organization_id` is None for users that
    just signed in but haven't completed org setup yet — the claim is
    cosmetic (auth uses `sub`/the DB row); the frontend routes them to
    the create-org page based on `/auth/me`."""
    settings = get_settings()
    expire = _now() + timedelta(minutes=settings.access_token_ttl_minutes)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "org": str(organization_id) if organization_id is not None else None,
        "role": role.value,
        "type": ACCESS_TOKEN_TYPE,
        "exp": expire,
        "iat": _now(),
    }
    encoded: str = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return encoded


@dataclass(frozen=True)
class IssuedRefreshToken:
    """The encoded JWT plus the structured fields the auth router needs to
    record an active-jti row in `refresh_tokens` (QA-024 Part B).

    The router stays the only caller that touches the DB; this module
    remains DB-free so it's still safe to use from tests and helpers."""

    token: str
    jti: str
    expires_at: datetime


def create_refresh_token(user_id: uuid.UUID) -> IssuedRefreshToken:
    settings = get_settings()
    expire = _now() + timedelta(days=settings.refresh_token_ttl_days)
    jti = secrets.token_urlsafe(16)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "type": REFRESH_TOKEN_TYPE,
        "exp": expire,
        "iat": _now(),
        "jti": jti,
    }
    encoded: str = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return IssuedRefreshToken(token=encoded, jti=jti, expires_at=expire)


def decode_token(token: str) -> dict[str, Any]:
    """Decode and verify a JWT. Raises `JWTError` on anything wrong."""
    settings = get_settings()
    payload: dict[str, Any] = jwt.decode(
        token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
    )
    return payload


def _state_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_settings().jwt_secret, salt=STATE_COOKIE_SALT)


def sign_oauth_state(payload: dict[str, Any]) -> str:
    return _state_serializer().dumps(payload)


def verify_oauth_state(token: str, max_age_seconds: int = 600) -> dict[str, Any] | None:
    try:
        result = _state_serializer().loads(token, max_age=max_age_seconds)
    except (BadSignature, SignatureExpired):
        return None
    return result if isinstance(result, dict) else None


def _invite_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_settings().jwt_secret, salt=INVITE_TOKEN_SALT)


class InviteTokenInvalidError(Exception):
    """Raised when an invite token's signature is bad or it's been tampered with."""


class InviteTokenExpiredError(Exception):
    """Raised when an invite token's signed timestamp is older than the TTL."""


def sign_invite_token(jti: uuid.UUID) -> str:
    """Sign a self-contained URL-safe token carrying the invite's `jti`.

    The token's lifetime is enforced both client-side (itsdangerous max_age
    on verify) and server-side (`Invitation.expires_at` row-level check).
    The DB column is the authoritative source — the signed timestamp just
    short-circuits a blatantly stale link before we hit the DB.
    """
    return _invite_serializer().dumps({"jti": str(jti)})


def verify_invite_token(token: str) -> uuid.UUID:
    """Verify an invite token and return its `jti`. Raises on signature or
    expiry failure so the caller can map each to a distinct HTTP status."""
    try:
        payload = _invite_serializer().loads(token, max_age=INVITE_TOKEN_TTL_SECONDS)
    except SignatureExpired as exc:
        raise InviteTokenExpiredError() from exc
    except BadSignature as exc:
        raise InviteTokenInvalidError() from exc
    if not isinstance(payload, dict) or "jti" not in payload:
        raise InviteTokenInvalidError()
    try:
        return uuid.UUID(str(payload["jti"]))
    except ValueError as exc:
        raise InviteTokenInvalidError() from exc


__all__ = [
    "ACCESS_TOKEN_TYPE",
    "INVITE_TOKEN_TTL_SECONDS",
    "REFRESH_TOKEN_TYPE",
    "InviteTokenExpiredError",
    "InviteTokenInvalidError",
    "IssuedRefreshToken",
    "JWTError",
    "create_access_token",
    "create_refresh_token",
    "decode_token",
    "sign_invite_token",
    "sign_oauth_state",
    "verify_invite_token",
    "verify_oauth_state",
]
