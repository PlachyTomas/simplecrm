"""Translate header→field mappings + raw row cells into typed candidates.

The "allowed fields" lists here are the public contract — the same lists
are returned by ``GET /imports/fields`` so the frontend can populate the
mapping <select> options without going out of sync.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

# Company-side fields that the user can map a CSV header to.
#   key      = the model attribute (matches `Company` column names)
#   label    = display text in the mapping UI
#   required = at least one CSV column must map to this field, AND that
#              cell must be non-empty for every row
COMPANY_FIELDS: list[dict[str, str | bool]] = [
    {"key": "name", "label": "Název firmy", "required": True},
    {"key": "ico", "label": "IČO", "required": False},
    {"key": "dic", "label": "DIČ", "required": False},
    {"key": "email", "label": "E-mail", "required": False},
    {"key": "phone", "label": "Telefon", "required": False},
    {"key": "website", "label": "Web", "required": False},
    {"key": "industry", "label": "Obor", "required": False},
    {"key": "address_street", "label": "Ulice", "required": False},
    {"key": "address_city", "label": "Město", "required": False},
    {"key": "address_zip", "label": "PSČ", "required": False},
    {"key": "legal_form", "label": "Právní forma", "required": False},
    {"key": "note", "label": "Poznámka", "required": False},
]

CONTACT_FIELDS: list[dict[str, str | bool]] = [
    {"key": "first_name", "label": "Jméno", "required": True},
    {"key": "last_name", "label": "Příjmení", "required": True},
    {"key": "email", "label": "E-mail", "required": False},
    {"key": "phone", "label": "Telefon", "required": False},
    {"key": "position", "label": "Pozice", "required": False},
    {"key": "linkedin_url", "label": "LinkedIn URL", "required": False},
    {"key": "note", "label": "Poznámka", "required": False},
]

# Single source of truth for the per-field varchar caps used on import
# validation. Mirrors the SQL column widths in `Company` / `Contact`.
_COMPANY_LENGTHS = {
    "name": 200,
    "ico": 8,
    "dic": 16,
    "email": 320,
    "phone": 40,
    "website": 300,
    "industry": 120,
    "address_street": 200,
    "address_city": 120,
    "address_zip": 12,
    "legal_form": 120,
    "note": 2000,
}
_CONTACT_LENGTHS = {
    "first_name": 120,
    "last_name": 120,
    "email": 320,
    "phone": 40,
    "position": 160,
    "linkedin_url": 300,
    "note": 2000,
}

_ICO_RE = re.compile(r"^\d{8}$")
# Pragmatic e-mail check — Pydantic's `EmailStr` is stricter, but pulling
# it in per cell would slow the row loop noticeably. The router still runs
# the full check on the assembled `CompanyCreate` / `ContactCreate` before
# the DB commit, so this just catches the obvious junk early.
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class MappingError(Exception):
    """User-supplied mapping is structurally invalid (unknown field,
    duplicate target, missing required field). Raised before any row
    parsing happens."""


Side = Literal["company", "contact"]


@dataclass
class RowError:
    row_index: int
    side: Side
    field: str | None
    code: str
    message: str

    def to_dict(self) -> dict[str, str | int | None]:
        return {
            "row_index": self.row_index,
            "side": self.side,
            "field": self.field,
            "code": self.code,
            "message": self.message,
        }


@dataclass
class CandidateCompany:
    row_index: int
    fields: dict[str, str | None]
    # The key value the matcher will use to dedup within this import.
    # Falls back to lowercased `name` when no IČO mapping was supplied.
    dedup_key: str | None
    errors: list[RowError] = field(default_factory=list)


@dataclass
class CandidateContact:
    row_index: int
    fields: dict[str, str | None]
    # Raw cell of the match-key column the user picked, used by the
    # matcher to find the parent company. ``None`` when the column was
    # mapped but the cell is empty.
    match_key_value: str | None
    errors: list[RowError] = field(default_factory=list)


def validate_mapping(
    mapping: dict[str, str],
    *,
    side: Side,
    headers: list[str],
) -> dict[str, str]:
    """Sanity-check the user mapping; return a `header → field` dict with
    `"ignore"` values stripped out.

    Raises :class:`MappingError` on:
      * a header not present in the CSV
      * a field key not in the allowed-fields catalog for `side`
      * the same field key mapped twice (collision — which column wins?)
      * a required field that isn't mapped at all
    """
    catalog = COMPANY_FIELDS if side == "company" else CONTACT_FIELDS
    allowed: set[str] = {str(f["key"]) for f in catalog}
    required: set[str] = {str(f["key"]) for f in catalog if f["required"]}
    cleaned: dict[str, str] = {}
    target_to_header: dict[str, str] = {}
    for header, target in mapping.items():
        if target in (None, "", "ignore"):
            continue
        if header not in headers:
            raise MappingError(f"Mapping references unknown CSV header: {header!r}")
        if target not in allowed:
            raise MappingError(f"Field {target!r} is not a valid {side} field.")
        if target in target_to_header:
            raise MappingError(
                f"Field {target!r} is mapped twice "
                f"(both {target_to_header[target]!r} and {header!r})."
            )
        target_to_header[target] = header
        cleaned[header] = target

    missing_required = required - set(cleaned.values())
    if missing_required:
        nice = ", ".join(sorted(missing_required))
        raise MappingError(f"Required {side} field(s) not mapped: {nice}.")

    return cleaned


def _validate_value(
    side: Side,
    field_name: str,
    value: str,
    row_index: int,
) -> RowError | None:
    """Per-cell sanity check; returns a :class:`RowError` or ``None``."""
    length_map = _COMPANY_LENGTHS if side == "company" else _CONTACT_LENGTHS
    cap = length_map.get(field_name)
    if cap is not None and len(value) > cap:
        return RowError(
            row_index=row_index,
            side=side,
            field=field_name,
            code="too_long",
            message=f"Value is {len(value)} chars; max is {cap}.",
        )
    if field_name == "ico" and value and not _ICO_RE.fullmatch(value):
        return RowError(
            row_index=row_index,
            side=side,
            field=field_name,
            code="invalid_format",
            message="IČO must be exactly 8 digits.",
        )
    if field_name == "email" and value and not _EMAIL_RE.fullmatch(value):
        return RowError(
            row_index=row_index,
            side=side,
            field=field_name,
            code="invalid_format",
            message="E-mail looks malformed.",
        )
    return None


def apply_company_mapping(
    rows: list[dict[str, str]],
    cleaned_mapping: dict[str, str],
) -> list[CandidateCompany]:
    """Project each CSV row into a :class:`CandidateCompany`.

    Rows missing the required ``name`` field land with a ``required_missing``
    error and ``name = None``; the runner will count them as `invalid`.
    """
    candidates: list[CandidateCompany] = []
    for row in rows:
        # row_index = 2-based to match `parse_csv_bytes` (row 1 = header).
        row_index = rows.index(row) + 2
        fields: dict[str, str | None] = {}
        errors: list[RowError] = []
        for header, target in cleaned_mapping.items():
            cell = row.get(header, "").strip()
            if cell == "":
                fields[target] = None
                continue
            err = _validate_value("company", target, cell, row_index)
            if err is not None:
                errors.append(err)
                # Keep the value so downstream diffs still show what
                # the admin tried to import.
            fields[target] = cell

        if not fields.get("name"):
            errors.append(
                RowError(
                    row_index=row_index,
                    side="company",
                    field="name",
                    code="required_missing",
                    message="Název firmy je povinný.",
                )
            )

        dedup_key = fields.get("ico") or (fields.get("name") or "").lower() or None
        candidates.append(
            CandidateCompany(row_index=row_index, fields=fields, dedup_key=dedup_key, errors=errors)
        )
    return candidates


def apply_contact_mapping(
    rows: list[dict[str, str]],
    cleaned_mapping: dict[str, str],
    *,
    match_key_header: str | None = None,
) -> list[CandidateContact]:
    candidates: list[CandidateContact] = []
    for row in rows:
        row_index = rows.index(row) + 2
        fields: dict[str, str | None] = {}
        errors: list[RowError] = []
        for header, target in cleaned_mapping.items():
            cell = row.get(header, "").strip()
            if cell == "":
                fields[target] = None
                continue
            err = _validate_value("contact", target, cell, row_index)
            if err is not None:
                errors.append(err)
            fields[target] = cell

        for required in ("first_name", "last_name"):
            if not fields.get(required):
                errors.append(
                    RowError(
                        row_index=row_index,
                        side="contact",
                        field=required,
                        code="required_missing",
                        message="Toto pole je povinné.",
                    )
                )

        match_value: str | None = None
        if match_key_header is not None:
            cell = row.get(match_key_header, "").strip()
            match_value = cell or None

        candidates.append(
            CandidateContact(
                row_index=row_index,
                fields=fields,
                match_key_value=match_value,
                errors=errors,
            )
        )
    return candidates
