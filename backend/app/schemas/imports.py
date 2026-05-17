"""Pydantic schemas for the admin CSV-import endpoints."""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ImportMode = Literal["companies_only", "combined", "separate"]
MatchSource = Literal["ico", "name", "email"]


class FieldDescriptor(BaseModel):
    key: str
    label: str
    required: bool


class FieldsCatalog(BaseModel):
    """The set of fields the user can map a CSV column onto. Served by
    `GET /admin/imports/fields` so the frontend mapping <select> options
    stay in lockstep with the backend allowlist."""

    company: list[FieldDescriptor]
    contact: list[FieldDescriptor]


class RowErrorOut(BaseModel):
    row_index: int
    side: Literal["company", "contact"]
    field: str | None = None
    code: str
    message: str


class UpdateDiffOut(BaseModel):
    row_index: int
    entity_type: Literal["company", "contact"]
    entity_id: uuid.UUID
    # `{field_name: {"from": old, "to": new}}` — both values are strings
    # or null; the wire format keeps it simple instead of preserving
    # column types.
    changes: dict[str, dict[str, str | None]]


class UnmatchedContactOut(BaseModel):
    row_index: int
    first_name: str | None
    last_name: str | None
    match_key_value: str | None


class ImportCountsOut(BaseModel):
    companies_to_create: int
    companies_to_update: int
    contacts_to_create: int
    contacts_to_update: int
    invalid_rows: int
    unmatched_contacts: int


class ImportPreviewOut(BaseModel):
    model_config = ConfigDict(json_schema_extra={"description": "Dry-run import results"})

    counts: ImportCountsOut
    errors: list[RowErrorOut] = Field(default_factory=list)
    unmatched: list[UnmatchedContactOut] = Field(default_factory=list)
    update_diffs: list[UpdateDiffOut] = Field(default_factory=list)
    update_diffs_truncated: bool = False


class ImportCommitOut(BaseModel):
    counts: ImportCountsOut
    errors: list[RowErrorOut] = Field(default_factory=list)
    created_company_ids: list[uuid.UUID] = Field(default_factory=list)
    updated_company_ids: list[uuid.UUID] = Field(default_factory=list)
    created_contact_ids: list[uuid.UUID] = Field(default_factory=list)
    updated_contact_ids: list[uuid.UUID] = Field(default_factory=list)
