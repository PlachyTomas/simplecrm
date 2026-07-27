"""Unit tests for the shared merge-field vocabulary (feature F2).

No DB: the service is pure text substitution over a `MergeContext`. The
legacy trio (`{firma}`, `{kontakt}`, `{vlastnik}`) is asserted explicitly —
bulk email shipped with it and it must never change meaning.
"""

from __future__ import annotations

from decimal import Decimal

from app.services.merge_fields import (
    MAX_SUBJECT_LENGTH,
    MERGE_FIELD_KEYS,
    SIGNATURE_DELIMITER,
    MergeContext,
    apply_merge_fields,
    apply_signature,
    render_message,
)


def _ctx(**overrides: object) -> MergeContext:
    base: dict[str, object] = {
        "company_name": "ACME",
        "contact_name": "Jan Novák",
        "contact_first_name": "Jan",
        "sender_name": "Petr Prodejce",
        "sender_email": "petr@firma.cz",
        "deal_name": "Dodávka strojů",
        "deal_value": Decimal("125000.00"),
        "currency": "CZK",
        "language": "cs",
    }
    base.update(overrides)
    return MergeContext(**base)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Legacy vocabulary — must keep working exactly as bulk email shipped it
# ---------------------------------------------------------------------------


def test_legacy_three_tokens_still_substitute() -> None:
    subject, body = render_message(
        "Nabídka pro {firma}",
        "Dobrý den {kontakt}, posílá {vlastnik}.",
        MergeContext(company_name="ACME", contact_name="Jan", sender_name="Petr"),
    )
    assert subject == "Nabídka pro ACME"
    assert body == "Dobrý den Jan, posílá Petr."


def test_legacy_blank_contact_renders_empty() -> None:
    _subject, body = render_message(
        "x",
        "Dobrý den {kontakt}.",
        MergeContext(company_name="ACME", contact_name="", sender_name="Petr"),
    )
    assert body == "Dobrý den ."


# ---------------------------------------------------------------------------
# Extended vocabulary
# ---------------------------------------------------------------------------


def test_extended_tokens_substitute() -> None:
    out = apply_merge_fields(
        "{kontakt_jmeno} / {obchod} / {muj_email}",
        _ctx(),
    )
    assert out == "Jan / Dodávka strojů / petr@firma.cz"


def test_value_is_formatted_with_org_currency_and_locale() -> None:
    cs = apply_merge_fields("{hodnota}", _ctx())
    en = apply_merge_fields("{hodnota}", _ctx(language="en", currency="EUR"))
    # Don't pin Babel's exact spacing/glyphs — assert the parts that matter.
    assert "125" in cs
    assert "Kč" in cs
    assert "€" in en


def test_value_is_empty_without_a_deal_or_amount() -> None:
    assert apply_merge_fields("[{hodnota}]", _ctx(deal_value=None)) == "[]"
    # A campaign-created deal starts at 0; "0,00 Kč" reads worse than nothing.
    assert apply_merge_fields("[{hodnota}]", _ctx(deal_value=Decimal("0"))) == "[]"


def test_unset_context_renders_known_tokens_empty() -> None:
    assert apply_merge_fields("A{obchod}B{firma}C", MergeContext()) == "ABC"


# ---------------------------------------------------------------------------
# Robustness
# ---------------------------------------------------------------------------


def test_unknown_tokens_are_left_verbatim() -> None:
    text = "Ceník {cenik} a {FIRMA} a {} a { firma } a {2x}"
    assert apply_merge_fields(text, _ctx()) == text


def test_unknown_token_next_to_a_known_one() -> None:
    assert apply_merge_fields("{firma}{neznamy}", _ctx()) == "ACME{neznamy}"


def test_lone_braces_survive() -> None:
    assert apply_merge_fields("if (x) { return {firma}; }", _ctx()) == "if (x) { return ACME; }"


def test_empty_text_is_returned_unchanged() -> None:
    assert apply_merge_fields("", _ctx()) == ""


def test_replacement_values_are_not_re_scanned() -> None:
    """A value that itself looks like a token must not be substituted again."""
    assert apply_merge_fields("{firma}", _ctx(company_name="{vlastnik}")) == "{vlastnik}"


def test_merge_field_keys_are_the_documented_vocabulary() -> None:
    assert MERGE_FIELD_KEYS == (
        "firma",
        "kontakt",
        "kontakt_jmeno",
        "vlastnik",
        "obchod",
        "hodnota",
        "muj_email",
    )
    # Every advertised key must actually resolve.
    assert set(MergeContext().values()) == set(MERGE_FIELD_KEYS)


# ---------------------------------------------------------------------------
# Signature
# ---------------------------------------------------------------------------


def test_signature_is_appended_behind_the_rfc3676_delimiter() -> None:
    out = apply_signature("Tělo", "Petr\nfirma.cz")
    assert out == "Tělo\n\n-- \nPetr\nfirma.cz"
    assert out.count("\n-- \n") == 1
    assert SIGNATURE_DELIMITER == "\n\n-- \n"


def test_signature_is_a_noop_when_missing_or_blank() -> None:
    assert apply_signature("Tělo", None) == "Tělo"
    assert apply_signature("Tělo", "") == "Tělo"
    assert apply_signature("Tělo", "   \n\t ") == "Tělo"


def test_signature_resolves_merge_fields() -> None:
    ctx = _ctx()
    body = apply_signature("Tělo", apply_merge_fields("{vlastnik}\n{muj_email}", ctx))
    assert body == "Tělo\n\n-- \nPetr Prodejce\npetr@firma.cz"


def test_rendered_subject_is_clamped_to_the_column_width() -> None:
    """Tokens expand after the API's 300-char check, and the overflow used to
    surface only on INSERT — after SMTP had already delivered the mail (review
    F2 P2). The rendered subject must fit what we can store."""
    ctx = MergeContext(company_name="Ř" * 200)
    subject, _ = render_message("x" * 290 + "{firma}", "b", ctx)
    assert len(subject) <= MAX_SUBJECT_LENGTH
    assert subject.endswith("…")


def test_short_subject_is_untouched_by_the_clamp() -> None:
    ctx = MergeContext(company_name="Acme")
    subject, _ = render_message("Nabídka pro {firma}", "b", ctx)
    assert subject == "Nabídka pro Acme"
