"""Search predicates for the app's substring-match search boxes.

Every user-facing search box compares what was typed against a text column with
a `%term%` ILIKE. Two things have to be normalized away for that to feel right:

- **case** — Postgres' ILIKE already handles it.
- **diacritics** — typing "brana" has to find "Brána", and typing "Brána" has to
  find "Brana". `unaccent()` on *both* sides makes the match symmetric. The
  extension is installed by migration `d5e6f7a8b9c0`.

Wildcards are escaped, so a typed `%` or `_` matches a literal `%` or `_`
instead of silently turning into "match anything".

None of the searched columns carry an index — a leading `%` rules out a btree
scan regardless — so wrapping them in `unaccent()` costs no index. If these
tables ever grow enough for it to matter, the fix is a `pg_trgm` GIN index over
an IMMUTABLE unaccent wrapper, not a change to these call sites.

The frontend has a matching `fold()` in `frontend/src/lib/fold.ts` for the
lists it filters client-side.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import ColumnElement, SQLColumnExpression, func

# Postgres' LIKE already treats backslash as the escape character, but naming
# it explicitly keeps the predicate correct if that ever changes underneath us.
_ESCAPE = "\\"


def escape_like(term: str) -> str:
    """Neutralize LIKE wildcards in user input.

    The backslash replacement has to come first, otherwise it would escape the
    backslashes introduced by the two that follow.
    """
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _contains_pattern(term: str) -> str:
    return f"%{escape_like(term.strip())}%"


def ilike_contains(column: SQLColumnExpression[Any], term: str) -> ColumnElement[bool]:
    """Case-insensitive substring match, wildcards taken literally.

    For columns that cannot hold diacritics — IČO, e-mail addresses, invoice
    numbers. Folding those would only cost a function call per row.
    """
    return column.ilike(_contains_pattern(term), escape=_ESCAPE)


def folded_ilike_contains(column: SQLColumnExpression[Any], term: str) -> ColumnElement[bool]:
    """Case- and diacritic-insensitive substring match.

    For human-readable text: names, subjects, bodies.
    """
    return func.unaccent(column).ilike(func.unaccent(_contains_pattern(term)), escape=_ESCAPE)
