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
from datetime import UTC, datetime
from decimal import Decimal
from typing import Literal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    BlockedCompany,
    Company,
    Contact,
    Deal,
    ImportRun,
    ImportRunStatus,
    Organization,
)
from app.services.imports.mapping import (
    CandidateCompany,
    CandidateContact,
    CandidateDeal,
    RowError,
)
from app.services.imports.matcher import (
    CompanyKey,
    MatchSource,
    match_contacts_to_companies,
    normalize_match_key,
)
from app.services.imports.normalize import normalize_text
from app.services.imports.owners import (
    OwnerResolutionError,
    OwnerResolver,
    ResolvedOwner,
)
from app.services.imports.stages import (
    ResolvedDealState,
    StageResolver,
    load_stages,
)

MAX_DIFF_ENTRIES = 200
MAX_UNMATCHED_PREVIEW = 50

ImportMode = Literal["companies_only", "combined", "separate", "deals"]

# Row-error codes that disqualify a row from being written. Shared by the
# company, contact and deal phases — anything not listed here is a warning
# that still lets the row through (e.g. `date_unparsed`, `contact_unmatched`).
BLOCKING_CODES = frozenset(
    {
        "required_missing",
        "invalid_format",
        "too_long",
        "owner_unknown",
        "owner_ambiguous",
        "owner_inactive",
        "owner_cap_reached",
        "company_missing",
        "stage_unmapped",
        "stage_unknown",
        "status_unknown",
        "no_open_stage",
        "no_won_stage",
    }
)


@dataclass
class ImportInput:
    organization_id: uuid.UUID
    mode: ImportMode
    company_candidates: list[CandidateCompany]
    contact_candidates: list[CandidateContact]
    match_source: MatchSource | None
    skip_unmatched: bool = False
    # When set, every successfully-mapped company is assigned to this
    # user, overriding any per-row "owner" cell. Use case: admin uploads
    # a fresh prospect list and wants the whole batch on one rep.
    # Cap arithmetic still applies — a bulk assign that busts the cap
    # fails the offending row, not the whole import.
    bulk_owner_user_id: uuid.UUID | None = None
    deal_candidates: list[CandidateDeal] = field(default_factory=list)
    # `{source stage value: our stage id}`. Supplied by the caller (the
    # wizard pre-fills it from `suggest_stage_mapping`). Any non-empty stage
    # cell missing from this map blocks its row — never a silent default.
    stage_mapping: dict[str, uuid.UUID] = field(default_factory=dict)
    # Recorded on the `import_runs` row a commit creates, so the history list
    # can say "Pipedrive, ran by Jana". Preview ignores both.
    provider: str = "generic"
    actor_user_id: uuid.UUID | None = None


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
    created_deal_ids: list[uuid.UUID] = field(default_factory=list)
    # The `import_runs` row this commit created; `None` for a preview. Every
    # created row above carries it in `import_run_id`.
    import_run_id: uuid.UUID | None = None
    # Distinct source stage values with no entry in `stage_mapping`. The
    # wizard highlights exactly these in the stage-mapping step.
    unmapped_stage_values: list[str] = field(default_factory=list)
    # `{currency code: how many deals carry it}` for currencies that differ
    # from the org's. Warn once with a count; never invent an FX rate.
    currency_mismatches: dict[str, int] = field(default_factory=dict)
    org_currency: str | None = None


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


@dataclass
class _DealPlan:
    """One deal, fully resolved except for ids that only exist after the
    write phase has flushed its companies/contacts."""

    candidate: CandidateDeal
    state: ResolvedDealState
    currency: str
    company_existing_id: uuid.UUID | None = None
    company_candidate_index: int | None = None
    auto_company_key: str | None = None
    contact_existing_id: uuid.UUID | None = None
    contact_candidate_row: int | None = None
    owner_user_id: uuid.UUID | None = None


def _resolve_plan_company_id(
    plan: _DealPlan,
    *,
    candidate_index_to_company_id: dict[int, uuid.UUID],
    auto_company_ids: dict[str, uuid.UUID],
) -> uuid.UUID | None:
    if plan.company_existing_id is not None:
        return plan.company_existing_id
    if plan.company_candidate_index is not None:
        return candidate_index_to_company_id.get(plan.company_candidate_index)
    if plan.auto_company_key is not None:
        return auto_company_ids.get(plan.auto_company_key)
    return None


def _contact_name_key(first: str | None, last: str | None) -> str:
    return normalize_text(f"{first or ''} {last or ''}")


async def _load_contacts_for_deals(
    session: AsyncSession,
    organization_id: uuid.UUID,
    emails: set[str],
    name_keys: set[str],
) -> tuple[dict[str, list[Contact]], dict[str, list[Contact]]]:
    """Contacts a deal row might be pointing at, indexed by e-mail and by
    normalized full name.

    Bounded by the values that actually appear in the deals file — the name
    filter is applied in Python because the normalized form (diacritics
    folded) has no SQL equivalent we want to index for.
    """
    if not emails and not name_keys:
        return {}, {}
    clauses = []
    if emails:
        clauses.append(func.lower(Contact.email).in_(emails))
    if name_keys:
        # Cheap pre-filter on the surname so a big contacts table is not
        # scanned wholesale; the exact match happens on the folded key.
        surnames = {k.rsplit(" ", 1)[-1] for k in name_keys if k}
        clauses.append(func.lower(Contact.last_name).in_(surnames))
    stmt = select(Contact).where(
        Contact.organization_id == organization_id,
        or_(*clauses),
    )
    rows = list((await session.execute(stmt)).scalars())
    by_email: dict[str, list[Contact]] = {}
    by_name: dict[str, list[Contact]] = {}
    for row in rows:
        if row.email:
            by_email.setdefault(row.email.lower(), []).append(row)
        by_name.setdefault(_contact_name_key(row.first_name, row.last_name), []).append(row)
    return by_email, by_name


async def _plan_deals(
    session: AsyncSession,
    payload: ImportInput,
    result: ImportRunResult,
    *,
    existing_companies_by_name: dict[str, Company],
    company_candidates: list[CandidateCompany],
    contact_targets: dict[int, tuple[CandidateContact, CompanyKey | None]],
    owner_resolver: OwnerResolver | None,
    bulk_owner: ResolvedOwner | None,
) -> tuple[list[_DealPlan], dict[str, str]]:
    """Resolve every deal row against stages, companies, contacts and owners.

    Deliberate omission: **no `activities` rows are recorded.** The app's own
    `mark-won` / `mark-lost` handlers write a `deal_won` / `deal_lost`
    activity, but a 500-deal migration would push 500 fabricated timeline
    entries all stamped with the import date, drowning the real history in
    the activity feed and the "recent activity" widgets. Same reasoning for
    `Company.last_order_at` / `ownership_expires_at`, which `mark-won`
    refreshes: back-dating the auto-free clock from historical deals would
    either extend or expire ownership for reasons the admin never asked for.

    Deals are always **created**, never updated: without a persisted
    external-id column (phase 2) there is no natural key to match an
    existing deal on, and deal names are not unique.
    """
    import_now = datetime.now(tz=UTC)
    stages = await load_stages(session, payload.organization_id)
    resolver = StageResolver(
        stages=stages,
        stage_mapping=payload.stage_mapping,
        import_now=import_now,
    )
    unknown_stage_ids = set(payload.stage_mapping.values()) - resolver.stage_ids
    if unknown_stage_ids:
        nice = ", ".join(sorted(str(i) for i in unknown_stage_ids))
        raise ValueError(f"stage_mapping references stages outside this organization: {nice}")

    result.unmapped_stage_values = resolver.unmapped_values(
        d.stage_raw or "" for d in payload.deal_candidates
    )

    org = await session.get(Organization, payload.organization_id)
    org_currency = org.currency if org is not None else "CZK"
    result.org_currency = org_currency

    # In-file company index: normalized name -> candidate position. A
    # candidate that already resolves to a DB row is handled by the
    # existing-company branch, so only genuinely new rows land here.
    candidate_by_name: dict[str, int] = {}
    for company_idx, company_cand in enumerate(company_candidates):
        key = normalize_match_key(company_cand.fields.get("name") or "", source="name")
        if key and key not in candidate_by_name:
            candidate_by_name[key] = company_idx

    # In-file contact index, restricted to contacts that actually matched a
    # company (those are the only ones that will be written).
    file_contacts_by_email: dict[str, list[int]] = {}
    file_contacts_by_name: dict[str, list[int]] = {}
    contact_company_ref: dict[int, CompanyKey | None] = {}
    for row_index, (contact, match) in contact_targets.items():
        contact_company_ref[row_index] = match
        email = (contact.fields.get("email") or "").lower()
        if email:
            file_contacts_by_email.setdefault(email, []).append(row_index)
        name_key = _contact_name_key(
            contact.fields.get("first_name"), contact.fields.get("last_name")
        )
        if name_key:
            file_contacts_by_name.setdefault(name_key, []).append(row_index)

    deal_emails = {
        raw.lower()
        for d in payload.deal_candidates
        if (raw := (d.contact_raw or "").strip()) and "@" in raw
    }
    deal_name_keys = {
        normalize_text(raw)
        for d in payload.deal_candidates
        if (raw := (d.contact_raw or "").strip()) and "@" not in raw
    }
    db_contacts_by_email, db_contacts_by_name = await _load_contacts_for_deals(
        session, payload.organization_id, deal_emails, deal_name_keys
    )

    plans: list[_DealPlan] = []
    auto_companies: dict[str, str] = {}
    seen_external_ids: set[str] = set()

    for cand in payload.deal_candidates:
        result.errors.extend(cand.errors)
        errors: list[RowError] = []

        if cand.external_id:
            if cand.external_id in seen_external_ids:
                errors.append(
                    RowError(
                        row_index=cand.row_index,
                        side="deal",
                        field="external_id",
                        code="duplicate_in_file",
                        message=f"Obchod s ID {cand.external_id!r} je v souboru vícekrát.",
                    )
                )
            seen_external_ids.add(cand.external_id)

        state, stage_errors = resolver.resolve(
            row_index=cand.row_index,
            stage_raw=cand.stage_raw,
            status_raw=cand.status_raw,
            lost_reason_raw=cand.lost_reason_raw,
            won_time=cand.won_time,
            lost_time=cand.lost_time,
            closed_on=cand.closed_on,
        )
        errors.extend(stage_errors)

        # Company link — mandatory (`deals.company_id` is NOT NULL).
        company_key = normalize_match_key(cand.company_raw or "", source="name")
        existing_company_id: uuid.UUID | None = None
        candidate_index: int | None = None
        auto_key: str | None = None
        if not company_key:
            errors.append(
                RowError(
                    row_index=cand.row_index,
                    side="deal",
                    field="company",
                    code="company_missing",
                    message="Obchod nemá firmu — obchod bez firmy nelze uložit.",
                )
            )
        else:
            existing = existing_companies_by_name.get(company_key)
            if existing is not None:
                existing_company_id = existing.id
            else:
                file_idx = candidate_by_name.get(company_key)
                if file_idx is not None and not any(
                    e.code in BLOCKING_CODES or e.code == "ico_blocked"
                    for e in company_candidates[file_idx].errors
                ):
                    candidate_index = file_idx
                else:
                    # Registered only once the row is known good — a blocked
                    # deal must not leave an orphan company behind.
                    auto_key = company_key

        # Owner — same codes and same blocking semantics as the company side.
        owner_user_id: uuid.UUID | None = None
        if bulk_owner is not None:
            owner_user_id = bulk_owner.user_id
        elif cand.owner_raw and owner_resolver is not None:
            resolved = owner_resolver.resolve(cand.owner_raw)
            if isinstance(resolved, OwnerResolutionError):
                errors.append(
                    RowError(
                        row_index=cand.row_index,
                        side="deal",
                        field="owner",
                        code=resolved.code,
                        message=resolved.message,
                    )
                )
            else:
                owner_user_id = resolved.user_id

        cand.errors.extend(errors)
        result.errors.extend(errors)
        if state is None or any(e.code in BLOCKING_CODES for e in cand.errors):
            result.counts["invalid_rows"] += 1
            continue

        if auto_key is not None and auto_key not in auto_companies:
            auto_companies[auto_key] = (cand.company_raw or "").strip()[:200]
            result.counts["companies_from_deals_to_create"] += 1

        # Contact link — optional (`deals.primary_contact_id` is nullable),
        # so every failure below is a warning, never a blocked row.
        contact_existing_id, contact_candidate_row = _resolve_deal_contact(
            cand,
            errors_sink=result.errors,
            db_contacts_by_email=db_contacts_by_email,
            db_contacts_by_name=db_contacts_by_name,
            file_contacts_by_email=file_contacts_by_email,
            file_contacts_by_name=file_contacts_by_name,
            contact_company_ref=contact_company_ref,
            company_existing_id=existing_company_id,
            company_candidate_index=candidate_index,
        )

        currency = cand.currency or org_currency
        if cand.currency and cand.currency != org_currency:
            result.currency_mismatches[cand.currency] = (
                result.currency_mismatches.get(cand.currency, 0) + 1
            )

        plans.append(
            _DealPlan(
                candidate=cand,
                state=state,
                currency=currency,
                company_existing_id=existing_company_id,
                company_candidate_index=candidate_index,
                auto_company_key=auto_key,
                contact_existing_id=contact_existing_id,
                contact_candidate_row=contact_candidate_row,
                owner_user_id=owner_user_id,
            )
        )
        result.counts["deals_to_create"] += 1

    return plans, auto_companies


def _resolve_deal_contact(
    cand: CandidateDeal,
    *,
    errors_sink: list[RowError],
    db_contacts_by_email: dict[str, list[Contact]],
    db_contacts_by_name: dict[str, list[Contact]],
    file_contacts_by_email: dict[str, list[int]],
    file_contacts_by_name: dict[str, list[int]],
    contact_company_ref: dict[int, CompanyKey | None],
    company_existing_id: uuid.UUID | None,
    company_candidate_index: int | None,
) -> tuple[uuid.UUID | None, int | None]:
    """`Deal - Contact person` → an existing contact id or an in-file row.

    E-mail wins when the cell has one (it is unique per org, so no company
    scoping needed). A bare name is only matched **within the deal's
    company** — full names repeat often enough across a customer base that a
    global name match would attach deals to strangers.
    """
    raw = (cand.contact_raw or "").strip()
    if not raw:
        return None, None

    def warn(code: str, message: str) -> tuple[None, None]:
        errors_sink.append(
            RowError(
                row_index=cand.row_index, side="deal", field="contact", code=code, message=message
            )
        )
        return None, None

    if "@" in raw:
        key = raw.lower()
        db_hits = db_contacts_by_email.get(key, [])
        if len(db_hits) == 1:
            return db_hits[0].id, None
        if len(db_hits) > 1:
            return warn("contact_ambiguous", f"E-mail {raw!r} má víc kontaktů.")
        file_hits = file_contacts_by_email.get(key, [])
        if len(file_hits) == 1:
            return None, file_hits[0]
        if len(file_hits) > 1:
            return warn("contact_ambiguous", f"E-mail {raw!r} má víc kontaktů v souboru.")
        return warn(
            "contact_unmatched", f"Kontakt {raw!r} nenalezen — obchod zůstane bez kontaktu."
        )

    key = normalize_text(raw)

    def same_company(ref: CompanyKey | None) -> bool:
        if ref is None:
            return False
        if company_existing_id is not None:
            return ref.existing_company_id == company_existing_id
        if company_candidate_index is not None:
            return ref.company_index == company_candidate_index
        return False

    db_named = [
        row
        for row in db_contacts_by_name.get(key, [])
        if company_existing_id is not None and row.company_id == company_existing_id
    ]
    if len(db_named) == 1:
        return db_named[0].id, None
    if len(db_named) > 1:
        return warn("contact_ambiguous", f"Jméno {raw!r} má víc kontaktů u této firmy.")

    file_named = [
        row_index
        for row_index in file_contacts_by_name.get(key, [])
        if same_company(contact_company_ref.get(row_index))
    ]
    if len(file_named) == 1:
        return None, file_named[0]
    if len(file_named) > 1:
        return warn("contact_ambiguous", f"Jméno {raw!r} má víc kontaktů v souboru.")
    return warn("contact_unmatched", f"Kontakt {raw!r} nenalezen — obchod zůstane bez kontaktu.")


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
            "deals_to_create": 0,
            "companies_from_deals_to_create": 0,
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
    # Resolve firms referenced only by contacts' keys too, so a contacts-only
    # import can attach to companies that already exist in the DB.
    contact_keys: set[str] = {
        key for c in payload.contact_candidates if (key := (c.match_key_value or "").strip())
    }
    icos_to_resolve = set(icos_in_file)
    names_to_resolve = set(names_in_file)
    if payload.match_source == "ico":
        icos_to_resolve |= contact_keys
    elif payload.match_source == "name":
        names_to_resolve |= {k.lower() for k in contact_keys}
    # Deals link to their company by NAME (research §6: Pipedrive exports
    # carry names, not ids), so pull those firms into the same lookup — a
    # deals-only file must be able to attach to companies already in the DB.
    names_to_resolve |= {
        key
        for d in payload.deal_candidates
        if (key := normalize_match_key(d.company_raw or "", source="name"))
    }
    existing_by_ico, existing_by_name = await _load_existing_companies(
        session, payload.organization_id, icos_to_resolve, names_to_resolve
    )
    blocked = await _load_blocked_icos(session, payload.organization_id, icos_in_file)

    # Resolve owner cells once per import. Build the resolver if either
    # any candidate references the owner column OR the admin selected a
    # bulk owner — both paths funnel through the same cap arithmetic.
    needs_resolver = (
        payload.bulk_owner_user_id is not None
        or any(cand.owner_raw for cand in deduped_companies)
        or any(deal.owner_raw for deal in payload.deal_candidates)
    )
    owner_resolver: OwnerResolver | None = None
    if needs_resolver:
        owner_resolver = await OwnerResolver.from_org(session, payload.organization_id)

    # If a bulk owner was set, resolve it once up front. A bogus user id
    # is a configuration error from the wizard, not a per-row error —
    # the API layer surfaces it as a 400 instead of poisoning every row.
    bulk_owner: ResolvedOwner | None = None
    if payload.bulk_owner_user_id is not None and owner_resolver is not None:
        bulk_resolution = owner_resolver.get_by_id(payload.bulk_owner_user_id)
        if isinstance(bulk_resolution, OwnerResolutionError):
            raise ValueError(
                f"bulk_owner_user_id {payload.bulk_owner_user_id}: {bulk_resolution.message}"
            )
        bulk_owner = bulk_resolution

    # Per-batch cap tracking: `assignments[user_id] = how many NEW
    # companies this batch is about to add to that owner's total`. We
    # only count *additional* assignments — re-assigning a user to a
    # company they already own is a no-op for the cap.
    # Bulk-assign wins over per-row owner cells: when both are set, the
    # bulk choice applies and per-row cells are ignored (no error — we
    # treat the bulk picker as the explicit override).
    owner_assignments: dict[int, ResolvedOwner] = {}
    referenced_user_ids: set[uuid.UUID] = set()
    for cand_idx, cand in enumerate(deduped_companies):
        if bulk_owner is not None:
            owner_assignments[cand_idx] = bulk_owner
            referenced_user_ids.add(bulk_owner.user_id)
            continue
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
    blocking_codes = BLOCKING_CODES
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
    # A candidate that updates an existing firm is that firm — let the matcher
    # collapse the two so a contact keyed to it doesn't read as ambiguous.
    candidate_existing_ids: dict[int, uuid.UUID] = {}
    for cand_idx, cand in enumerate(deduped_companies):
        ico = cand.fields.get("ico")
        existing = (existing_by_ico.get(ico) if ico else None) or existing_by_name.get(
            (cand.fields.get("name") or "").lower()
        )
        if existing is not None:
            candidate_existing_ids[cand_idx] = existing.id
    matcher_result = match_contacts_to_companies(
        contacts=contacts_for_matcher,
        company_candidates=deduped_companies,
        existing_companies_by_ico=matcher_existing_by_ico,
        existing_companies_by_name=matcher_existing_by_name,
        match_source=payload.match_source,
        candidate_existing_ids=candidate_existing_ids,
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

    # ---- Deals ----
    deal_plans: list[_DealPlan] = []
    auto_companies: dict[str, str] = {}
    if payload.deal_candidates:
        deal_plans, auto_companies = await _plan_deals(
            session,
            payload,
            result,
            existing_companies_by_name=existing_by_name,
            company_candidates=deduped_companies,
            contact_targets=contact_targets,
            owner_resolver=owner_resolver,
            bulk_owner=bulk_owner,
        )

    if not do_write:
        return result

    # ---- Write phase ----
    # The `import_runs` row is created first so every INSERT below can carry
    # its id, and it lives in the same transaction as the rows it stamps: a
    # crash leaves neither a run without rows nor rows without a run.
    # `counts` is final by now — the planning phase above owns every counter,
    # the write phase only persists what was planned.
    import_run = ImportRun(
        organization_id=payload.organization_id,
        user_id=payload.actor_user_id,
        provider=payload.provider,
        counts=dict(result.counts),
        status=ImportRunStatus.committed,
    )
    session.add(import_run)
    await session.flush()
    result.import_run_id = import_run.id

    # Companies first so contact FKs resolve.
    candidate_index_to_company_id: dict[int, uuid.UUID] = {}
    write_skip_codes = BLOCKING_CODES | {"ico_blocked"}
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
            # Only CREATED rows are stamped. An updated row existed before the
            # import and is not ours to delete on undo.
            company = Company(
                organization_id=payload.organization_id,
                owner_user_id=new_owner_id,
                import_run_id=import_run.id,
                **create_fields,
            )
            session.add(company)
            await session.flush()
            candidate_index_to_company_id[cand_idx] = company.id
            result.created_company_ids.append(company.id)

    # Contacts.
    contact_row_to_id: dict[int, uuid.UUID] = {}
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
            contact_row_to_id[contact.row_index] = existing_contact.id
            if existing_contact.id not in result.updated_contact_ids:
                result.updated_contact_ids.append(existing_contact.id)
        else:
            new_contact = Contact(
                organization_id=payload.organization_id,
                company_id=company_id,
                import_run_id=import_run.id,
                **{k: v for k, v in contact.fields.items() if v is not None},
            )
            session.add(new_contact)
            await session.flush()
            contact_row_to_id[contact.row_index] = new_contact.id
            result.created_contact_ids.append(new_contact.id)

    # Companies a deal named but nobody exported. `deals.company_id` is NOT
    # NULL, so this is required for the migration to survive a deals-only
    # export — the preview already counted them separately.
    auto_company_ids: dict[str, uuid.UUID] = {}
    for key, display_name in auto_companies.items():
        # Deliberately unowned: `Company.owner_user_id` participates in the
        # per-user `max_owned_companies` cap arithmetic that the company
        # phase computed before deals were resolved. Quietly blowing past a
        # business cap is worse than an admin bulk-assigning afterwards.
        company = Company(
            organization_id=payload.organization_id,
            name=display_name,
            import_run_id=import_run.id,
        )
        session.add(company)
        await session.flush()
        auto_company_ids[key] = company.id
        result.created_company_ids.append(company.id)

    # Deals last: they need company, contact and stage ids to exist.
    for plan in deal_plans:
        company_id_for_deal = _resolve_plan_company_id(
            plan,
            candidate_index_to_company_id=candidate_index_to_company_id,
            auto_company_ids=auto_company_ids,
        )
        if company_id_for_deal is None:
            # The company row this deal pointed at failed to write.
            continue
        contact_id: uuid.UUID | None = plan.contact_existing_id
        if contact_id is None and plan.contact_candidate_row is not None:
            contact_id = contact_row_to_id.get(plan.contact_candidate_row)
        deal_cand = plan.candidate
        deal = Deal(
            organization_id=payload.organization_id,
            company_id=company_id_for_deal,
            primary_contact_id=contact_id,
            stage_id=plan.state.stage_id,
            owner_user_id=plan.owner_user_id,
            name=deal_cand.name,
            value=deal_cand.value if deal_cand.value is not None else Decimal("0"),
            currency=plan.currency,
            expected_close_date=deal_cand.expected_close_date,
            closed_at=plan.state.closed_at,
            lost_reason=plan.state.lost_reason,
            import_run_id=import_run.id,
        )
        session.add(deal)
        await session.flush()
        result.created_deal_ids.append(deal.id)

    # No `activities` rows are written for imported deals — see the module
    # docstring note on `_plan_deals`.
    await session.commit()
    return result


async def run_preview(session: AsyncSession, payload: ImportInput) -> ImportRunResult:
    return await _run_pipeline(session, payload, do_write=False)


async def run_commit(session: AsyncSession, payload: ImportInput) -> ImportRunResult:
    return await _run_pipeline(session, payload, do_write=True)
