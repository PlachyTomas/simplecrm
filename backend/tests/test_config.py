"""Settings validation — the prod JWT-secret fail-fast (review R1/R8 P2)."""

from __future__ import annotations

import pytest

from app.core.config import _DEFAULT_JWT_SECRET, Settings


def test_dev_allows_default_secret() -> None:
    s = Settings(app_env="dev", jwt_secret=_DEFAULT_JWT_SECRET)
    assert s.jwt_secret == _DEFAULT_JWT_SECRET


def test_prod_rejects_default_secret() -> None:
    with pytest.raises(ValueError, match="JWT_SECRET"):
        Settings(app_env="production", jwt_secret=_DEFAULT_JWT_SECRET)


def test_prod_rejects_empty_secret() -> None:
    with pytest.raises(ValueError, match="JWT_SECRET"):
        Settings(app_env="production", jwt_secret="")


def test_prod_accepts_strong_secret() -> None:
    s = Settings(app_env="production", jwt_secret="a-strong-random-production-secret-1234567890")
    assert s.app_env == "production"
