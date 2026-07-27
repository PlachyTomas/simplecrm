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

A successful ``/commit`` also writes an ``import_runs`` row and stamps every
row it *creates* with its id, which is what ``GET /runs`` (history) and
``POST /runs/{id}/undo`` (undo) work from.
"""

from __future__ import annotations

import json
import uuid
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Path, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.db import get_db
from app.db.models import ImportRun, ImportRunStatus, User, UserRole
from app.schemas.imports import (
    AnalyzedFileOut,
    AnalyzeOut,
    CurrencyMismatchOut,
    FieldDescriptor,
    FieldsCatalog,
    ImportCommitOut,
    ImportCountsOut,
    ImportPreviewOut,
    ImportRunOut,
    ImportStageOut,
    ImportUndoCountsOut,
    ImportUndoOut,
    ImportUndoSkipOut,
    ProviderOut,
    ProvidersOut,
    RowErrorOut,
    StageSuggestionsIn,
    StageSuggestionsOut,
    UnmatchedContactOut,
    UpdateDiffOut,
)
from app.schemas.pagination import Page, PaginationParams
from app.services.imports import (
    COMPANY_FIELDS,
    CONTACT_FIELDS,
    DEAL_FIELDS,
    PROVIDERS,
    CandidateCompany,
    CandidateContact,
    CandidateDeal,
    CsvReadError,
    ImportInput,
    MappingError,
    apply_company_mapping,
    apply_contact_mapping,
    apply_deal_mapping,
    load_stages,
    parse_csv_bytes,
    run_commit,
    run_preview,
    suggest_stage_mapping,
    undo_import_run,
    updates_not_reverted,
    validate_mapping,
)
from app.services.imports.matcher import MatchSource
from app.services.imports.providers import ROLE_SIDES, detect_provider, get_provider
from app.services.imports.runner import ImportRunResult
from app.services.imports.stages import StageInfo
from app.services.lookup_cache import RateLimiter

router = APIRouter(prefix="/admin/imports", tags=["admin:imports"])

# 5 imports per hour per admin — modest because every successful import
# can mutate hundreds of rows, and we don't want a runaway script in the
# admin's browser to blow through the daily DB write budget.
_import_rate_limiter = RateLimiter(max_calls=5, window_seconds=60 * 60)


def get_import_rate_limiter() -> RateLimiter:
    return _import_rate_limiter


FileRole = Literal["companies", "contacts", "combined", "deals"]
_VALID_ROLES: set[str] = {"companies", "contacts", "combined", "deals"}
# Which mapping object each role MUST carry. A spec may additionally carry
# any of the others — a Pipedrive deals export denormalizes org and person
# columns into the same file, so `role="deals"` plus a `mapping_company`
# is a legitimate one-file migration.
_REQUIRED_MAPPINGS: dict[str, tuple[str, ...]] = {
    "companies": ("mapping_company",),
    "contacts": ("mapping_contact",),
    "combined": ("mapping_company", "mapping_contact"),
    "deals": ("mapping_deal",),
}


@router.get("/fields", response_model=FieldsCatalog)
async def list_importable_fields(
    _user: User = Depends(require_role(UserRole.admin)),
) -> FieldsCatalog:
    return FieldsCatalog(
        company=[FieldDescriptor(**f) for f in COMPANY_FIELDS],  # type: ignore[arg-type]
        contact=[FieldDescriptor(**f) for f in CONTACT_FIELDS],  # type: ignore[arg-type]
        deal=[FieldDescriptor(**f) for f in DEAL_FIELDS],  # type: ignore[arg-type]
    )


@router.get("/providers", response_model=ProvidersOut)
async def list_providers(
    _user: User = Depends(require_role(UserRole.admin)),
) -> ProvidersOut:
    """The wizard's "Odkud migrujete?" list. Per-file alias resolution is
    served by `POST /analyze`, which needs the header row."""
    return ProvidersOut(
        providers=[ProviderOut(key=p.key, label=p.label, roles=list(p.roles)) for p in PROVIDERS]
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
            raise _bad(f"file_specs_json[{idx}].role must be one of {sorted(_VALID_ROLES)}.")
        for required_key in _REQUIRED_MAPPINGS[str(role)]:
            if not isinstance(spec.get(required_key), dict):
                raise _bad(
                    f"file_specs_json[{idx}].{required_key} must be an object for role {role!r}."
                )
        out.append(spec)
    return out


def _parse_stage_mapping(raw: str | None) -> dict[str, uuid.UUID]:
    """Decode `{source stage value: our stage id}`.

    Passed as a JSON string form field, mirroring `file_specs_json` — the
    request is multipart because of the files, and nested JSON in multipart
    has no standard encoding.
    """
    if raw is None or not raw.strip():
        return {}
    try:
        decoded = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise _bad("stage_mapping_json must be a JSON object.") from exc
    if not isinstance(decoded, dict):
        raise _bad("stage_mapping_json must decode to a JSON object.")
    out: dict[str, uuid.UUID] = {}
    for source_value, stage_id in decoded.items():
        if stage_id in (None, ""):
            continue
        try:
            out[str(source_value)] = uuid.UUID(str(stage_id))
        except ValueError as exc:
            raise _bad(
                f"stage_mapping_json[{source_value!r}] is not a valid stage id: {stage_id!r}."
            ) from exc
    return out


def _stage_out(stage: StageInfo) -> ImportStageOut:
    return ImportStageOut(
        id=stage.id,
        name=stage.name,
        stage_type=stage.stage_type.value,
        position=stage.position,
        pipeline_id=stage.pipeline_id,
        pipeline_name=stage.pipeline_name,
        is_default_pipeline=stage.pipeline_is_default,
    )


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
            created_deal_ids=run.created_deal_ids,
            import_run_id=run.import_run_id,
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
        unmapped_stage_values=run.unmapped_stage_values,
        currency_mismatches=[
            CurrencyMismatchOut(currency=code, count=count)
            for code, count in sorted(run.currency_mismatches.items())
        ],
        org_currency=run.org_currency,
    )


async def _build_input(
    *,
    organization_id: uuid.UUID | None,
    files: list[UploadFile],
    file_specs_json: str,
    match_source: MatchSource | None,
    skip_unmatched: bool,
    bulk_owner_user_id: uuid.UUID | None,
    stage_mapping_json: str | None = None,
    provider: str | None = None,
    actor_user_id: uuid.UUID | None = None,
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
    deal_candidates: list[CandidateDeal] = []
    has_contact_side = False
    has_deal_side = False

    for idx, (file, spec) in enumerate(zip(files, specs, strict=True)):
        label = file.filename or f"file[{idx}]"
        blob = await file.read()
        try:
            parsed = parse_csv_bytes(blob)
        except CsvReadError as exc:
            raise _bad(f"{label}: {exc}") from exc

        # Process whichever mappings the spec carries; `_parse_file_specs`
        # already enforced the ones the role requires.
        if isinstance(spec.get("mapping_company"), dict):
            try:
                cleaned = validate_mapping(
                    spec["mapping_company"], side="company", headers=parsed.headers
                )
            except MappingError as exc:
                raise _bad(f"{label} (company): {exc}") from exc
            company_candidates.extend(apply_company_mapping(parsed.rows, cleaned))

        if isinstance(spec.get("mapping_contact"), dict):
            has_contact_side = True
            try:
                cleaned_c = validate_mapping(
                    spec["mapping_contact"], side="contact", headers=parsed.headers
                )
            except MappingError as exc:
                raise _bad(f"{label} (contact): {exc}") from exc
            match_key_contact = spec.get("match_key_contact")
            if match_key_contact is not None and match_key_contact not in parsed.headers:
                raise _bad(
                    f"{label}: match_key_contact "
                    f"{match_key_contact!r} is not a header in this file."
                )
            contact_candidates.extend(
                apply_contact_mapping(parsed.rows, cleaned_c, match_key_header=match_key_contact)
            )

        if isinstance(spec.get("mapping_deal"), dict):
            has_deal_side = True
            try:
                cleaned_d = validate_mapping(
                    spec["mapping_deal"], side="deal", headers=parsed.headers
                )
            except MappingError as exc:
                raise _bad(f"{label} (deal): {exc}") from exc
            deal_candidates.extend(apply_deal_mapping(parsed.rows, cleaned_d))

    if has_contact_side and match_source is None:
        raise _bad("match_source is required when any file has a contacts/combined role.")

    # `mode` is purely a label downstream — derive it from the role mix
    # for backwards-compatible logging / tests. The runner doesn't read it.
    mode: Literal["companies_only", "combined", "separate", "deals"]
    if has_deal_side and not has_contact_side and not company_candidates:
        mode = "deals"
    elif not has_contact_side:
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
        deal_candidates=deal_candidates,
        stage_mapping=_parse_stage_mapping(stage_mapping_json),
        # A label for the history list only. An unknown key degrades to
        # "generic" rather than 400-ing a 500-row migration over a caption.
        provider=(profile.key if (profile := get_provider(provider)) is not None else "generic"),
        actor_user_id=actor_user_id,
    )


@router.post("/preview", response_model=ImportPreviewOut)
async def preview_import(
    files: Annotated[list[UploadFile], File(...)],
    file_specs_json: Annotated[str, Form(...)],
    match_source: Annotated[MatchSource | None, Form()] = None,
    bulk_owner_user_id: Annotated[uuid.UUID | None, Form()] = None,
    stage_mapping_json: Annotated[str | None, Form()] = None,
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
        stage_mapping_json=stage_mapping_json,
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
    stage_mapping_json: Annotated[str | None, Form()] = None,
    provider: Annotated[str | None, Form()] = None,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
    rate_limiter: RateLimiter = Depends(get_import_rate_limiter),
) -> ImportCommitOut:
    """Write the import in one transaction and record it in the history.

    The `import_runs` row and every row it stamps land in the same
    transaction, so the response's `import_run_id` always points at a run that
    owns exactly the rows this call created.
    """
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
        stage_mapping_json=stage_mapping_json,
        provider=provider,
        actor_user_id=user.id,
    )
    try:
        run = await run_commit(session, payload)
    except ValueError as exc:
        raise _bad(str(exc)) from exc
    out = _to_out(run, commit=True)
    if not isinstance(out, ImportCommitOut):  # pragma: no cover - narrowing
        raise RuntimeError("commit returned wrong shape")
    return out


_ZERO_COUNTS: dict[str, int] = dict.fromkeys(ImportCountsOut.model_fields, 0)


def _counts_from_jsonb(raw: dict[str, Any]) -> ImportCountsOut:
    """`import_runs.counts` → the same shape preview/commit return.

    Defensive about the stored blob: a run written by an older build (or by a
    future one with extra counters) must still render in the history list.
    """
    known = {k: v for k, v in raw.items() if k in _ZERO_COUNTS and isinstance(v, int)}
    return ImportCountsOut(**{**_ZERO_COUNTS, **known})


def _run_out(run: ImportRun, actor: User | None) -> ImportRunOut:
    return ImportRunOut(
        id=run.id,
        provider=run.provider,
        status=run.status.value,
        created_at=run.created_at,
        created_by_user_id=run.user_id,
        created_by_name=actor.name if actor is not None else None,
        created_by_email=actor.email if actor is not None else None,
        counts=_counts_from_jsonb(run.counts or {}),
        undone_at=run.undone_at,
        undone_by_user_id=run.undone_by_user_id,
        undoable=run.status is ImportRunStatus.committed,
    )


@router.get("/runs", response_model=Page[ImportRunOut])
async def list_import_runs(
    pagination: PaginationParams = Depends(),
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> Page[ImportRunOut]:
    """Import history, newest first — the source for the wizard's history
    screen and its per-run undo button."""
    if user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin must belong to an organization to import data.",
        )
    base = select(ImportRun).where(ImportRun.organization_id == user.organization_id)
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    stmt = (
        select(ImportRun, User)
        .outerjoin(User, User.id == ImportRun.user_id)
        .where(ImportRun.organization_id == user.organization_id)
        # `id` breaks ties so two imports inside the same second paginate
        # deterministically.
        .order_by(ImportRun.created_at.desc(), ImportRun.id.desc())
        .limit(pagination.limit)
        .offset(pagination.offset)
    )
    rows = (await session.execute(stmt)).all()
    return Page[ImportRunOut](
        items=[_run_out(run, actor) for run, actor in rows],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.post("/runs/{run_id}/undo", response_model=ImportUndoOut)
async def undo_import(
    run_id: Annotated[uuid.UUID, Path()],
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> ImportUndoOut:
    """Delete what this import created — and only that.

    Rows the import **updated** are left exactly as the import left them: no
    before-image is stored, so there is nothing to restore. `updates_not_reverted`
    reports how many rows that covers.

    Anything worked on since the import survives too — edited rows, deals with
    meetings, entities with logged activity, and companies that still have
    contacts or deals hanging off them. Each is listed in `skipped_reasons`
    with a `code`, and the run ends as `partially_undone`.

    One transaction; 409 if the run has already been undone.
    """
    if user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin must belong to an organization to import data.",
        )
    # Row lock: two admins hitting undo at once must not both pass the status
    # check and double-delete (the second would find nothing, but would also
    # overwrite `undone_by_user_id` and report a bogus zero-delete success).
    run = await session.get(ImportRun, run_id, with_for_update=True)
    if run is None or run.organization_id != user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Import run not found.")
    if run.status is not ImportRunStatus.committed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This import has already been undone.",
        )

    stored_counts = dict(run.counts or {})
    outcome = await undo_import_run(session, run=run, actor_user_id=user.id)
    return ImportUndoOut(
        run_id=run_id,
        status=outcome.status.value,
        deleted=ImportUndoCountsOut(**outcome.deleted),
        skipped=ImportUndoCountsOut(**outcome.skipped),
        skipped_reasons=[
            ImportUndoSkipOut(
                entity_type=s.entity_type,
                entity_id=s.entity_id,
                name=s.name,
                code=s.code,
                message=s.message,
            )
            for s in outcome.skipped_reasons
        ],
        skipped_reasons_truncated=outcome.skipped_reasons_truncated,
        updates_not_reverted=ImportUndoCountsOut(**updates_not_reverted(stored_counts)),
    )


@router.post("/stage-suggestions", response_model=StageSuggestionsOut)
async def stage_suggestions(
    payload: StageSuggestionsIn,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> StageSuggestionsOut:
    """Fuzzy-match source stage names against the org's stages.

    Pure convenience for pre-filling the wizard's stage-mapping step — a
    `null` suggestion is not a default, it is "you must pick". Anything left
    unmapped blocks its rows at preview time.
    """
    if user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin must belong to an organization to import data.",
        )
    stages = await load_stages(session, user.organization_id)
    return StageSuggestionsOut(
        stages=[_stage_out(s) for s in stages],
        suggestions=suggest_stage_mapping(payload.values, stages),
    )


@router.post("/analyze", response_model=AnalyzeOut)
async def analyze_files(
    files: Annotated[list[UploadFile], File(...)],
    provider: Annotated[str | None, Form()] = None,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> AnalyzeOut:
    """Read only the header row (plus the stage column) of each upload and
    return everything the wizard needs to pre-fill its steps.

    Writes nothing and is not rate-limited: the admin will bounce between
    this and the mapping UI several times before ever calling `/preview`.
    """
    if user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin must belong to an organization to import data.",
        )
    if not files:
        raise _bad("At least one file is required.")

    parsed_files: list[tuple[str | None, list[str], list[dict[str, str]]]] = []
    all_headers: list[str] = []
    for idx, file in enumerate(files):
        blob = await file.read()
        try:
            parsed = parse_csv_bytes(blob)
        except CsvReadError as exc:
            raise _bad(f"{file.filename or f'file[{idx}]'}: {exc}") from exc
        parsed_files.append((file.filename, parsed.headers, parsed.rows))
        all_headers.extend(parsed.headers)

    profile = get_provider(provider) or detect_provider(all_headers)

    out_files: list[AnalyzedFileOut] = []
    stage_values: list[str] = []
    for filename, headers, rows in parsed_files:
        role = profile.detect_role(headers)
        # Offer a mapping for every side the detected role covers, plus the
        # sides a denormalized single-file export could also feed.
        sides = set(ROLE_SIDES.get(role, ())) if role is not None else set()
        if role == "deals":
            sides |= {"company", "contact"}
        if not sides:
            sides = {"company"}
        suggested: dict[str, dict[str, str]] = {
            side: profile.suggest_mapping(headers, side=side) for side in sorted(sides)
        }
        stage_header = profile.stage_header(headers) if "deal" in sides else None
        file_stage_values: list[str] = []
        if stage_header is not None:
            seen: dict[str, None] = {}
            for row in rows:
                cell = (row.get(stage_header) or "").strip()
                if cell:
                    seen.setdefault(cell, None)
            file_stage_values = list(seen)
            stage_values.extend(file_stage_values)
        out_files.append(
            AnalyzedFileOut(
                filename=filename,
                headers=headers,
                detected_role=role,
                suggested_mappings=suggested,
                suggested_match_key_contact=profile.suggest_match_key_contact(headers),
                stage_header=stage_header,
                stage_values=file_stage_values,
            )
        )

    stages = await load_stages(session, user.organization_id)
    distinct_stage_values = list(dict.fromkeys(stage_values))
    return AnalyzeOut(
        provider=profile.key,
        files=out_files,
        stages=[_stage_out(s) for s in stages],
        stage_suggestions=suggest_stage_mapping(distinct_stage_values, stages),
    )
