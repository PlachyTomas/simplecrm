"""Pydantic schemas for the admin CSV-import endpoints."""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ImportMode = Literal["companies_only", "combined", "separate", "deals"]
MatchSource = Literal["ico", "name", "email"]
FileRole = Literal["companies", "contacts", "combined", "deals"]


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
    deal: list[FieldDescriptor]


class ProviderOut(BaseModel):
    """One entry of the wizard's "Odkud migrujete?" picker."""

    key: str
    label: str
    roles: list[FileRole]


class ProvidersOut(BaseModel):
    providers: list[ProviderOut]


class ImportStageOut(BaseModel):
    id: uuid.UUID
    name: str
    stage_type: Literal["open", "won", "lost"]
    position: int
    pipeline_id: uuid.UUID
    pipeline_name: str
    is_default_pipeline: bool


class StageSuggestionsIn(BaseModel):
    """Distinct source stage values, straight from the deals column."""

    values: list[str] = Field(default_factory=list)


class StageSuggestionsOut(BaseModel):
    stages: list[ImportStageOut]
    # `{source value: stage id or null}` — null means "we could not guess",
    # and the wizard must make the admin pick before the import will run.
    suggestions: dict[str, uuid.UUID | None]


class AnalyzedFileOut(BaseModel):
    filename: str | None
    headers: list[str]
    detected_role: FileRole | None
    # `{role: {header: field key}}` — pre-filled mapping per role the file
    # could plausibly be used as. "note_append" / "ignore" for unknowns.
    suggested_mappings: dict[str, dict[str, str]]
    suggested_match_key_contact: str | None = None
    stage_header: str | None = None
    stage_values: list[str] = Field(default_factory=list)


class AnalyzeOut(BaseModel):
    provider: str
    files: list[AnalyzedFileOut]
    stages: list[ImportStageOut]
    stage_suggestions: dict[str, uuid.UUID | None] = Field(default_factory=dict)


class RowErrorOut(BaseModel):
    row_index: int
    side: Literal["company", "contact", "deal"]
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


class CurrencyMismatchOut(BaseModel):
    currency: str
    count: int


class ImportCountsOut(BaseModel):
    companies_to_create: int
    companies_to_update: int
    contacts_to_create: int
    contacts_to_update: int
    invalid_rows: int
    unmatched_contacts: int
    deals_to_create: int = 0
    # Firms named by a deal but present in neither the DB nor the
    # organizations file. `deals.company_id` is NOT NULL, so they get
    # created — counted apart so the preview can say it out loud.
    companies_from_deals_to_create: int = 0


class ImportPreviewOut(BaseModel):
    model_config = ConfigDict(json_schema_extra={"description": "Dry-run import results"})

    counts: ImportCountsOut
    errors: list[RowErrorOut] = Field(default_factory=list)
    unmatched: list[UnmatchedContactOut] = Field(default_factory=list)
    update_diffs: list[UpdateDiffOut] = Field(default_factory=list)
    update_diffs_truncated: bool = False
    # Distinct source stage values with no entry in `stage_mapping`. Every
    # row carrying one is blocked; the wizard highlights exactly these.
    unmapped_stage_values: list[str] = Field(default_factory=list)
    currency_mismatches: list[CurrencyMismatchOut] = Field(default_factory=list)
    org_currency: str | None = None


class ImportCommitOut(BaseModel):
    counts: ImportCountsOut
    errors: list[RowErrorOut] = Field(default_factory=list)
    created_company_ids: list[uuid.UUID] = Field(default_factory=list)
    updated_company_ids: list[uuid.UUID] = Field(default_factory=list)
    created_contact_ids: list[uuid.UUID] = Field(default_factory=list)
    updated_contact_ids: list[uuid.UUID] = Field(default_factory=list)
    created_deal_ids: list[uuid.UUID] = Field(default_factory=list)
