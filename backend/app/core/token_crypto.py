"""Fernet encryption for secrets we must be able to read back.

Covers Google Calendar refresh/access tokens (standing access to a user's
calendar) and per-user SMTP passwords — unlike ComGate transaction ids these
must not sit in the DB as plaintext.

Key derivation (security-delta review R3 P3): the Fernet key is
`HMAC-SHA256(jwt_secret, "simplecrm/token-crypto/v1")`, i.e. domain-separated
from the JWT signing secret rather than a bare hash of it — the same pattern
`services/email_tracking` uses for link signatures, so no single derivation is
shared across two unrelated purposes. There is still no extra secret to
provision, and `cryptography` is already a transitive dependency via authlib.

Ciphertexts written before that change used `SHA-256(jwt_secret)` directly.
`MultiFernet` keeps them readable: it encrypts with the *first* key and tries
every key when decrypting, so old values keep working and are silently written
back under the new key the next time they're re-saved (a Google token refresh,
an SMTP password re-entry). No migration script, no flag day.

Rotating `jwt_secret` still invalidates everything stored — affected users
reconnect their calendar / re-enter their SMTP password, and both paths now
surface that as an actionable error rather than a 500.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from app.core.config import get_settings

_KEY_LABEL = b"simplecrm/token-crypto/v1"


class TokenDecryptError(Exception):
    """Stored ciphertext cannot be decrypted (tampered, or the
    `jwt_secret` changed since it was written)."""


def _fernet_key(digest: bytes) -> bytes:
    return base64.urlsafe_b64encode(digest)


@lru_cache
def _fernet() -> MultiFernet:
    secret = get_settings().jwt_secret.encode()
    current = Fernet(_fernet_key(hmac.new(secret, _KEY_LABEL, hashlib.sha256).digest()))
    # Read-only compatibility with values written before domain separation.
    legacy = Fernet(_fernet_key(hashlib.sha256(secret).digest()))
    return MultiFernet([current, legacy])


def encrypt_token(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except (InvalidToken, ValueError) as exc:
        raise TokenDecryptError("Stored token cannot be decrypted") from exc
