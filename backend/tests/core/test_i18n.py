"""Tests for the backend translation helper ``t()`` (app/core/i18n.py)."""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

import pytest

from app.core import i18n


@pytest.fixture(autouse=True)
def _tmp_locales_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    """Point the catalog loader at a throwaway locales dir.

    Seeds cs/en ``emails.json`` with test-only keys so we never pollute the
    real catalogs, and clears the lru_cache both before and after so other
    tests (and other test modules importing the real catalogs) aren't
    affected by the monkeypatched root.
    """
    locales_root = tmp_path / "locales"

    cs_dir = locales_root / "cs"
    en_dir = locales_root / "en"
    cs_dir.mkdir(parents=True)
    en_dir.mkdir(parents=True)

    cs_emails = {
        "test": {
            "greeting": "Ahoj {name}",
            "days_one": "{count} den",
            "days_few": "{count} dny",
            "days_other": "{count} dnů",
            "csOnly": "Pouze česky",
        }
    }
    en_emails = {
        "test": {
            "greeting": "Hello {name}",
            "days_one": "{count} day",
            "days_other": "{count} days",
        }
    }

    (cs_dir / "emails.json").write_text(json.dumps(cs_emails), encoding="utf-8")
    (en_dir / "emails.json").write_text(json.dumps(en_emails), encoding="utf-8")

    monkeypatch.setattr(i18n, "_LOCALES_ROOT", locales_root)
    i18n._load_catalog.cache_clear()
    yield locales_root
    i18n._load_catalog.cache_clear()


def test_simple_interpolation() -> None:
    assert i18n.t("cs", "emails.test.greeting", name="Tomáši") == "Ahoj Tomáši"


def test_english_interpolation() -> None:
    assert i18n.t("en", "emails.test.greeting", name="Tom") == "Hello Tom"


def test_czech_plural_few() -> None:
    assert i18n.t("cs", "emails.test.days", count=3) == "3 dny"


def test_czech_plural_one() -> None:
    assert i18n.t("cs", "emails.test.days", count=1) == "1 den"


def test_czech_plural_other() -> None:
    assert i18n.t("cs", "emails.test.days", count=5) == "5 dnů"


def test_english_plural_other() -> None:
    assert i18n.t("en", "emails.test.days", count=3) == "3 days"


def test_english_plural_one() -> None:
    assert i18n.t("en", "emails.test.days", count=1) == "1 day"


def test_missing_key_in_target_language_falls_back_to_cs() -> None:
    # csOnly exists in cs but not en.
    assert i18n.t("en", "emails.test.csOnly") == "Pouze česky"


def test_unknown_key_returns_the_key_itself() -> None:
    assert i18n.t("cs", "emails.test.doesNotExist") == "emails.test.doesNotExist"
    assert i18n.t("en", "emails.nope.nothing") == "emails.nope.nothing"


def test_unknown_namespace_returns_the_key_itself() -> None:
    assert i18n.t("cs", "nosuchns.foo.bar") == "nosuchns.foo.bar"
