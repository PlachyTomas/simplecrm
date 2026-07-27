"""Translate header→field mappings + raw row cells into typed candidates.

The "allowed fields" lists here are the public contract — the same lists
are returned by ``GET /imports/fields`` so the frontend can populate the
mapping <select> options without going out of sync.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from app.services.imports.normalize import note_label
from app.services.imports.values import (
    ValueParseError,
    normalize_currency,
    parse_import_date,
    parse_import_datetime,
    parse_money,
    split_multi_value,
)

# Generic virtual target: any number of columns may be mapped onto it and
# their cells are concatenated into the entity's `note` as `Label: value`
# lines. This is the escape hatch for a provider's custom fields — nothing
# about it is Pipedrive-specific.
NOTE_APPEND = "note_append"

_NOTE_APPEND_FIELD: dict[str, str | bool] = {
    "key": NOTE_APPEND,
    "label": "Připojit k poznámce",
    "required": False,
}

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
    # Virtual field: a CSV column mapped to `owner` carries an
    # e-mail or full name; the runner resolves it to `User.id` and
    # writes `Company.owner_user_id`. There is no SQL column called
    # "owner" — the special path lives in `runner.py`.
    {"key": "owner", "label": "Obchodník (e-mail nebo jméno)", "required": False},
    _NOTE_APPEND_FIELD,
]

# Virtual company fields (mapped by the user, never written via setattr
# because no matching SQL column exists). Used by `apply_company_mapping`
# and the runner to keep these cells out of `CandidateCompany.fields`.
VIRTUAL_COMPANY_FIELDS: set[str] = {"owner", NOTE_APPEND}

# Max length for the owner cell — 320 because the longest legal e-mail
# is 254 chars and we keep some headroom for whitespace + comments.
_OWNER_RAW_MAX_LEN = 320


CONTACT_FIELDS: list[dict[str, str | bool]] = [
    {"key": "first_name", "label": "Jméno", "required": True},
    {"key": "last_name", "label": "Příjmení", "required": True},
    # Virtual: a single "Jan Novák" column, split on the last space. Foreign
    # exports (Pipedrive's `Person - Name`) far more reliably carry the full
    # name than the split pair, and `first_name`/`last_name` are both
    # required here — without this a persons export is unimportable.
    # An explicit first_name/last_name mapping always wins over the split.
    {"key": "full_name", "label": "Celé jméno (rozdělí se)", "required": False},
    {"key": "email", "label": "E-mail", "required": False},
    {"key": "phone", "label": "Telefon", "required": False},
    {"key": "position", "label": "Pozice", "required": False},
    {"key": "linkedin_url", "label": "LinkedIn URL", "required": False},
    {"key": "note", "label": "Poznámka", "required": False},
    _NOTE_APPEND_FIELD,
]

VIRTUAL_CONTACT_FIELDS: set[str] = {"full_name", NOTE_APPEND}

# Deal-side fields. `name` is the only SQL-required one; `value`,
# `currency` and `expected_close_date` land on the row via setattr, and
# everything in VIRTUAL_DEAL_FIELDS is resolved by the runner (stage +
# status → stage_id/closed_at/lost_reason, company/contact → FKs, owner →
# User.id).
DEAL_FIELDS: list[dict[str, str | bool]] = [
    {"key": "name", "label": "Název obchodu", "required": True},
    {"key": "value", "label": "Hodnota", "required": False},
    {"key": "currency", "label": "Měna", "required": False},
    {"key": "expected_close_date", "label": "Očekávané uzavření", "required": False},
    {"key": "stage", "label": "Fáze (hodnota ze zdroje)", "required": False},
    {"key": "status", "label": "Stav (otevřený / vyhraný / prohraný)", "required": False},
    {"key": "lost_reason", "label": "Důvod prohry", "required": False},
    {"key": "won_time", "label": "Datum výhry", "required": False},
    {"key": "lost_time", "label": "Datum prohry", "required": False},
    {"key": "closed_on", "label": "Datum uzavření", "required": False},
    {"key": "company", "label": "Firma (název)", "required": False},
    {"key": "contact", "label": "Kontakt (jméno nebo e-mail)", "required": False},
    {"key": "owner", "label": "Obchodník (e-mail nebo jméno)", "required": False},
    {"key": "external_id", "label": "ID ve zdrojovém CRM", "required": False},
]

# Note: no `note_append` on the deal side — `deals` has no note column, so
# offering the target would promise a write we cannot make. Deal custom
# fields are dropped in v1 (spec: "Out (v1, deliberate)").
VIRTUAL_DEAL_FIELDS: set[str] = {
    "stage",
    "status",
    "lost_reason",
    "won_time",
    "lost_time",
    "closed_on",
    "company",
    "contact",
    "owner",
    "external_id",
}

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
_DEAL_LENGTHS = {
    "name": 200,
    "currency": 3,
}
# Auxiliary deal cells we truncate rather than reject — losing the tail of a
# lost reason is strictly better than losing the deal.
_LOST_REASON_MAX_LEN = 200
_EXTERNAL_ID_MAX_LEN = 128
_NOTE_MAX_LEN = 2000

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


Side = Literal["company", "contact", "deal"]

_CATALOGS: dict[Side, list[dict[str, str | bool]]] = {
    "company": COMPANY_FIELDS,
    "contact": CONTACT_FIELDS,
    "deal": DEAL_FIELDS,
}


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
    # Raw cell from the "owner" column (e-mail or name). Kept off
    # `fields` so the runner's diff/setattr loops never try to write
    # it as a SQL column. Resolved to `User.id` by `OwnerResolver`.
    owner_raw: str | None = None
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


@dataclass
class CandidateDeal:
    """One deal row, split into "columns we can setattr" and "cells the
    runner still has to resolve against the database".

    Unlike :class:`CandidateCompany` the typed columns are separate
    attributes rather than a ``fields`` dict — a deal mixes str, Decimal and
    date, and a heterogeneous dict makes every downstream call site a cast.
    """

    row_index: int
    name: str | None
    value: Decimal | None = None
    currency: str | None = None
    expected_close_date: date | None = None
    # Unresolved cells (see VIRTUAL_DEAL_FIELDS).
    stage_raw: str | None = None
    status_raw: str | None = None
    lost_reason_raw: str | None = None
    won_time: datetime | None = None
    lost_time: datetime | None = None
    closed_on: datetime | None = None
    company_raw: str | None = None
    contact_raw: str | None = None
    owner_raw: str | None = None
    external_id: str | None = None
    errors: list[RowError] = field(default_factory=list)

    def db_fields(self) -> dict[str, object]:
        """The subset that maps 1:1 onto `Deal` columns."""
        return {
            "name": self.name,
            "value": self.value if self.value is not None else Decimal("0"),
            "expected_close_date": self.expected_close_date,
        }


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

    ``note_append`` is exempt from the collision rule: appending several
    columns to the note is the whole point of that target.

    On the contact side ``full_name`` satisfies the ``first_name`` /
    ``last_name`` requirement, because it is split into both.
    """
    catalog = _CATALOGS[side]
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
        if target in target_to_header and target != NOTE_APPEND:
            raise MappingError(
                f"Field {target!r} is mapped twice "
                f"(both {target_to_header[target]!r} and {header!r})."
            )
        target_to_header[target] = header
        cleaned[header] = target

    mapped_targets = set(cleaned.values())
    if side == "contact" and "full_name" in mapped_targets:
        mapped_targets |= {"first_name", "last_name"}
    missing_required = required - mapped_targets
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
    length_map = {
        "company": _COMPANY_LENGTHS,
        "contact": _CONTACT_LENGTHS,
        "deal": _DEAL_LENGTHS,
    }[side]
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


def _merge_note(direct: str | None, extra_lines: list[str]) -> str | None:
    """Fold ``note_append`` lines into the mapped ``note`` column.

    Truncates instead of erroring: appended custom-field text is auxiliary,
    and refusing a whole company because someone's CRM had a chatty comment
    field would be absurd.
    """
    parts = [p for p in [direct, *extra_lines] if p]
    if not parts:
        return None
    return "\n".join(parts)[:_NOTE_MAX_LEN]


def _split_primary(cell: str) -> tuple[str, list[str]]:
    """Multi-value e-mail/phone cell → (primary, leftovers).

    Pipedrive comma-joins a person's several addresses on export; we keep the
    first as the column value and let the caller push the rest into the note.
    """
    parts = split_multi_value(cell)
    if len(parts) <= 1:
        return cell, []
    return parts[0], parts[1:]


def _split_full_name(cell: str) -> tuple[str, str]:
    """``"Jan Novák"`` → ``("Jan", "Novák")``; ``"Jan van Beek"`` →
    ``("Jan van", "Beek")``.

    A single token becomes the surname with an empty given name, which trips
    the ``required_missing`` check on purpose — the preview then names the
    exact rows the admin has to fix, rather than us inventing a first name.
    """
    tokens = cell.split()
    if len(tokens) <= 1:
        return "", cell.strip()
    return " ".join(tokens[:-1]), tokens[-1]


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
        owner_raw: str | None = None
        note_lines: list[str] = []
        errors: list[RowError] = []
        for header, target in cleaned_mapping.items():
            cell = row.get(header, "").strip()
            if target == NOTE_APPEND:
                if cell:
                    note_lines.append(f"{note_label(header)}: {cell}")
                continue
            if target in VIRTUAL_COMPANY_FIELDS:
                # `owner` is the only remaining virtual company field; keep
                # this branch general in case more land later.
                if cell == "":
                    continue
                if len(cell) > _OWNER_RAW_MAX_LEN:
                    errors.append(
                        RowError(
                            row_index=row_index,
                            side="company",
                            field=target,
                            code="too_long",
                            message=(f"Value is {len(cell)} chars; max is {_OWNER_RAW_MAX_LEN}."),
                        )
                    )
                owner_raw = cell
                continue
            if cell == "":
                fields[target] = None
                continue
            if target in ("email", "phone"):
                cell, leftovers = _split_primary(cell)
                if leftovers:
                    note_lines.append(f"{note_label(header)}: {', '.join(leftovers)}")
            err = _validate_value("company", target, cell, row_index)
            if err is not None:
                errors.append(err)
                # Keep the value so downstream diffs still show what
                # the admin tried to import.
            fields[target] = cell

        if note_lines:
            fields["note"] = _merge_note(fields.get("note"), note_lines)

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
            CandidateCompany(
                row_index=row_index,
                fields=fields,
                owner_raw=owner_raw,
                dedup_key=dedup_key,
                errors=errors,
            )
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
        note_lines: list[str] = []
        split_name: tuple[str, str] | None = None
        errors: list[RowError] = []
        for header, target in cleaned_mapping.items():
            cell = row.get(header, "").strip()
            if target == NOTE_APPEND:
                if cell:
                    note_lines.append(f"{note_label(header)}: {cell}")
                continue
            if target == "full_name":
                if cell:
                    split_name = _split_full_name(cell)
                continue
            if cell == "":
                fields[target] = None
                continue
            if target in ("email", "phone"):
                cell, leftovers = _split_primary(cell)
                if leftovers:
                    note_lines.append(f"{note_label(header)}: {', '.join(leftovers)}")
            err = _validate_value("contact", target, cell, row_index)
            if err is not None:
                errors.append(err)
            fields[target] = cell

        # An explicit first_name/last_name column always beats the split.
        if split_name is not None:
            first, last = split_name
            for key, value in (("first_name", first), ("last_name", last)):
                if not fields.get(key) and value:
                    err = _validate_value("contact", key, value, row_index)
                    if err is not None:
                        errors.append(err)
                    fields[key] = value

        if note_lines:
            fields["note"] = _merge_note(fields.get("note"), note_lines)

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


# Cells whose parse failure must NOT cost the whole row: a deal without an
# expected-close date is still a deal, and a migration that drops deals over
# a stray date format is worse than one that drops the date. The RowError is
# still emitted so the preview names the row.
_SOFT_DEAL_CODES = {"date_unparsed", "currency_unknown"}


def _parse_deal_date_cell(
    cell: str,
    *,
    target: str,
    row_index: int,
    errors: list[RowError],
    as_datetime: bool,
) -> date | datetime | None:
    try:
        return parse_import_datetime(cell) if as_datetime else parse_import_date(cell)
    except ValueParseError as exc:
        errors.append(
            RowError(
                row_index=row_index,
                side="deal",
                field=target,
                code="date_unparsed",
                message=str(exc),
            )
        )
        return None


def apply_deal_mapping(
    rows: list[dict[str, str]],
    cleaned_mapping: dict[str, str],
) -> list[CandidateDeal]:
    """Project each CSV row into a :class:`CandidateDeal`.

    Only structural problems are decided here. Stage/status/company/contact
    resolution needs the database and lives in the runner.
    """
    candidates: list[CandidateDeal] = []
    for row in rows:
        row_index = rows.index(row) + 2
        errors: list[RowError] = []
        cand = CandidateDeal(row_index=row_index, name=None)

        for header, target in cleaned_mapping.items():
            cell = row.get(header, "").strip()
            if cell == "":
                continue
            if target == "name":
                err = _validate_value("deal", target, cell, row_index)
                if err is not None:
                    errors.append(err)
                cand.name = cell
            elif target == "value":
                try:
                    cand.value = parse_money(cell)
                except ValueParseError as exc:
                    # Blocking: a deal imported with a silently-zero value
                    # corrupts the forecast in a way nobody goes looking for.
                    errors.append(
                        RowError(
                            row_index=row_index,
                            side="deal",
                            field=target,
                            code="invalid_format",
                            message=str(exc),
                        )
                    )
            elif target == "currency":
                try:
                    cand.currency = normalize_currency(cell)
                except ValueParseError as exc:
                    errors.append(
                        RowError(
                            row_index=row_index,
                            side="deal",
                            field=target,
                            code="currency_unknown",
                            message=str(exc),
                        )
                    )
            elif target == "expected_close_date":
                parsed = _parse_deal_date_cell(
                    cell,
                    target=target,
                    row_index=row_index,
                    errors=errors,
                    as_datetime=False,
                )
                if isinstance(parsed, date) and not isinstance(parsed, datetime):
                    cand.expected_close_date = parsed
            elif target in ("won_time", "lost_time", "closed_on"):
                parsed_dt = _parse_deal_date_cell(
                    cell,
                    target=target,
                    row_index=row_index,
                    errors=errors,
                    as_datetime=True,
                )
                if isinstance(parsed_dt, datetime):
                    setattr(cand, target, parsed_dt)
            elif target == "stage":
                cand.stage_raw = cell
            elif target == "status":
                cand.status_raw = cell
            elif target == "lost_reason":
                cand.lost_reason_raw = cell[:_LOST_REASON_MAX_LEN]
            elif target == "company":
                cand.company_raw = cell
            elif target == "contact":
                cand.contact_raw = cell
            elif target == "external_id":
                cand.external_id = cell[:_EXTERNAL_ID_MAX_LEN]
            elif target == "owner":
                if len(cell) > _OWNER_RAW_MAX_LEN:
                    errors.append(
                        RowError(
                            row_index=row_index,
                            side="deal",
                            field=target,
                            code="too_long",
                            message=f"Value is {len(cell)} chars; max is {_OWNER_RAW_MAX_LEN}.",
                        )
                    )
                cand.owner_raw = cell

        if not cand.name:
            errors.append(
                RowError(
                    row_index=row_index,
                    side="deal",
                    field="name",
                    code="required_missing",
                    message="Název obchodu je povinný.",
                )
            )

        cand.errors = errors
        candidates.append(cand)
    return candidates
