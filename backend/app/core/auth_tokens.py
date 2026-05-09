"""Signed tokens for email-auth side trips (verify_email, reset_password).

Mirrors the invite-token pattern in `security.py`: payload is just the
`jti`, signed with `itsdangerous.URLSafeTimedSerializer` so a leaked token
can't be forged and stops working when its TTL elapses. The DB row in
`auth_action_tokens` is the authoritative source — the signed timestamp
just short-circuits a stale link before we hit the DB.
"""

from __future__ import annotations

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.core.config import get_settings

ACTION_TOKEN_SALT = "simplecrm.auth.action"  # noqa: S105 — itsdangerous salt, not a credential

EMAIL_VERIFY_TTL_SECONDS = 24 * 60 * 60  # 24 hours
PASSWORD_RESET_TTL_SECONDS = 60 * 60  # 1 hour
RESEND_COOLDOWN_SECONDS = 60


class ActionTokenInvalidError(Exception):
    """Bad signature or tampering."""


class ActionTokenExpiredError(Exception):
    """Signed timestamp is older than the TTL."""


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_settings().jwt_secret, salt=ACTION_TOKEN_SALT)


def sign_action_token(jti: str) -> str:
    """Sign a URL-safe token whose payload is the action-token `jti`."""
    return _serializer().dumps({"jti": jti})


def verify_action_token(token: str, max_age_seconds: int) -> str:
    """Decode an action token and return its `jti`.

    Raises `ActionTokenExpiredError` if the signed timestamp is older than
    `max_age_seconds`, and `ActionTokenInvalidError` for any other signature
    failure or payload corruption.
    """
    try:
        payload = _serializer().loads(token, max_age=max_age_seconds)
    except SignatureExpired as exc:
        raise ActionTokenExpiredError() from exc
    except BadSignature as exc:
        raise ActionTokenInvalidError() from exc
    if not isinstance(payload, dict) or "jti" not in payload:
        raise ActionTokenInvalidError()
    jti = payload["jti"]
    if not isinstance(jti, str) or not jti:
        raise ActionTokenInvalidError()
    return jti


__all__ = [
    "EMAIL_VERIFY_TTL_SECONDS",
    "PASSWORD_RESET_TTL_SECONDS",
    "RESEND_COOLDOWN_SECONDS",
    "ActionTokenExpiredError",
    "ActionTokenInvalidError",
    "sign_action_token",
    "verify_action_token",
]
