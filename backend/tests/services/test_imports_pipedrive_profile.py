"""Unit tests for the provider layer, value parsers and deal status semantics.

No DB session — everything here is pure Python, mirroring
`test_imports_matcher.py`. The DB-touching deal paths live in
`tests/api/v1/test_imports.py`.

The CSVs under `tests/fixtures/pipedrive/` double as the phase-4 regression
corpus: when a real Pipedrive export finally arrives, it replaces these
files and every assertion below still has to hold.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path

import pytest

from app.db.models import StageType
from app.services.imports import (
    apply_company_mapping,
    apply_contact_mapping,
    apply_deal_mapping,
    parse_csv_bytes,
    suggest_stage_mapping,
    validate_mapping,
)
from app.services.imports.mapping import MappingError
from app.services.imports.normalize import normalize_header, normalize_text
from app.services.imports.providers import PIPEDRIVE, detect_provider, get_provider
from app.services.imports.stages import (
    FALLBACK_LOST_REASON,
    StageInfo,
    StageResolver,
    parse_status,
)
from app.services.imports.values import (
    ValueParseError,
    normalize_currency,
    parse_import_date,
    parse_import_datetime,
    parse_money,
    split_multi_value,
)

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "pipedrive"


def _fixture(name: str) -> tuple[list[str], list[dict[str, str]]]:
    parsed = parse_csv_bytes(FIXTURES.joinpath(name).read_bytes())
    return parsed.headers, parsed.rows


# --------------------------------------------------------------- normalize


def test_normalize_header_strips_required_marker_and_diacritics() -> None:
    assert normalize_header("Organization - Name*") == "organization name"
    assert normalize_header("Organizace - Název*") == "organizace nazev"
    # The `Entity - Field` convention, an en dash and plain spacing all fold
    # to the same token string.
    assert normalize_header("Deal – Title") == normalize_header("Deal - Title")
    assert normalize_header("  Deal   Title  ") == "deal title"


def test_normalize_text_is_case_and_diacritics_insensitive() -> None:
    assert normalize_text("Vyhráno") == normalize_text("VYHRANO") == "vyhrano"


# ---------------------------------------------------------------- provider


@pytest.mark.parametrize(
    ("filename", "expected_role"),
    [
        ("organizations_en.csv", "companies"),
        ("organizations_cs.csv", "companies"),
        ("persons_en.csv", "contacts"),
        ("persons_cs.csv", "contacts"),
        ("deals_en.csv", "deals"),
        ("deals_cs.csv", "deals"),
    ],
)
def test_detect_role_for_both_header_languages(filename: str, expected_role: str) -> None:
    headers, _rows = _fixture(filename)
    assert PIPEDRIVE.detect_role(headers) == expected_role
    assert detect_provider(headers) is PIPEDRIVE


def test_suggest_mapping_resolves_english_company_aliases() -> None:
    headers, _rows = _fixture("organizations_en.csv")
    mapping = PIPEDRIVE.suggest_mapping(headers, side="company")
    assert mapping["Organization - Name*"] == "name"
    assert mapping["Organization - Address"] == "address_street"
    assert mapping["Organization - Address - City/town/village/locality of Address"] == (
        "address_city"
    )
    assert mapping["Organization - Address - ZIP/Postal code of Address"] == "address_zip"
    # Unrecognised columns are the ones the spec parks on the note.
    assert mapping["Organization - Label"] == "note_append"
    assert mapping["Organization - Pipedrive System ID"] == "note_append"


def test_suggest_mapping_resolves_czech_company_aliases() -> None:
    headers, _rows = _fixture("organizations_cs.csv")
    mapping = PIPEDRIVE.suggest_mapping(headers, side="company")
    assert mapping["Organizace - Název*"] == "name"
    assert mapping["Organizace - Adresa - Město"] == "address_city"
    assert mapping["Organizace - Adresa - PSČ"] == "address_zip"
    assert mapping["Organizace - Štítek"] == "note_append"


def test_suggest_mapping_deal_side_covers_status_and_link_columns() -> None:
    for filename in ("deals_en.csv", "deals_cs.csv"):
        headers, _rows = _fixture(filename)
        mapping = PIPEDRIVE.suggest_mapping(headers, side="deal")
        targets = set(mapping.values())
        assert {
            "name",
            "value",
            "currency",
            "status",
            "stage",
            "expected_close_date",
            "won_time",
            "lost_time",
            "lost_reason",
            "company",
            "contact",
            "owner",
        }.issubset(targets)
        # No note column on `deals`, so leftovers must not claim note_append.
        assert "note_append" not in targets


def test_suggest_mapping_prefers_the_specific_address_subfield() -> None:
    headers = [
        "Organization - Name*",
        "Organization - Address",
        "Organization - Address - Street/road name of Address",
    ]
    mapping = PIPEDRIVE.suggest_mapping(headers, side="company")
    assert mapping["Organization - Address - Street/road name of Address"] == "address_street"
    # The catch-all loses the target and falls to the note, even though it
    # appears earlier in the file.
    assert mapping["Organization - Address"] == "note_append"


def test_person_full_name_column_maps_to_the_splitting_target() -> None:
    headers, _rows = _fixture("persons_en.csv")
    mapping = PIPEDRIVE.suggest_mapping(headers, side="contact")
    assert mapping["Person - Name*"] == "full_name"
    assert mapping["Person - First name"] == "first_name"
    assert PIPEDRIVE.suggest_match_key_contact(headers) == "Organization name"


def test_generic_provider_recognises_nothing() -> None:
    generic = get_provider("generic")
    assert generic is not None
    headers, _rows = _fixture("deals_en.csv")
    assert generic.detect_role(headers) is None
    assert set(generic.suggest_mapping(headers, side="deal").values()) == {"ignore"}


def test_stage_header_lookup_finds_the_source_stage_column() -> None:
    headers, _rows = _fixture("deals_en.csv")
    assert PIPEDRIVE.stage_header(headers) == "Deal - Stage (pipeline)"
    headers_cs, _rows_cs = _fixture("deals_cs.csv")
    assert PIPEDRIVE.stage_header(headers_cs) == "Obchod - Fáze"


# ------------------------------------------------------------------ values


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("100.0", Decimal("100.00")),
        ("120 000", Decimal("120000.00")),
        ("1 234,56", Decimal("1234.56")),
        ("1,234.56", Decimal("1234.56")),
        ("1.234,56", Decimal("1234.56")),
        ("1 234 567", Decimal("1234567.00")),
        ("9 000 Kč", Decimal("9000.00")),
        ("-500", Decimal("-500.00")),
    ],
)
def test_parse_money_accepts_both_locale_spellings(raw: str, expected: Decimal) -> None:
    assert parse_money(raw) == expected


def test_parse_money_rejects_garbage_and_overflow() -> None:
    with pytest.raises(ValueParseError):
        parse_money("nevím")
    with pytest.raises(ValueParseError):
        parse_money("9999999999999999")


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("2026-09-30", date(2026, 9, 30)),
        ("30.09.2026", date(2026, 9, 30)),
        ("30. 9. 2026", date(2026, 9, 30)),
        ("30/09/2026", date(2026, 9, 30)),
        ("2026/09/30", date(2026, 9, 30)),
        ("2026-09-30 14:30:00", date(2026, 9, 30)),
        # Excel serial, as leaked by Pipedrive's own sample CSV.
        ("45631", date(2024, 12, 5)),
    ],
)
def test_parse_import_date_is_liberal(raw: str, expected: date) -> None:
    assert parse_import_date(raw) == expected


def test_parse_import_date_rejects_unreadable_cells() -> None:
    with pytest.raises(ValueParseError):
        parse_import_date("someday")


def test_parse_import_datetime_defaults_to_utc() -> None:
    assert parse_import_datetime("2026-06-15 10:00") == datetime(2026, 6, 15, 10, 0, tzinfo=UTC)
    assert parse_import_datetime("15.06.2026") == datetime(2026, 6, 15, tzinfo=UTC)


def test_normalize_currency_accepts_symbols_and_codes() -> None:
    assert normalize_currency("czk") == "CZK"
    assert normalize_currency("$") == "USD"
    assert normalize_currency("Kč") == "CZK"
    with pytest.raises(ValueParseError):
        normalize_currency("dollarsish")


def test_split_multi_value_handles_the_comma_joined_export() -> None:
    assert split_multi_value("a@x.cz, b@x.cz") == ["a@x.cz", "b@x.cz"]
    assert split_multi_value("solo@x.cz") == ["solo@x.cz"]


# ------------------------------------------------------------- note_append


def test_note_append_concatenates_labelled_lines() -> None:
    headers, rows = _fixture("organizations_en.csv")
    mapping = PIPEDRIVE.suggest_mapping(headers, side="company")
    cleaned = validate_mapping(mapping, side="company", headers=headers)
    candidates = apply_company_mapping(rows, cleaned)
    note = candidates[0].fields["note"]
    assert note is not None
    assert "Organization - Label: Customer" in note
    assert "Organization - Pipedrive System ID: 101" in note
    # One line per source column, in mapping order.
    assert len(note.splitlines()) == 2


def test_note_append_may_be_mapped_by_several_columns() -> None:
    cleaned = validate_mapping(
        {"Název": "name", "A": "note_append", "B": "note_append"},
        side="company",
        headers=["Název", "A", "B"],
    )
    assert cleaned == {"Název": "name", "A": "note_append", "B": "note_append"}


def test_duplicate_targets_other_than_note_append_still_collide() -> None:
    with pytest.raises(MappingError):
        validate_mapping({"A": "name", "B": "name"}, side="company", headers=["A", "B"])


def test_note_append_is_not_offered_on_the_deal_side() -> None:
    with pytest.raises(MappingError):
        validate_mapping(
            {"Deal - Title": "name", "Deal - Probability": "note_append"},
            side="deal",
            headers=["Deal - Title", "Deal - Probability"],
        )


def test_multi_value_email_keeps_first_and_parks_the_rest_in_the_note() -> None:
    headers, rows = _fixture("persons_en.csv")
    mapping = PIPEDRIVE.suggest_mapping(headers, side="contact")
    cleaned = validate_mapping(mapping, side="contact", headers=headers)
    candidates = apply_contact_mapping(rows, cleaned)
    bob = candidates[1]
    assert bob.fields["email"] == "bob@acme.cz"
    note = bob.fields["note"]
    assert note is not None and "bob.private@example.com" in note
    # `Person - Name` filled the required split columns.
    assert bob.fields["first_name"] == "Bob"
    assert bob.fields["last_name"] == "Black"


def test_full_name_does_not_override_explicit_columns() -> None:
    headers, rows = _fixture("persons_en.csv")
    mapping = PIPEDRIVE.suggest_mapping(headers, side="contact")
    cleaned = validate_mapping(mapping, side="contact", headers=headers)
    anna = apply_contact_mapping(rows, cleaned)[0]
    assert (anna.fields["first_name"], anna.fields["last_name"]) == ("Anna", "Novakova")


# --------------------------------------------------------- deal row mapping


def test_apply_deal_mapping_parses_the_czech_fixture() -> None:
    headers, rows = _fixture("deals_cs.csv")
    mapping = PIPEDRIVE.suggest_mapping(headers, side="deal")
    cleaned = validate_mapping(mapping, side="deal", headers=headers)
    deals = apply_deal_mapping(rows, cleaned)

    assert [d.name for d in deals] == ["Nový web", "Rozšíření", "Údržba"]
    assert deals[0].value == Decimal("120000.00")
    assert deals[0].expected_close_date == date(2026, 9, 30)
    assert deals[0].company_raw == "Acme s.r.o."
    assert deals[0].contact_raw == "Anna Nováková"
    assert deals[1].won_time == datetime(2026, 6, 15, tzinfo=UTC)
    assert deals[2].currency == "EUR"
    assert deals[2].lost_time == datetime(2026, 5, 20, tzinfo=UTC)
    assert deals[2].lost_reason_raw == "Příliš drahé"
    assert all(d.errors == [] for d in deals)


def test_unreadable_date_is_a_warning_not_a_lost_deal() -> None:
    rows = [{"Title": "X", "Close": "someday"}]
    cleaned = validate_mapping(
        {"Title": "name", "Close": "expected_close_date"},
        side="deal",
        headers=["Title", "Close"],
    )
    (deal,) = apply_deal_mapping(rows, cleaned)
    assert deal.expected_close_date is None
    assert [e.code for e in deal.errors] == ["date_unparsed"]


def test_unreadable_value_blocks_the_row() -> None:
    rows = [{"Title": "X", "Value": "spousta peněz"}]
    cleaned = validate_mapping(
        {"Title": "name", "Value": "value"}, side="deal", headers=["Title", "Value"]
    )
    (deal,) = apply_deal_mapping(rows, cleaned)
    assert [e.code for e in deal.errors] == ["invalid_format"]


# ------------------------------------------------------- status → stage map


def _stages() -> list[StageInfo]:
    pipeline_id = uuid.uuid4()
    return [
        StageInfo(
            id=uuid.uuid4(),
            name=name,
            stage_type=stage_type,
            position=position,
            pipeline_id=pipeline_id,
            pipeline_name="Výchozí",
            pipeline_is_default=True,
        )
        for position, (name, stage_type) in enumerate(
            [
                ("Nový lead", StageType.open),
                ("Jednání", StageType.open),
                ("Vyhráno", StageType.won),
            ]
        )
    ]


def _resolver(stages: list[StageInfo], mapping: dict[str, uuid.UUID]) -> StageResolver:
    return StageResolver(
        stages=stages,
        stage_mapping=mapping,
        import_now=datetime(2026, 7, 27, tzinfo=UTC),
    )


def test_parse_status_accepts_both_languages_and_flags_junk() -> None:
    assert parse_status("Won") == parse_status("Vyhráno") == "won"
    assert parse_status("Lost") == parse_status("prohráno") == "lost"
    assert parse_status("") == "open"
    assert parse_status("kdovíco") is None


def test_open_deal_keeps_its_stage_and_no_closed_at() -> None:
    stages = _stages()
    resolver = _resolver(stages, {"Qualified": stages[1].id})
    state, errors = resolver.resolve(
        row_index=2,
        stage_raw="Qualified",
        status_raw="Open",
        lost_reason_raw=None,
        won_time=None,
        lost_time=None,
        closed_on=None,
    )
    assert errors == []
    assert state is not None
    assert state.stage_id == stages[1].id
    assert state.closed_at is None
    assert state.lost_reason is None


def test_won_deal_is_forced_into_a_won_type_stage() -> None:
    stages = _stages()
    # Mapped to an OPEN stage on purpose — status must win.
    resolver = _resolver(stages, {"Negotiation": stages[1].id})
    state, errors = resolver.resolve(
        row_index=2,
        stage_raw="Negotiation",
        status_raw="Won",
        lost_reason_raw=None,
        won_time=datetime(2026, 6, 15, tzinfo=UTC),
        lost_time=None,
        closed_on=None,
    )
    assert errors == []
    assert state is not None
    assert state.stage_id == stages[2].id
    assert state.closed_at == datetime(2026, 6, 15, tzinfo=UTC)


def test_won_closed_at_falls_back_to_closed_on_then_import_date() -> None:
    stages = _stages()
    resolver = _resolver(stages, {})
    fallback_to_closed_on, _ = resolver.resolve(
        row_index=2,
        stage_raw=None,
        status_raw="Won",
        lost_reason_raw=None,
        won_time=None,
        lost_time=None,
        closed_on=datetime(2026, 3, 1, tzinfo=UTC),
    )
    assert fallback_to_closed_on is not None
    assert fallback_to_closed_on.closed_at == datetime(2026, 3, 1, tzinfo=UTC)

    fallback_to_now, _ = resolver.resolve(
        row_index=3,
        stage_raw=None,
        status_raw="Won",
        lost_reason_raw=None,
        won_time=None,
        lost_time=None,
        closed_on=None,
    )
    assert fallback_to_now is not None
    assert fallback_to_now.closed_at == datetime(2026, 7, 27, tzinfo=UTC)


def test_lost_deal_stays_in_an_open_type_stage() -> None:
    """The regression the spec singles out: a lost deal in a won-type stage
    (or an open stage with no closed_at) corrupts every report."""
    stages = _stages()
    resolver = _resolver(stages, {"Qualified": stages[0].id})
    state, errors = resolver.resolve(
        row_index=2,
        stage_raw="Qualified",
        status_raw="Lost",
        lost_reason_raw="Too expensive",
        won_time=None,
        lost_time=datetime(2026, 5, 20, tzinfo=UTC),
        closed_on=None,
    )
    assert errors == []
    assert state is not None
    assert state.stage_id == stages[0].id
    assert next(s for s in stages if s.id == state.stage_id).stage_type is StageType.open
    assert state.closed_at == datetime(2026, 5, 20, tzinfo=UTC)
    assert state.lost_reason == "Too expensive"


def test_lost_deal_without_a_reason_gets_the_fallback_string() -> None:
    stages = _stages()
    resolver = _resolver(stages, {})
    state, _errors = resolver.resolve(
        row_index=2,
        stage_raw=None,
        status_raw="Lost",
        lost_reason_raw=None,
        won_time=None,
        lost_time=None,
        closed_on=None,
    )
    assert state is not None
    assert state.lost_reason == FALLBACK_LOST_REASON
    assert state.closed_at == datetime(2026, 7, 27, tzinfo=UTC)


def test_lost_deal_mapped_to_a_won_stage_is_demoted_with_a_warning() -> None:
    stages = _stages()
    resolver = _resolver(stages, {"Closed won-ish": stages[2].id})
    state, errors = resolver.resolve(
        row_index=2,
        stage_raw="Closed won-ish",
        status_raw="Lost",
        lost_reason_raw=None,
        won_time=None,
        lost_time=None,
        closed_on=None,
    )
    assert state is not None
    assert next(s for s in stages if s.id == state.stage_id).stage_type is StageType.open
    assert [e.code for e in errors] == ["lost_in_won_stage"]


def test_unmapped_stage_blocks_the_row() -> None:
    stages = _stages()
    resolver = _resolver(stages, {})
    state, errors = resolver.resolve(
        row_index=2,
        stage_raw="Qualified",
        status_raw="Open",
        lost_reason_raw=None,
        won_time=None,
        lost_time=None,
        closed_on=None,
    )
    assert state is None
    assert [e.code for e in errors] == ["stage_unmapped"]
    assert resolver.unmapped_values(["Qualified", "Qualified", "", None or ""]) == ["Qualified"]


def test_unknown_status_blocks_rather_than_defaulting_to_open() -> None:
    stages = _stages()
    resolver = _resolver(stages, {})
    state, errors = resolver.resolve(
        row_index=2,
        stage_raw=None,
        status_raw="Rozjednáno?",
        lost_reason_raw=None,
        won_time=None,
        lost_time=None,
        closed_on=None,
    )
    assert state is None
    assert [e.code for e in errors] == ["status_unknown"]


def test_stage_mapping_lookup_ignores_case_and_diacritics() -> None:
    stages = _stages()
    resolver = _resolver(stages, {"Nový lead": stages[0].id})
    state, errors = resolver.resolve(
        row_index=2,
        stage_raw="  NOVY LEAD ",
        status_raw=None,
        lost_reason_raw=None,
        won_time=None,
        lost_time=None,
        closed_on=None,
    )
    assert errors == []
    assert state is not None and state.stage_id == stages[0].id


# ------------------------------------------------------- stage suggestions


def test_suggest_stage_mapping_matches_names_and_status_words() -> None:
    stages = _stages()
    suggestions = suggest_stage_mapping(
        ["Nový lead", "novy lead", "Won", "Jednání s klientem", "Zcela jiná fáze"], stages
    )
    assert suggestions["Nový lead"] == stages[0].id
    assert suggestions["novy lead"] == stages[0].id
    assert suggestions["Won"] == stages[2].id
    assert suggestions["Jednání s klientem"] == stages[1].id
    assert suggestions["Zcela jiná fáze"] is None
