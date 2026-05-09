"""Password hashing and strength validation.

Pure helpers, DB-free. The password column is `String(255)` so we can swap
to argon2id in a future migration without changing the schema.
"""

from __future__ import annotations

from passlib.context import CryptContext

# `deprecated="auto"` will mark older schemes as needing a re-hash on next
# verify if we ever add more than one. For now we ship bcrypt only — passlib
# 1.7.x doesn't fully support bcrypt 5.x, and the dependency is pinned to
# `bcrypt<5` until that's fixed upstream.
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class WeakPasswordError(ValueError):
    """Raised by `validate_password_strength` when the input is too weak."""


def hash_password(plain: str) -> str:
    """Return a bcrypt hash of `plain` suitable for `users.password_hash`."""
    hashed: str = _pwd_context.hash(plain)
    return hashed


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time check that `plain` matches `hashed`. False on any error."""
    try:
        ok: bool = _pwd_context.verify(plain, hashed)
        return ok
    except ValueError:
        # Malformed hash on disk (corrupted / wrong scheme) — treat as wrong
        # password rather than 500ing on the user.
        return False


# Bcrypt truncates secrets at 72 bytes; UTF-8 makes that 18-72 chars depending
# on script. Cap inputs at 72 bytes to avoid surprising truncation. The 12-char
# minimum is the floor; users are free to go longer (and should).
PASSWORD_MIN_LENGTH = 12
PASSWORD_MAX_BYTES = 72


def validate_password_strength(plain: str) -> None:
    """Reject obviously-weak passwords. Raises `WeakPasswordError`.

    Rules: at least 12 chars, must contain at least one letter and one
    digit. Intentionally light — we trust users to pick something memorable
    and rely on email-based recovery rather than gating with character-class
    rules nobody can remember. The 72-byte cap is a bcrypt limit, not a
    policy.
    """
    if len(plain) < PASSWORD_MIN_LENGTH:
        raise WeakPasswordError(f"Password must be at least {PASSWORD_MIN_LENGTH} characters.")
    if len(plain.encode("utf-8")) > PASSWORD_MAX_BYTES:
        raise WeakPasswordError(f"Password must be at most {PASSWORD_MAX_BYTES} bytes.")
    if not any(c.isalpha() for c in plain):
        raise WeakPasswordError("Password must contain at least one letter.")
    if not any(c.isdigit() for c in plain):
        raise WeakPasswordError("Password must contain at least one digit.")


__all__ = [
    "PASSWORD_MAX_BYTES",
    "PASSWORD_MIN_LENGTH",
    "WeakPasswordError",
    "hash_password",
    "validate_password_strength",
    "verify_password",
]
