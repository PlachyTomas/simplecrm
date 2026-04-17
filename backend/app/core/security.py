"""JWT and state-cookie utilities.

`create_access_token` / `create_refresh_token` issue signed JWTs. The OAuth
state-cookie round-trip uses `itsdangerous.URLSafeTimedSerializer` so state
payloads cannot be forged and cannot outlive their short TTL.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from jose import JWTError, jwt

from app.core.config import get_settings
from app.db.models.enums import UserRole

ACCESS_TOKEN_TYPE = "access"  # noqa: S105 — JWT type claim, not a credential
REFRESH_TOKEN_TYPE = "refresh"  # noqa: S105 — JWT type claim, not a credential
STATE_COOKIE_SALT = "simplecrm.oauth.state"


def _now() -> datetime:
    return datetime.now(tz=UTC)


def create_access_token(user_id: uuid.UUID, organization_id: uuid.UUID, role: UserRole) -> str:
    settings = get_settings()
    expire = _now() + timedelta(minutes=settings.access_token_ttl_minutes)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "org": str(organization_id),
        "role": role.value,
        "type": ACCESS_TOKEN_TYPE,
        "exp": expire,
        "iat": _now(),
    }
    encoded: str = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return encoded


def create_refresh_token(user_id: uuid.UUID) -> str:
    settings = get_settings()
    expire = _now() + timedelta(days=settings.refresh_token_ttl_days)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "type": REFRESH_TOKEN_TYPE,
        "exp": expire,
        "iat": _now(),
        "jti": secrets.token_urlsafe(16),
    }
    encoded: str = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return encoded


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


__all__ = [
    "ACCESS_TOKEN_TYPE",
    "REFRESH_TOKEN_TYPE",
    "JWTError",
    "create_access_token",
    "create_refresh_token",
    "decode_token",
    "sign_oauth_state",
    "verify_oauth_state",
]
