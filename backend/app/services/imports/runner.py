"""Orchestrate the parse → match → (preview | commit) pipeline.

The runner is the only layer that touches the database — keeping the
SQL in one file makes the unit tests on :mod:`mapping` and
:mod:`matcher` straightforward to write without a session fixture.

Preview and commit share the same parse + match + dedup + diff pipeline;
only the final write step differs. Both return :class:`ImportRunResult`
shape so the API layer can serialize either with the same Pydantic out
schema.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import BlockedCompany, Company, Contact
from app.services.imports.mapping import (
    CandidateCompany,
    CandidateContact,
    RowError,
)
from app.services.imports.matcher import (
    CompanyKey,
    MatchSource,
    match_contacts_to_companies,
)
from app.services.imports.owners import (
    OwnerResolutionError,
    OwnerResolver,
    ResolvedOwner,
)

MAX_DIFF_ENTRIES = 200
MAX_UNMATCHED_PREVIEW = 50

ImportMode = Literal["companies_only", "combined", "separate"]


@dataclass
class ImportInput:
    organization_id: uuid.UUID
    mode: ImportMode
    company_candidates: list[CandidateCompany]
    contact_candidates: list[CandidateContact]
    match_source: MatchSource | None
    skip_unmatched: bool = False


@dataclass
class UpdateDiff:
    row_index: int
    entity_type: Literal["company", "contact"]
    entity_id: uuid.UUID
    changes: dict[str, dict[str, str | None]]


@dataclass
class ImportRunResult:
    counts: dict[str, int]
    errors: list[RowError] = field(default_factory=list)
    unmatched: list[dict[str, str | int | None]] = field(default_factory=list)
    update_diffs: list[UpdateDiff] = field(default_factory=list)
    update_diffs_truncated: bool = False
    created_company_ids: list[uuid.UUID] = field(default_factory=list)
    updated_company_ids: list[uuid.UUID] = field(default_factory=list)
    created_contact_ids: list[uuid.UUID] = field(default_factory=list)
    updated_contact_ids: list[uuid.UUID] = field(default_factory=list)


async def _load_existing_companies(
    session: AsyncSession,
    organization_id: uuid.UUID,
    icos: set[str],
    names: set[str],
) -> tuple[dict[str, Company], dict[str, Company]]:
    """Return existing company rows keyed by IČO and by lowercased name.

    Pulled in one query each; both are bounded by the IČOs / names that
    actually appear in the incoming CSV so we never broadcast-scan
    the org's whole companies table.
    """
    by_ico: dict[str, Company] = {}
    by_name: dict[str, Company] = {}
    if icos:
        stmt = select(Company).where(
            Company.organization_id == organization_id,
            Company.ico.in_(icos),
        )
        for row in (await session.execute(stmt)).scalars():
            if row.ico:
                by_ico[row.ico] = row
    if names:
        # Lowercase comparison via SQL `lower()` so the index is bypassed
        # but the result is small (bounded by `names`).
        from sqlalchemy import func

        stmt = select(Company).where(
            Company.organization_id == organization_id,
            func.lower(Company.name).in_(names),
        )
        for row in (await session.execute(stmt)).scalars():
            by_name[row.name.lower()] = row
    return by_ico, by_name


async def _load_blocked_icos(
    session: AsyncSession, organization_id: uuid.UUID, icos: set[str]
) -> set[str]:
    if not icos:
        return set()
    stmt = select(BlockedCompany.ico).where(
        BlockedCompany.organization_id == organization_id,
        BlockedCompany.ico.in_(icos),
    )
    return set((await session.execute(stmt)).scalars().all())


async def _load_owner_counts(
    session: AsyncSession,
    organization_id: uuid.UUID,
    user_ids: set[uuid.UUID],
) -> dict[uuid.UUID, int]:
    """Current company counts per owner. Caller passes the set of users
    actually referenced by the import so we don't broadcast-count the
    whole users table."""
    if not user_ids:
        return {}
    stmt = (
        select(Company.owner_user_id, func.count(Company.id))
        .where(
            Company.organization_id == organization_id,
            Company.owner_user_id.in_(user_ids),
        )
        .group_by(Company.owner_user_id)
    )
    rows = (await session.execute(stmt)).all()
    return {uid: count for uid, count in rows if uid is not None}


async def _load_existing_contacts(
    session: AsyncSession, organization_id: uuid.UUID, emails: set[str]
) -> dict[str, Contact]:
    if not emails:
        return {}
    stmt = select(Contact).where(
        Contact.organization_id == organization_id,
        Contact.email.in_(emails),
    )
    return {row.email: row for row in (await session.execute(stmt)).scalars() if row.email}


def _company_dedup(
    candidates: list[CandidateCompany],
) -> tuple[list[CandidateCompany], list[RowError]]:
    """First occurrence of each `dedup_key` wins.

    Subsequent rows with the same key are still returned (so their errors
    propagate) but tagged with a ``duplicate_in_file`` row error and
    marked unusable by appending the error — the runner then skips any
    candidate that carries a ``duplicate_in_file`` code.
    """
    seen: set[str] = set()
    errors: list[RowError] = []
    kept: list[CandidateCompany] = []
    for cand in candidates:
        if cand.dedup_key and cand.dedup_key in seen:
            err = RowError(
                row_index=cand.row_index,
                side="company",
                field=None,
                code="duplicate_in_file",
                message=f"Duplicate of an earlier row with key {cand.dedup_key!r}.",
            )
            cand.errors.append(err)
            errors.append(err)
            continue
        if cand.dedup_key:
            seen.add(cand.dedup_key)
        kept.append(cand)
    return kept, errors


def _diff_company(
    existing: Company, incoming: dict[str, str | None]
) -> dict[str, dict[str, str | None]]:
    """Per-field diff `{field: {from, to}}`.

    Skips fields where the incoming cell is empty AND the existing value
    is non-empty — the import spec requires we never wipe a real value
    with a blank CSV cell.
    """
    diff: dict[str, dict[str, str | None]] = {}
    for field_name, new_value in incoming.items():
        old_value = getattr(existing, field_name, None)
        if new_value is None and old_value not in (None, ""):
            continue
        # Normalize to string-or-None for comparison; both sides are
        # already strings in practice.
        old_norm = str(old_value) if old_value is not None else None
        new_norm = new_value if new_value is not None else None
        if old_norm == new_norm:
            continue
        diff[field_name] = {"from": old_norm, "to": new_norm}
    return diff


async def _run_pipeline(
    session: AsyncSession,
    payload: ImportInput,
    *,
    do_write: bool,
) -> ImportRunResult:
    result = ImportRunResult(
        counts={
            "companies_to_create": 0,
            "companies_to_update": 0,
            "contacts_to_create": 0,
            "contacts_to_update": 0,
            "invalid_rows": 0,
            "unmatched_contacts": 0,
        }
    )

    # ---- Companies ----
    # Surface mapping-time errors (`required_missing`, `invalid_format`,
    # `too_long`) before dedup so the admin sees them even on rows that
    # later collide on key.
    for company_cand in payload.company_candidates:
        result.errors.extend(company_cand.errors)
    deduped_companies, dedup_errors = _company_dedup(payload.company_candidates)
    result.errors.extend(dedup_errors)

    icos_in_file: set[str] = {
        ico for c in deduped_companies if (ico := c.fields.get("ico")) is not None
    }
    names_in_file: set[str] = {
        name.lower() for c in deduped_companies if (name := c.fields.get("name")) is not None
    }
    existing_by_ico, existing_by_name = await _load_existing_companies(
        session, payload.organization_id, icos_in_file, names_in_file
    )
    blocked = await _load_blocked_icos(session, payload.organization_id, icos_in_file)

    # Resolve owner cells once per import. Only build the resolver when
    # at least one candidate references the owner column — keeps the cost
    # at zero for the common "no owner mapping" path.
    owner_resolver: OwnerResolver | None = None
    if any(cand.owner_raw for cand in deduped_companies):
        owner_resolver = await OwnerResolver.from_org(session, payload.organization_id)

    # Per-batch cap tracking: `assignments[user_id] = how many NEW
    # companies this batch is about to add to that owner's total`. We
    # only count *additional* assignments — re-assigning a user to a
    # company they already own is a no-op for the cap.
    owner_assignments: dict[int, ResolvedOwner] = {}
    referenced_user_ids: set[uuid.UUID] = set()
    for cand_idx, cand in enumerate(deduped_companies):
        if not cand.owner_raw or owner_resolver is None:
            continue
        resolved = owner_resolver.resolve(cand.owner_raw)
        if isinstance(resolved, OwnerResolutionError):
            err = RowError(
                row_index=cand.row_index,
                side="company",
                field="owner",
                code=resolved.code,
                message=resolved.message,
            )
            cand.errors.append(err)
            result.errors.append(err)
            continue
        owner_assignments[cand_idx] = resolved
        referenced_user_ids.add(resolved.user_id)

    existing_counts = await _load_owner_counts(
        session, payload.organization_id, referenced_user_ids
    )
    batch_increments: dict[uuid.UUID, int] = {}

    # Decide create vs update per candidate; build update-diff list.
    # Any mapping-time error (required_missing, invalid_format, too_long)
    # disqualifies the row from create/update — the DB write would either
    # fail or silently store garbage. The errors themselves are already
    # in `result.errors` so the admin sees them in the preview report.
    company_index_to_existing: dict[int, Company] = {}
    company_index_to_new_owner: dict[int, uuid.UUID] = {}
    blocking_codes = {
        "required_missing",
        "invalid_format",
        "too_long",
        "owner_unknown",
        "owner_ambiguous",
        "owner_inactive",
        "owner_cap_reached",
    }
    for cand_idx, company_cand in enumerate(deduped_companies):
        if any(e.code in blocking_codes for e in company_cand.errors):
            result.counts["invalid_rows"] += 1
            continue
        ico = company_cand.fields.get("ico")
        if ico and ico in blocked:
            company_cand.errors.append(
                RowError(
                    row_index=company_cand.row_index,
                    side="company",
                    field="ico",
                    code="ico_blocked",
                    message="This IČO is on the organization's blocked list.",
                )
            )
            result.errors.append(company_cand.errors[-1])
            result.counts["invalid_rows"] += 1
            continue
        existing_company: Company | None = (existing_by_ico.get(ico) if ico else None) or (
            existing_by_name.get((company_cand.fields.get("name") or "").lower())
        )

        # Cap check (only when the row actually changes the owner). We
        # do this before recording the diff so a cap failure here flips
        # the row to invalid without leaving a phantom "to_update" entry.
        resolved_owner = owner_assignments.get(cand_idx)
        if resolved_owner is not None:
            current_owner_id = (
                existing_company.owner_user_id if existing_company is not None else None
            )
            if current_owner_id != resolved_owner.user_id:
                cap = resolved_owner.max_owned_companies
                if cap is not None:
                    projected = (
                        existing_counts.get(resolved_owner.user_id, 0)
                        + batch_increments.get(resolved_owner.user_id, 0)
                        + 1
                    )
                    if projected > cap:
                        err = RowError(
                            row_index=company_cand.row_index,
                            side="company",
                            field="owner",
                            code="owner_cap_reached",
                            message=(f"Obchodník by překročil limit ({cap}) vlastněných firem."),
                        )
                        company_cand.errors.append(err)
                        result.errors.append(err)
                        result.counts["invalid_rows"] += 1
                        continue
                batch_increments[resolved_owner.user_id] = (
                    batch_increments.get(resolved_owner.user_id, 0) + 1
                )
                company_index_to_new_owner[cand_idx] = resolved_owner.user_id

        if existing_company is not None:
            company_index_to_existing[cand_idx] = existing_company
            diff = _diff_company(existing_company, company_cand.fields)
            if cand_idx in company_index_to_new_owner:
                diff_new_owner = company_index_to_new_owner[cand_idx]
                old_owner_id = existing_company.owner_user_id
                diff["owner_user_id"] = {
                    "from": str(old_owner_id) if old_owner_id is not None else None,
                    "to": str(diff_new_owner),
                }
            if diff:
                if len(result.update_diffs) < MAX_DIFF_ENTRIES:
                    result.update_diffs.append(
                        UpdateDiff(
                            row_index=company_cand.row_index,
                            entity_type="company",
                            entity_id=existing_company.id,
                            changes=diff,
                        )
                    )
                else:
                    result.update_diffs_truncated = True
                result.counts["companies_to_update"] += 1
        else:
            result.counts["companies_to_create"] += 1

    # ---- Contacts (skip in companies-only mode) ----
    for contact_cand in payload.contact_candidates:
        result.errors.extend(contact_cand.errors)
        if any(e.code in blocking_codes for e in contact_cand.errors):
            result.counts["invalid_rows"] += 1
    contacts_for_matcher = [
        c for c in payload.contact_candidates if not any(e.code in blocking_codes for e in c.errors)
    ]

    matcher_existing_by_ico = {ico: row.id for ico, row in existing_by_ico.items()}
    matcher_existing_by_name = {name: row.id for name, row in existing_by_name.items()}
    matcher_result = match_contacts_to_companies(
        contacts=contacts_for_matcher,
        company_candidates=deduped_companies,
        existing_companies_by_ico=matcher_existing_by_ico,
        existing_companies_by_name=matcher_existing_by_name,
        match_source=payload.match_source,
    )
    result.errors.extend(matcher_result.errors)

    # Existing-contact lookup by email (so we count "update" for contacts).
    contact_emails: set[str] = {
        email
        for c in contacts_for_matcher
        if (email := c.fields.get("email")) is not None and c.row_index in matcher_result.matches
    }
    existing_contacts = await _load_existing_contacts(
        session, payload.organization_id, contact_emails
    )

    contact_targets: dict[int, tuple[CandidateContact, CompanyKey | None]] = {}
    for contact in contacts_for_matcher:
        match = matcher_result.matches.get(contact.row_index)
        if match is None:
            result.counts["unmatched_contacts"] += 1
            if len(result.unmatched) < MAX_UNMATCHED_PREVIEW:
                result.unmatched.append(
                    {
                        "row_index": contact.row_index,
                        "first_name": contact.fields.get("first_name"),
                        "last_name": contact.fields.get("last_name"),
                        "match_key_value": contact.match_key_value,
                    }
                )
            if payload.skip_unmatched:
                continue
            # When `skip_unmatched=false`, we still don't write unmatched
            # contacts at commit time — a contact without a company would
            # violate downstream expectations. The flag controls whether
            # the unmatched count is treated as a "soft" outcome (skip,
            # no error) or a "hard" one (report in errors). The error is
            # already in `result.errors` via the matcher.
            continue
        contact_targets[contact.row_index] = (contact, match)
        email = contact.fields.get("email")
        if email and email in existing_contacts:
            result.counts["contacts_to_update"] += 1
        else:
            result.counts["contacts_to_create"] += 1

    if not do_write:
        return result

    # ---- Write phase ----
    # Companies first so contact FKs resolve.
    candidate_index_to_company_id: dict[int, uuid.UUID] = {}
    write_skip_codes = {
        "required_missing",
        "invalid_format",
        "too_long",
        "ico_blocked",
        "owner_unknown",
        "owner_ambiguous",
        "owner_inactive",
        "owner_cap_reached",
    }
    for cand_idx, cand in enumerate(deduped_companies):
        if any(e.code in write_skip_codes for e in cand.errors):
            continue
        existing = company_index_to_existing.get(cand_idx)
        new_owner_id: uuid.UUID | None = company_index_to_new_owner.get(cand_idx)
        if existing is not None:
            # Honor the "never overwrite a non-empty field with a blank
            # cell" rule (mirrors `_diff_company` so the diff matches
            # what is actually written).
            for field_name, new_value in cand.fields.items():
                if new_value is None and getattr(existing, field_name, None) not in (
                    None,
                    "",
                ):
                    continue
                setattr(existing, field_name, new_value)
            if new_owner_id is not None:
                existing.owner_user_id = new_owner_id
            candidate_index_to_company_id[cand_idx] = existing.id
            if existing.id not in result.updated_company_ids:
                result.updated_company_ids.append(existing.id)
        else:
            create_fields = {k: v for k, v in cand.fields.items() if v is not None}
            company = Company(
                organization_id=payload.organization_id,
                owner_user_id=new_owner_id,
                **create_fields,
            )
            session.add(company)
            await session.flush()
            candidate_index_to_company_id[cand_idx] = company.id
            result.created_company_ids.append(company.id)

    # Contacts.
    for _row_index, (contact, match) in contact_targets.items():
        if match is None:
            continue
        if match.existing_company_id is not None:
            company_id: uuid.UUID = match.existing_company_id
        elif (
            match.company_index is not None and match.company_index in candidate_index_to_company_id
        ):
            company_id = candidate_index_to_company_id[match.company_index]
        else:
            # Match resolved to a file row that itself failed validation
            # — drop this contact so the FK doesn't dangle.
            continue
        email = contact.fields.get("email")
        existing_contact = existing_contacts.get(email) if email else None
        if existing_contact is not None:
            for field_name, new_value in contact.fields.items():
                if new_value is None and getattr(existing_contact, field_name, None) not in (
                    None,
                    "",
                ):
                    continue
                setattr(existing_contact, field_name, new_value)
            existing_contact.company_id = company_id
            if existing_contact.id not in result.updated_contact_ids:
                result.updated_contact_ids.append(existing_contact.id)
        else:
            new_contact = Contact(
                organization_id=payload.organization_id,
                company_id=company_id,
                **{k: v for k, v in contact.fields.items() if v is not None},
            )
            session.add(new_contact)
            await session.flush()
            result.created_contact_ids.append(new_contact.id)

    await session.commit()
    return result


async def run_preview(session: AsyncSession, payload: ImportInput) -> ImportRunResult:
    return await _run_pipeline(session, payload, do_write=False)


async def run_commit(session: AsyncSession, payload: ImportInput) -> ImportRunResult:
    return await _run_pipeline(session, payload, do_write=True)
