"""Unit tests for the import matcher / mapping / dedup primitives.

These are intentionally pure-Python tests with no DB session — the
runner's DB-touching paths are exercised separately in the
api/v1/test_imports.py integration tests.
"""

from __future__ import annotations

import uuid

from app.services.imports import (
    apply_company_mapping,
    apply_contact_mapping,
    match_contacts_to_companies,
    validate_mapping,
)
from app.services.imports.mapping import MappingError
from app.services.imports.runner import _company_dedup


def _make_company(fields: dict[str, str | None], row_index: int = 2) -> object:
    from app.services.imports.mapping import CandidateCompany

    return CandidateCompany(
        row_index=row_index,
        fields=fields,
        dedup_key=fields.get("ico") or (fields.get("name") or "").lower() or None,
    )


def _make_contact(
    fields: dict[str, str | None], match_key: str | None, row_index: int = 2
) -> object:
    from app.services.imports.mapping import CandidateContact

    return CandidateContact(row_index=row_index, fields=fields, match_key_value=match_key)


def test_validate_mapping_rejects_unknown_field() -> None:
    try:
        validate_mapping({"Header": "made_up_field"}, side="company", headers=["Header", "Name"])
    except MappingError as exc:
        assert "made_up_field" in str(exc)
    else:
        raise AssertionError("expected MappingError for unknown field")


def test_validate_mapping_rejects_unknown_header() -> None:
    try:
        validate_mapping({"Missing": "name"}, side="company", headers=["Name"])
    except MappingError as exc:
        assert "Missing" in str(exc)
    else:
        raise AssertionError("expected MappingError for unknown header")


def test_validate_mapping_rejects_duplicate_target() -> None:
    try:
        validate_mapping({"A": "name", "B": "name"}, side="company", headers=["A", "B"])
    except MappingError as exc:
        assert "twice" in str(exc)
    else:
        raise AssertionError("expected MappingError for duplicate target")


def test_validate_mapping_requires_company_name() -> None:
    try:
        validate_mapping({"IČO": "ico"}, side="company", headers=["IČO"])
    except MappingError as exc:
        assert "name" in str(exc)
    else:
        raise AssertionError("expected MappingError for missing required field")


def test_validate_mapping_strips_ignore_entries() -> None:
    cleaned = validate_mapping(
        {"Name": "name", "Unused": "ignore", "Empty": ""},
        side="company",
        headers=["Name", "Unused", "Empty"],
    )
    assert cleaned == {"Name": "name"}


def test_apply_company_mapping_flags_required_missing_and_bad_email() -> None:
    rows = [
        {"Name": "Acme", "Email": "not-an-email"},
        {"Name": "", "Email": "x@y.cz"},
    ]
    candidates = apply_company_mapping(rows, {"Name": "name", "Email": "email"})
    assert candidates[0].fields == {"name": "Acme", "email": "not-an-email"}
    assert any(e.code == "invalid_format" for e in candidates[0].errors)
    assert any(e.code == "required_missing" for e in candidates[1].errors)


def test_apply_company_mapping_rejects_non_8_digit_ico() -> None:
    rows = [{"Name": "Acme", "IČO": "1234567"}]
    candidates = apply_company_mapping(rows, {"Name": "name", "IČO": "ico"})
    assert any(e.code == "invalid_format" and e.field == "ico" for e in candidates[0].errors)


def test_apply_contact_mapping_carries_match_key_cell() -> None:
    rows = [
        {"Jméno": "Anna", "Příjmení": "Nováková", "Firma": "Acme"},
        {"Jméno": "Bob", "Příjmení": "Black", "Firma": ""},
    ]
    candidates = apply_contact_mapping(
        rows,
        {"Jméno": "first_name", "Příjmení": "last_name"},
        match_key_header="Firma",
    )
    assert candidates[0].match_key_value == "Acme"
    assert candidates[1].match_key_value is None


def test_matcher_no_match_source_reports_no_company_key_for_every_contact() -> None:
    contacts = [_make_contact({"first_name": "A", "last_name": "B"}, match_key="anything")]
    res = match_contacts_to_companies(
        contacts=contacts,
        company_candidates=[],
        existing_companies_by_ico={},
        existing_companies_by_name={},
        match_source=None,
    )
    assert res.matches[2] is None
    assert any(e.code == "no_company_key" for e in res.errors)


def test_matcher_unmatched_returns_unmatched_error() -> None:
    contacts = [_make_contact({"first_name": "A", "last_name": "B"}, "12345678")]
    res = match_contacts_to_companies(
        contacts=contacts,
        company_candidates=[],
        existing_companies_by_ico={},
        existing_companies_by_name={},
        match_source="ico",
    )
    assert res.matches[2] is None
    assert any(e.code == "unmatched" for e in res.errors)


def test_matcher_ambiguous_match_when_two_companies_share_key() -> None:
    contacts = [_make_contact({"first_name": "A", "last_name": "B"}, "Acme")]
    companies = [
        _make_company({"name": "Acme", "ico": "11111111"}, row_index=2),
        _make_company({"name": "Acme", "ico": "22222222"}, row_index=3),
    ]
    res = match_contacts_to_companies(
        contacts=contacts,
        company_candidates=companies,
        existing_companies_by_ico={},
        existing_companies_by_name={},
        match_source="name",
    )
    assert res.matches[2] is None
    assert any(e.code == "ambiguous_match" for e in res.errors)


def test_matcher_empty_match_key_cell_skips_with_no_company_key() -> None:
    contacts = [_make_contact({"first_name": "A", "last_name": "B"}, match_key=None)]
    companies = [_make_company({"name": "Acme"}, row_index=2)]
    res = match_contacts_to_companies(
        contacts=contacts,
        company_candidates=companies,
        existing_companies_by_ico={},
        existing_companies_by_name={},
        match_source="name",
    )
    assert res.matches[2] is None
    assert any(e.code == "no_company_key" for e in res.errors)


def test_matcher_name_is_case_insensitive() -> None:
    contacts = [_make_contact({"first_name": "A", "last_name": "B"}, "acme")]
    companies = [_make_company({"name": "ACME"}, row_index=2)]
    res = match_contacts_to_companies(
        contacts=contacts,
        company_candidates=companies,
        existing_companies_by_ico={},
        existing_companies_by_name={},
        match_source="name",
    )
    key = res.matches[2]
    assert key is not None
    assert key.company_index == 0


def test_matcher_matches_against_existing_db_company_by_ico() -> None:
    existing_id = uuid.uuid4()
    contacts = [_make_contact({"first_name": "A", "last_name": "B"}, "12345678")]
    res = match_contacts_to_companies(
        contacts=contacts,
        company_candidates=[],
        existing_companies_by_ico={"12345678": existing_id},
        existing_companies_by_name={},
        match_source="ico",
    )
    key = res.matches[2]
    assert key is not None
    assert key.existing_company_id == existing_id


def test_matcher_collapses_reuploaded_company_with_existing_row() -> None:
    """A candidate that updates an existing firm and that existing row are
    one company — a contact keyed to them must resolve, not read ambiguous."""
    existing_id = uuid.uuid4()
    contacts = [_make_contact({"first_name": "A", "last_name": "B"}, "12345678")]
    companies = [_make_company({"name": "Acme", "ico": "12345678"}, row_index=2)]
    res = match_contacts_to_companies(
        contacts=contacts,
        company_candidates=companies,
        existing_companies_by_ico={"12345678": existing_id},
        existing_companies_by_name={},
        match_source="ico",
        candidate_existing_ids={0: existing_id},
    )
    assert not any(e.code == "ambiguous_match" for e in res.errors)
    key = res.matches[2]
    assert key is not None
    assert key.company_index == 0


def test_matcher_still_ambiguous_for_two_genuinely_distinct_companies() -> None:
    """The collapse is scoped to a candidate + the existing row it updates;
    a candidate that maps to a *different* existing firm stays ambiguous."""
    other_existing = uuid.uuid4()
    contacts = [_make_contact({"first_name": "A", "last_name": "B"}, "Acme")]
    companies = [_make_company({"name": "Acme", "ico": "11111111"}, row_index=2)]
    res = match_contacts_to_companies(
        contacts=contacts,
        company_candidates=companies,
        existing_companies_by_ico={},
        existing_companies_by_name={"acme": other_existing},
        match_source="name",
        candidate_existing_ids={},  # candidate does not resolve to other_existing
    )
    assert res.matches[2] is None
    assert any(e.code == "ambiguous_match" for e in res.errors)


def test_dedup_first_wins_subsequent_get_duplicate_in_file() -> None:
    candidates = [
        _make_company({"name": "A", "ico": "12345678"}, row_index=2),
        _make_company({"name": "B", "ico": "12345678"}, row_index=3),
        _make_company({"name": "C", "ico": "12345678"}, row_index=4),
    ]
    kept, errors = _company_dedup(candidates)
    assert len(kept) == 1
    assert kept[0].fields["name"] == "A"
    assert {e.row_index for e in errors} == {3, 4}
    assert all(e.code == "duplicate_in_file" for e in errors)
