"""Admin CSV import endpoints (multi-file, v2 shape).

The wizard uploads N files in one multipart request, plus a JSON array
of *file specs* that runs parallel to the files list. Each spec carries
the file's role (``companies`` / ``contacts`` / ``combined``), its
header→field mapping, and (for contact-bearing files) the column header
the matcher should use to link to a company. A single ``match_source``
(``ico`` / ``name`` / ``email``) applies globally — the matcher indexes
company candidates by that field across every uploaded company file.

Both ``/preview`` (no writes) and ``/commit`` (single transaction) share
the same multipart shape so the frontend can run a dry-run and re-submit
identical form data on confirm.
"""

from __future__ import annotations

import json
import uuid
from typing import Annotated, Any, Literal

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
    CandidateCompany,
    CandidateContact,
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
from app.services.imports.runner import ImportRunResult
from app.services.lookup_cache import RateLimiter

router = APIRouter(prefix="/admin/imports", tags=["admin:imports"])

# 5 imports per hour per admin — modest because every successful import
# can mutate hundreds of rows, and we don't want a runaway script in the
# admin's browser to blow through the daily DB write budget.
_import_rate_limiter = RateLimiter(max_calls=5, window_seconds=60 * 60)


def get_import_rate_limiter() -> RateLimiter:
    return _import_rate_limiter


FileRole = Literal["companies", "contacts", "combined"]
_VALID_ROLES: set[str] = {"companies", "contacts", "combined"}


@router.get("/fields", response_model=FieldsCatalog)
async def list_importable_fields(
    _user: User = Depends(require_role(UserRole.admin)),
) -> FieldsCatalog:
    return FieldsCatalog(
        company=[FieldDescriptor(**f) for f in COMPANY_FIELDS],  # type: ignore[arg-type]
        contact=[FieldDescriptor(**f) for f in CONTACT_FIELDS],  # type: ignore[arg-type]
    )


def _bad(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _parse_file_specs(raw: str, *, expected_count: int) -> list[dict[str, Any]]:
    """Decode the parallel file-specs array. Raises 400 on any structural
    failure so the wizard surfaces a single readable error per attempt."""
    try:
        decoded = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise _bad("file_specs_json must be a JSON array.") from exc
    if not isinstance(decoded, list):
        raise _bad("file_specs_json must decode to a JSON array.")
    if len(decoded) != expected_count:
        raise _bad(
            f"file_specs_json has {len(decoded)} entries but {expected_count} files were uploaded."
        )
    out: list[dict[str, Any]] = []
    for idx, spec in enumerate(decoded):
        if not isinstance(spec, dict):
            raise _bad(f"file_specs_json[{idx}] must be an object.")
        role = spec.get("role")
        if role not in _VALID_ROLES:
            raise _bad(
                f"file_specs_json[{idx}].role must be one of {sorted(_VALID_ROLES)}."
            )
        if role in {"companies", "combined"} and not isinstance(
            spec.get("mapping_company"), dict
        ):
            raise _bad(
                f"file_specs_json[{idx}].mapping_company must be an object for role {role!r}."
            )
        if role in {"contacts", "combined"} and not isinstance(
            spec.get("mapping_contact"), dict
        ):
            raise _bad(
                f"file_specs_json[{idx}].mapping_contact must be an object for role {role!r}."
            )
        out.append(spec)
    return out


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
    files: list[UploadFile],
    file_specs_json: str,
    match_source: MatchSource | None,
    skip_unmatched: bool,
    bulk_owner_user_id: uuid.UUID | None,
) -> ImportInput:
    if organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin must belong to an organization to import data.",
        )
    if not files:
        raise _bad("At least one file is required.")
    specs = _parse_file_specs(file_specs_json, expected_count=len(files))

    company_candidates: list[CandidateCompany] = []
    contact_candidates: list[CandidateContact] = []
    has_contact_side = False

    for idx, (file, spec) in enumerate(zip(files, specs, strict=True)):
        role: FileRole = spec["role"]
        blob = await file.read()
        try:
            parsed = parse_csv_bytes(blob)
        except CsvReadError as exc:
            raise _bad(f"{file.filename or f'file[{idx}]'}: {exc}") from exc

        if role in {"companies", "combined"}:
            try:
                cleaned = validate_mapping(
                    spec["mapping_company"], side="company", headers=parsed.headers
                )
            except MappingError as exc:
                raise _bad(f"{file.filename or f'file[{idx}]'} (company): {exc}") from exc
            company_candidates.extend(apply_company_mapping(parsed.rows, cleaned))

        if role in {"contacts", "combined"}:
            has_contact_side = True
            try:
                cleaned_c = validate_mapping(
                    spec["mapping_contact"], side="contact", headers=parsed.headers
                )
            except MappingError as exc:
                raise _bad(f"{file.filename or f'file[{idx}]'} (contact): {exc}") from exc
            match_key_contact = spec.get("match_key_contact")
            if match_key_contact is not None and match_key_contact not in parsed.headers:
                raise _bad(
                    f"{file.filename or f'file[{idx}]'}: match_key_contact "
                    f"{match_key_contact!r} is not a header in this file."
                )
            contact_candidates.extend(
                apply_contact_mapping(
                    parsed.rows, cleaned_c, match_key_header=match_key_contact
                )
            )

    if has_contact_side and match_source is None:
        raise _bad("match_source is required when any file has a contacts/combined role.")

    # `mode` is purely a label downstream — derive it from the role mix
    # for backwards-compatible logging / tests. The runner doesn't read it.
    mode: Literal["companies_only", "combined", "separate"]
    if not has_contact_side:
        mode = "companies_only"
    elif any(s["role"] == "combined" for s in specs):
        mode = "combined"
    else:
        mode = "separate"

    return ImportInput(
        organization_id=organization_id,
        mode=mode,
        company_candidates=company_candidates,
        contact_candidates=contact_candidates,
        match_source=match_source,
        skip_unmatched=skip_unmatched,
        bulk_owner_user_id=bulk_owner_user_id,
    )


@router.post("/preview", response_model=ImportPreviewOut)
async def preview_import(
    files: Annotated[list[UploadFile], File(...)],
    file_specs_json: Annotated[str, Form(...)],
    match_source: Annotated[MatchSource | None, Form()] = None,
    bulk_owner_user_id: Annotated[uuid.UUID | None, Form()] = None,
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
        files=files,
        file_specs_json=file_specs_json,
        match_source=match_source,
        skip_unmatched=False,
        bulk_owner_user_id=bulk_owner_user_id,
    )
    try:
        run = await run_preview(session, payload)
    except ValueError as exc:
        raise _bad(str(exc)) from exc
    out = _to_out(run, commit=False)
    if not isinstance(out, ImportPreviewOut):  # pragma: no cover - narrowing
        raise RuntimeError("preview returned wrong shape")
    return out


@router.post("/commit", response_model=ImportCommitOut)
async def commit_import(
    files: Annotated[list[UploadFile], File(...)],
    file_specs_json: Annotated[str, Form(...)],
    match_source: Annotated[MatchSource | None, Form()] = None,
    skip_unmatched: Annotated[bool, Form()] = False,
    bulk_owner_user_id: Annotated[uuid.UUID | None, Form()] = None,
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
        files=files,
        file_specs_json=file_specs_json,
        match_source=match_source,
        skip_unmatched=skip_unmatched,
        bulk_owner_user_id=bulk_owner_user_id,
    )
    try:
        run = await run_commit(session, payload)
    except ValueError as exc:
        raise _bad(str(exc)) from exc
    out = _to_out(run, commit=True)
    if not isinstance(out, ImportCommitOut):  # pragma: no cover - narrowing
        raise RuntimeError("commit returned wrong shape")
    return out
