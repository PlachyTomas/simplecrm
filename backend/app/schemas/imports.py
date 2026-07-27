"""Pydantic schemas for the admin CSV-import endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ImportMode = Literal["companies_only", "combined", "separate", "deals"]
MatchSource = Literal["ico", "name", "email"]
FileRole = Literal["companies", "contacts", "combined", "deals"]
ImportRunStatusOut = Literal["committed", "undone", "partially_undone"]
UndoSkipCode = Literal[
    "modified_after_import",
    "has_activity",
    "has_calendar_events",
    "has_other_records",
]


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
    # The `import_runs` row this commit created. Feed it straight to
    # `POST /admin/imports/runs/{id}/undo` for the result screen's undo button.
    import_run_id: uuid.UUID | None = None


class ImportRunOut(BaseModel):
    """One row of the import history."""

    id: uuid.UUID
    provider: str
    status: ImportRunStatusOut
    created_at: datetime
    # Who ran it. `null` when the account has since been deleted (the run row
    # deliberately outlives the user).
    created_by_user_id: uuid.UUID | None = None
    created_by_name: str | None = None
    created_by_email: str | None = None
    counts: ImportCountsOut
    undone_at: datetime | None = None
    undone_by_user_id: uuid.UUID | None = None
    # False once undo has run — v1 offers exactly one undo pass per import,
    # including when that pass had to skip rows (`partially_undone`).
    undoable: bool


class ImportUndoCountsOut(BaseModel):
    companies: int = 0
    contacts: int = 0
    deals: int = 0


class ImportUndoSkipOut(BaseModel):
    """One row undo refused to delete.

    Render from `code` + `name` for a localized string; `message` is a Czech
    fallback in the same style as the import's row errors.
    """

    entity_type: Literal["company", "contact", "deal"]
    entity_id: uuid.UUID
    name: str
    code: UndoSkipCode
    message: str


class ImportUndoOut(BaseModel):
    run_id: uuid.UUID
    status: ImportRunStatusOut
    deleted: ImportUndoCountsOut
    skipped: ImportUndoCountsOut
    skipped_reasons: list[ImportUndoSkipOut] = Field(default_factory=list)
    skipped_reasons_truncated: bool = False
    # Rows the import UPDATED rather than created. Undo does **not** revert
    # them — no before-image is stored — so the UI must say so when either
    # number is non-zero.
    updates_not_reverted: ImportUndoCountsOut
