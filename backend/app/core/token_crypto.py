"""Fernet encryption for third-party OAuth tokens at rest.

Google Calendar refresh tokens grant standing access to a user's calendar,
so unlike ComGate transaction ids they must not sit in the DB as plaintext.
The Fernet key is derived from `jwt_secret` (SHA-256 → urlsafe base64) —
no extra secret to provision, and `cryptography` is already a transitive
dependency via authlib. Rotating `jwt_secret` invalidates stored
tokens; affected users simply reconnect their calendar.
"""

from __future__ import annotations

import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings


class TokenDecryptError(Exception):
    """Stored ciphertext cannot be decrypted (tampered, or the
    `jwt_secret` changed since it was written)."""


@lru_cache
def _fernet() -> Fernet:
    digest = hashlib.sha256(get_settings().jwt_secret.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_token(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise TokenDecryptError("Stored token cannot be decrypted") from exc
