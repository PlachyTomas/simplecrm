"""Admin CSV import endpoints.

Three modes:

* ``companies_only`` — one CSV, each row = one company.
* ``combined`` — one CSV, each row = one contact + its (possibly
  repeated) company; the same rows are mapped twice, once per side.
* ``separate`` — two CSVs (companies + contacts) with a user-picked
  match-key pair to link them.

Both ``/preview`` (no writes) and ``/commit`` (single transaction)
share the same multipart shape so the frontend can run a dry-run and
re-submit identical form data on confirm.
"""

from __future__ import annotations

import json
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.db import get_db
from app.db.models import User, UserRole
from app.schemas.imports import (
    FieldDescriptor,
    FieldsCatalog,
    ImportCommitOut,
    ImportCountsOut,
    ImportPreviewOut,
    RowErrorOut,
    UnmatchedContactOut,
    UpdateDiffOut,
)
from app.services.imports import (
    COMPANY_FIELDS,
    CONTACT_FIELDS,
    CsvReadError,
    ImportInput,
    MappingError,
    apply_company_mapping,
    apply_contact_mapping,
    parse_csv_bytes,
    run_commit,
    run_preview,
    validate_mapping,
)
from app.services.imports.matcher import MatchSource
from app.services.imports.runner import ImportMode, ImportRunResult
from app.services.lookup_cache import RateLimiter

router = APIRouter(prefix="/admin/imports", tags=["admin:imports"])

# 5 imports per hour per admin — modest because every successful import
# can mutate hundreds of rows, and we don't want a runaway script in the
# admin's browser to blow through the daily DB write budget.
_import_rate_limiter = RateLimiter(max_calls=5, window_seconds=60 * 60)


def get_import_rate_limiter() -> RateLimiter:
    return _import_rate_limiter


@router.get("/fields", response_model=FieldsCatalog)
async def list_importable_fields(
    _user: User = Depends(require_role(UserRole.admin)),
) -> FieldsCatalog:
    return FieldsCatalog(
        company=[FieldDescriptor(**f) for f in COMPANY_FIELDS],  # type: ignore[arg-type]
        contact=[FieldDescriptor(**f) for f in CONTACT_FIELDS],  # type: ignore[arg-type]
    )


def _parse_json_field(name: str, raw: str) -> dict[str, str]:
    try:
        decoded = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{name} must be a JSON object string.",
        ) from exc
    if not isinstance(decoded, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{name} must decode to a JSON object.",
        )
    return {str(k): str(v) for k, v in decoded.items()}


def _to_out(run: ImportRunResult, *, commit: bool) -> ImportPreviewOut | ImportCommitOut:
    counts = ImportCountsOut(**run.counts)
    errors = [RowErrorOut(**e.to_dict()) for e in run.errors]  # type: ignore[arg-type]
    if commit:
        return ImportCommitOut(
            counts=counts,
            errors=errors,
            created_company_ids=run.created_company_ids,
            updated_company_ids=run.updated_company_ids,
            created_contact_ids=run.created_contact_ids,
            updated_contact_ids=run.updated_contact_ids,
        )
    return ImportPreviewOut(
        counts=counts,
        errors=errors,
        unmatched=[UnmatchedContactOut(**u) for u in run.unmatched],  # type: ignore[arg-type]
        update_diffs=[
            UpdateDiffOut(
                row_index=d.row_index,
                entity_type=d.entity_type,
                entity_id=d.entity_id,
                changes=d.changes,
            )
            for d in run.update_diffs
        ],
        update_diffs_truncated=run.update_diffs_truncated,
    )


async def _build_input(
    *,
    organization_id: uuid.UUID | None,
    mode: ImportMode,
    mapping_companies_json: str,
    mapping_contacts_json: str | None,
    match_source: MatchSource | None,
    match_key_company: str | None,
    match_key_contact: str | None,
    companies_file: UploadFile,
    contacts_file: UploadFile | None,
    skip_unmatched: bool,
) -> ImportInput:
    # The router-level `require_org_membership` (via PROTECTED_DEPS) has
    # already rejected callers without an org, so this is a belt-and-
    # braces narrowing for the type-checker.
    if organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin must belong to an organization to import data.",
        )
    company_mapping_raw = _parse_json_field("mapping_companies_json", mapping_companies_json)
    contact_mapping_raw = (
        _parse_json_field("mapping_contacts_json", mapping_contacts_json)
        if mapping_contacts_json
        else {}
    )

    # Read the file blobs eagerly — they're capped at 10 MB each so
    # streaming wouldn't buy us much over the simple bytes API.
    companies_blob = await companies_file.read()
    try:
        companies_parsed = parse_csv_bytes(companies_blob)
    except CsvReadError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    try:
        cleaned_company_mapping = validate_mapping(
            company_mapping_raw, side="company", headers=companies_parsed.headers
        )
    except MappingError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    company_candidates = apply_company_mapping(companies_parsed.rows, cleaned_company_mapping)

    contact_candidates = []
    if mode != "companies_only":
        if mode == "separate":
            if contacts_file is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Mode 'separate' requires a contacts_file upload.",
                )
            contacts_blob = await contacts_file.read()
            try:
                contacts_parsed = parse_csv_bytes(contacts_blob)
            except CsvReadError as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
                ) from exc
        else:
            # Combined mode shares the same CSV between sides.
            contacts_parsed = companies_parsed

        try:
            cleaned_contact_mapping = validate_mapping(
                contact_mapping_raw, side="contact", headers=contacts_parsed.headers
            )
        except MappingError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

        contact_candidates = apply_contact_mapping(
            contacts_parsed.rows,
            cleaned_contact_mapping,
            match_key_header=match_key_contact,
        )

        if match_source is None or match_key_company is None or match_key_contact is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Modes 'combined' and 'separate' require match_source, "
                    "match_key_company and match_key_contact."
                ),
            )
        if match_key_company not in companies_parsed.headers:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"match_key_company {match_key_company!r} is not a header in the "
                "companies CSV.",
            )
        if match_key_contact not in contacts_parsed.headers:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"match_key_contact {match_key_contact!r} is not a header in the "
                "contacts CSV.",
            )
        # The match-key on the company side picks which company-field
        # column the matcher should consult — we infer it from the
        # cleaned mapping so the matcher index uses the right key.
        company_key_field = cleaned_company_mapping.get(match_key_company)
        if company_key_field != match_source:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"match_key_company column must be mapped to the {match_source!r} field "
                    f"(currently mapped to {company_key_field!r})."
                ),
            )

    return ImportInput(
        organization_id=organization_id,
        mode=mode,
        company_candidates=company_candidates,
        contact_candidates=contact_candidates,
        match_source=match_source,
        skip_unmatched=skip_unmatched,
    )


@router.post("/preview", response_model=ImportPreviewOut)
async def preview_import(
    mode: Annotated[ImportMode, Form(...)],
    mapping_companies_json: Annotated[str, Form(...)],
    companies_file: Annotated[UploadFile, File(...)],
    mapping_contacts_json: Annotated[str | None, Form()] = None,
    match_source: Annotated[MatchSource | None, Form()] = None,
    match_key_company: Annotated[str | None, Form()] = None,
    match_key_contact: Annotated[str | None, Form()] = None,
    contacts_file: Annotated[UploadFile | None, File()] = None,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
    rate_limiter: RateLimiter = Depends(get_import_rate_limiter),
) -> ImportPreviewOut:
    if not await rate_limiter.try_acquire(user.id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many imports — wait a few minutes and try again.",
        )

    payload = await _build_input(
        organization_id=user.organization_id,
        mode=mode,
        mapping_companies_json=mapping_companies_json,
        mapping_contacts_json=mapping_contacts_json,
        match_source=match_source,
        match_key_company=match_key_company,
        match_key_contact=match_key_contact,
        companies_file=companies_file,
        contacts_file=contacts_file,
        skip_unmatched=False,
    )
    run = await run_preview(session, payload)
    out = _to_out(run, commit=False)
    if not isinstance(out, ImportPreviewOut):  # pragma: no cover - narrowing
        raise RuntimeError("preview returned wrong shape")
    return out


@router.post("/commit", response_model=ImportCommitOut)
async def commit_import(
    mode: Annotated[ImportMode, Form(...)],
    mapping_companies_json: Annotated[str, Form(...)],
    companies_file: Annotated[UploadFile, File(...)],
    mapping_contacts_json: Annotated[str | None, Form()] = None,
    match_source: Annotated[MatchSource | None, Form()] = None,
    match_key_company: Annotated[str | None, Form()] = None,
    match_key_contact: Annotated[str | None, Form()] = None,
    contacts_file: Annotated[UploadFile | None, File()] = None,
    skip_unmatched: Annotated[bool, Form()] = False,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
    rate_limiter: RateLimiter = Depends(get_import_rate_limiter),
) -> ImportCommitOut:
    if not await rate_limiter.try_acquire(user.id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many imports — wait a few minutes and try again.",
        )

    payload = await _build_input(
        organization_id=user.organization_id,
        mode=mode,
        mapping_companies_json=mapping_companies_json,
        mapping_contacts_json=mapping_contacts_json,
        match_source=match_source,
        match_key_company=match_key_company,
        match_key_contact=match_key_contact,
        companies_file=companies_file,
        contacts_file=contacts_file,
        skip_unmatched=skip_unmatched,
    )
    run = await run_commit(session, payload)
    out = _to_out(run, commit=True)
    if not isinstance(out, ImportCommitOut):  # pragma: no cover - narrowing
        raise RuntimeError("commit returned wrong shape")
    return out


# Silence Literal-Variable warnings on `MatchSource` etc.
_ = Literal
