"""Backend i18n constants, locale helpers, and the ``t()`` catalog helper.

This module is the single source of truth for the supported languages, the
``locale → language`` mapping used to pick per-user and per-organization
email/invoice languages, and the ``t()`` translation lookup used by email
templates and the invoice renderer.
"""

from __future__ import annotations

import functools
import json
from pathlib import Path
from typing import Any

from babel.core import Locale

SUPPORTED_LANGUAGES: tuple[str, ...] = ("cs", "en")
DEFAULT_LANGUAGE = "cs"

# app/core/i18n.py -> app/core -> app -> app/locales
_LOCALES_ROOT = Path(__file__).resolve().parent.parent / "locales"


def language_for_locale(locale: str | None) -> str:
    """'cs-CZ' -> 'cs'; unknown/missing -> DEFAULT_LANGUAGE."""
    if not locale:
        return DEFAULT_LANGUAGE
    base = locale.split("-")[0].split("_")[0].lower()
    return base if base in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE


@functools.lru_cache
def _load_catalog(lang: str, ns: str) -> dict[str, Any]:
    """Load+parse ``app/locales/<lang>/<ns>.json``; {} if it doesn't exist."""
    path = _LOCALES_ROOT / lang / f"{ns}.json"
    try:
        with path.open(encoding="utf-8") as f:
            data: dict[str, Any] = json.load(f)
            return data
    except FileNotFoundError:
        return {}


def _lookup(lang: str, ns: str, path: str) -> Any:
    """Dot-path lookup into the (lang, ns) catalog; None if not found."""
    node: Any = _load_catalog(lang, ns)
    for part in path.split("."):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node


def t(lang: str, key: str, /, **params: Any) -> str:
    """Translate ``key`` (``"<ns>.<dot.path>"``) into ``lang``.

    Falls back to ``DEFAULT_LANGUAGE`` (cs) when the key is missing in
    ``lang``, then to the key itself when missing everywhere. When
    ``count`` is passed, the resolved node is expected to be a mapping of
    CLDR plural-form suffixes (``_one``/``_few``/``_other``, ...) and the
    form is picked via ``babel.core.Locale(lang).plural_form(count)``.
    Interpolation is done via ``str.format(**params)``.
    """
    ns, _, path = key.partition(".")
    if not path:
        return key

    count = params.get("count")

    def resolve(resolve_lang: str) -> str | None:
        if count is not None:
            plural_form = Locale(resolve_lang).plural_form(count)
            value = _lookup(resolve_lang, ns, f"{path}_{plural_form}")
            if value is None:
                # CLDR "other" is the universal fallback form.
                value = _lookup(resolve_lang, ns, f"{path}_other")
            if isinstance(value, str):
                return value
            return None
        value = _lookup(resolve_lang, ns, path)
        return value if isinstance(value, str) else None

    template = resolve(lang)
    if template is None and lang != DEFAULT_LANGUAGE:
        template = resolve(DEFAULT_LANGUAGE)
    if template is None:
        return key

    return template.format(**params)
