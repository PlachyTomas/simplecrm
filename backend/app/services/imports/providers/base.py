"""Declarative provider profiles — "what does *this* CRM call our fields?".

A profile is data, not code: alias tables per side, plus the headers that
vote for a file's role. All the matching logic lives here once, so adding
"migrate from HubSpot" is a second data file, never a second importer.

The engine never imports a profile. Auto-detection only *pre-fills* the
mapping step the admin confirms anyway, which is what makes an unverified
alias table survivable (spec, Risks §1–2).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Literal

from app.services.imports.mapping import NOTE_APPEND, VIRTUAL_DEAL_FIELDS
from app.services.imports.normalize import normalize_header

FileRole = Literal["companies", "contacts", "combined", "deals"]
Side = Literal["company", "contact", "deal"]

ROLE_SIDES: dict[FileRole, tuple[Side, ...]] = {
    "companies": ("company",),
    "contacts": ("contact",),
    "combined": ("company", "contact"),
    "deals": ("deal",),
}

# Sides whose table has a `note` column, i.e. where an unrecognised column
# can be parked instead of dropped. All three, since `deals.note` landed —
# no side drops a provider's custom fields on the floor any more.
_NOTE_CAPABLE_SIDES: frozenset[str] = frozenset({"company", "contact", "deal"})


@dataclass(frozen=True)
class ProviderProfile:
    """One source CRM.

    ``aliases[side][field_key]`` is an **ordered** tuple of header spellings.
    Order is preference: the first alias that finds a column in the file wins
    that target, so put the most specific spelling first (the dedicated
    street subfield before the catch-all address string).
    """

    key: str
    label: str
    roles: tuple[FileRole, ...]
    aliases: Mapping[Side, Mapping[str, tuple[str, ...]]]
    # Headers whose presence votes for a role. Scored, not required — a
    # deals export also carries organization and person columns.
    role_signals: Mapping[FileRole, tuple[str, ...]]
    # Headers that carry the company a contact belongs to; the wizard passes
    # the winner as `match_key_contact`.
    contact_company_headers: tuple[str, ...] = ()

    def _alias_index(self, side: Side) -> dict[str, list[str]]:
        """``{field_key: [normalized alias, ...]}`` for one side."""
        return {
            field_key: [normalize_header(a) for a in alias_tuple]
            for field_key, alias_tuple in self.aliases.get(side, {}).items()
        }

    def suggest_mapping(self, headers: Sequence[str], *, side: Side) -> dict[str, str]:
        """``{header: field_key}`` covering **every** header in the file.

        Walks targets in alias-preference order rather than file order, so a
        Pipedrive organizations export maps `Address - Street/road name of
        Address` to `address_street` even though the plain `Address` column
        comes first in the file.

        Headers that match nothing (or a target already claimed) fall to
        ``note_append`` where the side has a note column (all three today),
        ``ignore`` otherwise — the spec's default for provider custom fields.

        Matching is exact-on-the-normalized-form, never fuzzy. A near-miss
        threshold loose enough to catch "Organisation" also maps
        ``Organization - Address`` onto ``Organization - Address - ZIP`` at a
        0.93 similarity, and a silently mis-mapped column is far worse than
        one extra pick in the mapping step. New spellings go in the alias
        table, where they are reviewable.
        """
        normalized = [(header, normalize_header(header)) for header in headers]
        assigned: dict[str, str] = {}
        used_headers: set[str] = set()

        for field_key, alias_list in self._alias_index(side).items():
            for alias in alias_list:
                hit = next(
                    (h for h, n in normalized if n == alias and h not in used_headers),
                    None,
                )
                if hit is not None:
                    assigned[hit] = field_key
                    used_headers.add(hit)
                    break

        fallback = NOTE_APPEND if side in _NOTE_CAPABLE_SIDES else "ignore"
        return {header: assigned.get(header, fallback) for header in headers}

    def role_scores(self, headers: Sequence[str]) -> dict[FileRole, int]:
        present = {normalize_header(h) for h in headers}
        return {
            role: sum(1 for signal in signals if normalize_header(signal) in present)
            for role, signals in self.role_signals.items()
        }

    def detect_role(self, headers: Sequence[str]) -> FileRole | None:
        """Best-scoring role, ties broken by :attr:`roles` declaration order
        (most specific first)."""
        scores = self.role_scores(headers)
        best = max(scores.values(), default=0)
        if best == 0:
            return None
        for role in self.roles:
            if scores.get(role, 0) == best:
                return role
        return None

    def score(self, headers: Sequence[str]) -> int:
        """How strongly this file looks like it came from this provider."""
        return max(self.role_scores(headers).values(), default=0)

    def suggest_match_key_contact(self, headers: Sequence[str]) -> str | None:
        present = {normalize_header(h): h for h in headers}
        for candidate in self.contact_company_headers:
            hit = present.get(normalize_header(candidate))
            if hit is not None:
                return hit
        return None

    def stage_header(self, headers: Sequence[str]) -> str | None:
        """Which column holds the source stage, per this profile's aliases."""
        deal_aliases = self._alias_index("deal").get("stage", [])
        present = {normalize_header(h): h for h in headers}
        for alias in deal_aliases:
            hit = present.get(alias)
            if hit is not None:
                return hit
        return None


def virtual_deal_fields() -> frozenset[str]:
    """Re-exported so a profile author can assert their alias keys exist."""
    return frozenset(VIRTUAL_DEAL_FIELDS)
