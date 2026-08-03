"""Key-derivation contract for secrets stored at rest.

Security-delta review R3 P3: the Fernet key is now domain-separated from the
JWT signing secret (`HMAC(jwt_secret, label)`) instead of a bare
`SHA-256(jwt_secret)`. Ciphertexts written under the old derivation must keep
decrypting, or every stored Google token and SMTP password would break on
deploy.
"""

from __future__ import annotations

import base64
import hashlib

import pytest
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings
from app.core.token_crypto import (
    TokenDecryptError,
    _fernet,
    decrypt_token,
    encrypt_token,
)


def test_round_trip() -> None:
    assert decrypt_token(encrypt_token("hunter2")) == "hunter2"


def test_legacy_ciphertext_still_decrypts() -> None:
    """A value encrypted with the pre-review derivation must survive the
    upgrade — this is what makes the change deployable without a migration."""
    legacy_key = base64.urlsafe_b64encode(
        hashlib.sha256(get_settings().jwt_secret.encode()).digest()
    )
    legacy_ciphertext = Fernet(legacy_key).encrypt(b"old-refresh-token").decode()

    assert decrypt_token(legacy_ciphertext) == "old-refresh-token"


def test_new_ciphertext_is_not_readable_with_the_legacy_key() -> None:
    """Proves the derivations actually differ (a no-op change would pass the
    round-trip test above just as happily)."""
    legacy_key = base64.urlsafe_b64encode(
        hashlib.sha256(get_settings().jwt_secret.encode()).digest()
    )
    fresh = encrypt_token("new-secret")

    with pytest.raises(InvalidToken):
        Fernet(legacy_key).decrypt(fresh.encode())


def test_garbage_raises_token_decrypt_error() -> None:
    with pytest.raises(TokenDecryptError):
        decrypt_token("not-a-fernet-token")


def test_rotation_writes_under_the_current_key() -> None:
    """MultiFernet encrypts with the first key, so re-saving a legacy value
    quietly migrates it."""
    legacy_key = base64.urlsafe_b64encode(
        hashlib.sha256(get_settings().jwt_secret.encode()).digest()
    )
    legacy_ciphertext = Fernet(legacy_key).encrypt(b"rotate-me").decode()

    rewritten = encrypt_token(decrypt_token(legacy_ciphertext))

    assert decrypt_token(rewritten) == "rotate-me"
    with pytest.raises(InvalidToken):
        Fernet(legacy_key).decrypt(rewritten.encode())
    # And the module hands out a MultiFernet (current + legacy), not a bare one.
    assert hasattr(_fernet(), "rotate")
