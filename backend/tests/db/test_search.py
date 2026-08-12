"""Unit tests for the search predicates in `app.db.search`.

These run the predicates as real SQL against a literal — no seeding, no
endpoints — so a folding or escaping regression fails here with a one-line
diagnosis instead of surfacing as "some list endpoint returns the wrong rows".
"""

from __future__ import annotations

import pytest
from sqlalchemy import Text, cast, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.search import escape_like, folded_ilike_contains, ilike_contains


async def _folded(session: AsyncSession, value: str, term: str) -> bool:
    col = cast(literal(value), Text)
    return bool((await session.execute(select(folded_ilike_contains(col, term)))).scalar_one())


async def _plain(session: AsyncSession, value: str, term: str) -> bool:
    col = cast(literal(value), Text)
    return bool((await session.execute(select(ilike_contains(col, term)))).scalar_one())


# ---------------------------------------------------------------------------
# escape_like
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("brana", "brana"),
        ("100%", "100\\%"),
        ("a_b", "a\\_b"),
        # The backslash itself is escaped first, so the escapes added for % and
        # _ afterwards are not themselves neutralized.
        ("a\\b", "a\\\\b"),
        ("50%_off\\", "50\\%\\_off\\\\"),
    ],
)
def test_escape_like_neutralizes_wildcards(raw: str, expected: str) -> None:
    assert escape_like(raw) == expected


# ---------------------------------------------------------------------------
# folded_ilike_contains — the actual requirement
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "term"),
    [
        # Typed without diacritics, stored with them — the headline case.
        ("Brána", "brana"),
        # ...and the reverse: typed with, stored without.
        ("Brana", "Brána"),
        # Both sides accented but differently cased.
        ("Brána", "BRÁNA"),
        ("Škoda Auto a.s.", "skoda"),
        ("Čížek", "cizek"),
        ("Řeřicha", "rericha"),
        ("Ďáblice", "dablice"),
        ("Plzeňský Prazdroj", "plzensky"),
        ("Jiří Novotný", "jiri novotny"),
        # Substring, not prefix.
        ("Dodávka pro Brnó", "brn"),
        # Letters with no NFD decomposition, mirroring `unaccent`'s own rules.
        ("Łódź", "lodz"),
        ("Straße", "strasse"),
        ("Ærø", "aero"),
    ],
)
async def test_folded_matches_across_diacritics(
    db_session: AsyncSession, value: str, term: str
) -> None:
    assert await _folded(db_session, value, term) is True


@pytest.mark.parametrize(
    ("value", "term"),
    [
        ("Brána", "brno"),
        ("Škoda", "skoda auto"),
        # Folding must not collapse distinct letters into each other.
        ("Alza", "alzb"),
    ],
)
async def test_folded_rejects_non_matches(db_session: AsyncSession, value: str, term: str) -> None:
    assert await _folded(db_session, value, term) is False


async def test_folded_ignores_surrounding_whitespace(db_session: AsyncSession) -> None:
    assert await _folded(db_session, "Brána", "  brana  ") is True


# ---------------------------------------------------------------------------
# wildcards are literal on both predicates
# ---------------------------------------------------------------------------


async def test_typed_percent_matches_a_literal_percent(db_session: AsyncSession) -> None:
    assert await _folded(db_session, "Sleva 20% na vše", "20%") is True
    # Without escaping, "20%" would also match this row — the % would stand in
    # for "anything".
    assert await _folded(db_session, "Sleva 20 na vše", "20%") is False


async def test_typed_underscore_matches_a_literal_underscore(db_session: AsyncSession) -> None:
    assert await _plain(db_session, "a_b", "a_b") is True
    assert await _plain(db_session, "axb", "a_b") is False


async def test_plain_predicate_is_case_insensitive_but_not_folding(
    db_session: AsyncSession,
) -> None:
    # `ilike_contains` guards columns that can't hold diacritics (IČO, e-mail
    # addresses), so it only needs to be case-insensitive.
    assert await _plain(db_session, "AB123", "ab123") is True
    assert await _plain(db_session, "Brána", "brana") is False
