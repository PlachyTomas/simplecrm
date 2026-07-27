"""Diacritics- and punctuation-insensitive text folding.

Used in three places that all need "is this the same label?" semantics
without agreeing on spelling:

* provider header alias tables (``Organization - Name*`` ≡ ``organizace nazev``),
* the stage-mapping lookup (the caller's map keys come from a CSV cell,
  the user's selection comes from a form),
* fuzzy stage-name suggestions.

Deliberately aggressive: everything that is not ``[0-9a-z]`` collapses to a
single space, so ``Deal - Title``, ``Deal – Title`` and ``Deal Title`` all
fold to ``deal title``. That is what makes the ``Entity - Field`` convention
free to handle.
"""

from __future__ import annotations

import re
import unicodedata

_NON_ALNUM = re.compile(r"[^0-9a-z]+")


def strip_diacritics(value: str) -> str:
    """``Název`` → ``Nazev``. NFKD decomposition minus the combining marks."""
    decomposed = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def normalize_text(value: str) -> str:
    """Case-, diacritics- and punctuation-insensitive canonical form."""
    folded = strip_diacritics(value).lower()
    return _NON_ALNUM.sub(" ", folded).strip()


def normalize_header(header: str) -> str:
    """:func:`normalize_text` plus the export-format quirks.

    Pipedrive marks required columns with a trailing ``*`` (``Organization -
    Name*``); Excel round-trips add stray whitespace. Both are noise for
    alias matching.
    """
    return normalize_text(header.strip().rstrip("*").strip())


def note_label(header: str) -> str:
    """Human-readable label for a ``note_append`` line.

    Keeps the original spelling (the point is that the admin recognises the
    source column) minus the required-marker asterisk.
    """
    return header.strip().rstrip("*").strip()
