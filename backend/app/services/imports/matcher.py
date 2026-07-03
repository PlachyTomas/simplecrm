"""Match contact rows to company rows using a user-picked key column.

The matcher is intentionally narrow — it knows nothing about the
database or the CSV format. The :mod:`runner` builds two lookups (one
keyed by IČO, one by name) over the deduped company candidates *plus*
the existing DB rows, then asks the matcher to walk the contact
candidates against them.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Literal

from app.services.imports.mapping import CandidateCompany, CandidateContact, RowError

MatchSource = Literal["ico", "name", "email"]


@dataclass
class CompanyKey:
    """A pointer to a single company the matcher can resolve to.

    `company_index` and `existing_company_id` are mutually exclusive —
    one identifies a row in the CSV companies list, the other identifies
    an existing row in the database.
    """

    company_index: int | None
    existing_company_id: uuid.UUID | None
    label: str  # human-readable, used only in error messages

    def is_existing(self) -> bool:
        return self.existing_company_id is not None


@dataclass
class MatcherResult:
    # contact row_index -> resolved company key (or None when unmatched)
    matches: dict[int, CompanyKey | None] = field(default_factory=dict)
    # contact row_index -> reason code, when the contact could not be
    # resolved to exactly one company (`"no_company_key"`,
    # `"unmatched"`, `"ambiguous_match"`).
    errors: list[RowError] = field(default_factory=list)


def _normalize(value: str, *, source: MatchSource) -> str:
    """Canonical form of a match key cell.

    IČO comparison is exact (8 digits). E-mails and names are
    lower-cased — e-mail wire format is technically case-sensitive in
    the local part but no CRM in practice treats it that way, and name
    matches in real imports are never carefully cased.
    """
    value = value.strip()
    if source in ("email", "name"):
        return value.lower()
    return value


def _build_index(
    *,
    candidates: list[CandidateCompany],
    existing_by_ico: dict[str, uuid.UUID],
    existing_by_name: dict[str, uuid.UUID],
    source: MatchSource,
    candidate_existing_ids: dict[int, uuid.UUID],
) -> dict[str, list[CompanyKey]]:
    """Build a `normalized-key → [CompanyKey, ...]` index.

    Returns a *list* per key so the matcher can detect `ambiguous_match`
    (multiple companies — typically two file rows with the same name —
    both claim the same key).

    `candidate_existing_ids` maps a candidate's index to the existing DB
    company it will update (when re-importing a company that already
    exists). Such a candidate and that existing row are the *same*
    company, so we drop the standalone existing entry under that key —
    otherwise a contact keyed to it would look ambiguously matched
    against "two" companies that are really one.
    """
    # key -> [(CompanyKey, existing-id it represents or None)]
    raw_index: dict[str, list[tuple[CompanyKey, uuid.UUID | None]]] = {}
    for cand_idx, cand in enumerate(candidates):
        raw = cand.fields.get(source)
        if raw is None:
            continue
        key = _normalize(raw, source=source)
        if not key:
            continue
        raw_index.setdefault(key, []).append(
            (
                CompanyKey(
                    company_index=cand_idx,
                    existing_company_id=None,
                    label=cand.fields.get("name") or f"row {cand.row_index}",
                ),
                candidate_existing_ids.get(cand_idx),
            )
        )

    existing_map = existing_by_ico if source == "ico" else existing_by_name
    for raw_key, existing_id in existing_map.items():
        key = _normalize(raw_key, source=source)
        if not key:
            continue
        raw_index.setdefault(key, []).append(
            (
                CompanyKey(
                    company_index=None,
                    existing_company_id=existing_id,
                    label=f"existing company {existing_id}",
                ),
                existing_id,
            )
        )

    index: dict[str, list[CompanyKey]] = {}
    for key, pairs in raw_index.items():
        covered = {eid for ck, eid in pairs if ck.company_index is not None and eid is not None}
        index[key] = [
            ck for ck, _eid in pairs if not (ck.is_existing() and ck.existing_company_id in covered)
        ]
    return index


def match_contacts_to_companies(
    *,
    contacts: list[CandidateContact],
    company_candidates: list[CandidateCompany],
    existing_companies_by_ico: dict[str, uuid.UUID],
    existing_companies_by_name: dict[str, uuid.UUID],
    match_source: MatchSource | None,
    candidate_existing_ids: dict[int, uuid.UUID] | None = None,
) -> MatcherResult:
    """Resolve each contact to either a CSV candidate or an existing DB row.

    ``match_source`` is ``None`` only when the user did not configure any
    match-key pair (e.g. they uploaded only a companies CSV). In that case
    every contact is reported as ``no_company_key``; this is by design
    because Mode B/C cannot produce contacts without a way to link them.

    ``candidate_existing_ids`` maps a company candidate's index to the
    existing DB company it updates, so the index can treat "re-uploaded
    company" and "existing company" as one (see :func:`_build_index`).
    """
    result = MatcherResult()

    if match_source is None:
        for contact in contacts:
            result.matches[contact.row_index] = None
            result.errors.append(
                RowError(
                    row_index=contact.row_index,
                    side="contact",
                    field=None,
                    code="no_company_key",
                    message="No match-key column configured — cannot link contact to a company.",
                )
            )
        return result

    index = _build_index(
        candidates=company_candidates,
        existing_by_ico=existing_companies_by_ico,
        existing_by_name=existing_companies_by_name,
        source=match_source,
        candidate_existing_ids=candidate_existing_ids or {},
    )

    for contact in contacts:
        raw = contact.match_key_value
        if not raw:
            result.matches[contact.row_index] = None
            result.errors.append(
                RowError(
                    row_index=contact.row_index,
                    side="contact",
                    field=None,
                    code="no_company_key",
                    message="Match-key cell is empty for this contact.",
                )
            )
            continue
        key = _normalize(raw, source=match_source)
        hits = index.get(key, [])
        if not hits:
            result.matches[contact.row_index] = None
            result.errors.append(
                RowError(
                    row_index=contact.row_index,
                    side="contact",
                    field=None,
                    code="unmatched",
                    message=f"No company matched key {raw!r}.",
                )
            )
            continue
        if len(hits) > 1:
            result.matches[contact.row_index] = None
            labels = ", ".join(h.label for h in hits[:3])
            result.errors.append(
                RowError(
                    row_index=contact.row_index,
                    side="contact",
                    field=None,
                    code="ambiguous_match",
                    message=f"Key {raw!r} matched multiple companies ({labels}).",
                )
            )
            continue
        result.matches[contact.row_index] = hits[0]
    return result
