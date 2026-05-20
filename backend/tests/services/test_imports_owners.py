"""Unit tests for the import owner-mapping primitives.

`OwnerResolver` is exercised through hand-constructed in-memory snapshots
so the tests don't need a DB. The runner-side cap arithmetic and the
"row counted as invalid when owner can't resolve" path live in the
api/v1 integration tests.
"""

from __future__ import annotations

import uuid

from app.services.imports.mapping import apply_company_mapping, validate_mapping
from app.services.imports.owners import (
    OwnerResolutionError,
    OwnerResolver,
    ResolvedOwner,
    _UserSnapshot,
)


def _snap(
    *,
    email: str,
    name: str,
    is_active: bool = True,
    cap: int | None = None,
) -> _UserSnapshot:
    return _UserSnapshot(
        id=uuid.uuid4(),
        email=email,
        name=name,
        is_active=is_active,
        max_owned_companies=cap,
    )


def _build_resolver(snaps: list[_UserSnapshot]) -> OwnerResolver:
    by_email = {s.email.lower(): s for s in snaps}
    by_name: dict[str, list[_UserSnapshot]] = {}
    for s in snaps:
        by_name.setdefault(s.name.strip().lower(), []).append(s)
    return OwnerResolver(by_email=by_email, by_name=by_name)


def test_resolver_matches_email_case_insensitively() -> None:
    target = _snap(email="Jana@Firma.cz", name="Jana Procházková")
    resolver = _build_resolver([target])
    out = resolver.resolve("JANA@firma.cz")
    assert isinstance(out, ResolvedOwner)
    assert out.user_id == target.id


def test_resolver_matches_name_case_insensitively() -> None:
    target = _snap(email="petr@firma.cz", name="Petr Novák")
    resolver = _build_resolver([target])
    out = resolver.resolve("petr novák")
    assert isinstance(out, ResolvedOwner)
    assert out.user_id == target.id


def test_resolver_emits_owner_unknown_for_missing_email() -> None:
    resolver = _build_resolver([_snap(email="petr@firma.cz", name="Petr")])
    out = resolver.resolve("ghost@firma.cz")
    assert isinstance(out, OwnerResolutionError)
    assert out.code == "owner_unknown"


def test_resolver_emits_owner_ambiguous_when_two_users_share_a_name() -> None:
    duplicate = "Jan Svoboda"
    a = _snap(email="jan1@firma.cz", name=duplicate)
    b = _snap(email="jan2@firma.cz", name=duplicate)
    resolver = _build_resolver([a, b])
    out = resolver.resolve(duplicate)
    assert isinstance(out, OwnerResolutionError)
    assert out.code == "owner_ambiguous"
    # E-mail lookup of either still works — only the name path is ambiguous.
    assert isinstance(resolver.resolve("jan2@firma.cz"), ResolvedOwner)


def test_resolver_emits_owner_inactive_for_deactivated_user() -> None:
    target = _snap(email="ex@firma.cz", name="Ex Employee", is_active=False)
    resolver = _build_resolver([target])
    out = resolver.resolve("ex@firma.cz")
    assert isinstance(out, OwnerResolutionError)
    assert out.code == "owner_inactive"


def test_apply_company_mapping_routes_owner_column_to_owner_raw() -> None:
    mapping = validate_mapping(
        {"Název": "name", "Obchodník": "owner"},
        side="company",
        headers=["Název", "Obchodník"],
    )
    rows = [{"Název": "Acme", "Obchodník": "jana@firma.cz"}]
    [cand] = apply_company_mapping(rows, mapping)
    # The virtual `owner` cell must NOT land in `fields` — the runner's
    # setattr loop would crash trying to write a non-existent column.
    assert "owner" not in cand.fields
    assert cand.owner_raw == "jana@firma.cz"
    assert cand.errors == []


def test_apply_company_mapping_flags_too_long_owner_cell() -> None:
    huge = "a" * 400 + "@firma.cz"
    mapping = validate_mapping(
        {"Název": "name", "Obchodník": "owner"},
        side="company",
        headers=["Název", "Obchodník"],
    )
    [cand] = apply_company_mapping([{"Název": "Acme", "Obchodník": huge}], mapping)
    assert any(e.code == "too_long" and e.field == "owner" for e in cand.errors)
