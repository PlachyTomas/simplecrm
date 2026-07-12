"""Backend i18n constants + locale helpers.

The translation function ``t()`` and its catalog loader arrive in a later
task; for now this module is the single source of truth for the supported
languages and the ``locale → language`` mapping used to pick per-user and
per-organization email/invoice languages.
"""

from __future__ import annotations

SUPPORTED_LANGUAGES: tuple[str, ...] = ("cs", "en")
DEFAULT_LANGUAGE = "cs"


def language_for_locale(locale: str | None) -> str:
    """'cs-CZ' -> 'cs'; unknown/missing -> DEFAULT_LANGUAGE."""
    if not locale:
        return DEFAULT_LANGUAGE
    base = locale.split("-")[0].split("_")[0].lower()
    return base if base in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE
