"""Translate the per-row "Obchodník" CSV column into a `User.id`.

The :class:`OwnerResolver` keeps two case-insensitive lookups over the
active org users — one by e-mail (authoritative; `User.email` is unique
in the org) and one by name. A name that matches more than one user is
flagged so the runner can emit ``owner_ambiguous`` instead of guessing.

The resolver is intentionally schema-light: it knows nothing about
`Company`. The :mod:`runner` is responsible for applying the resolved
UUID to ``Company.owner_user_id`` and for tracking per-batch cap
arithmetic across multiple incoming rows.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User

OwnerErrorCode = Literal["owner_unknown", "owner_ambiguous", "owner_inactive"]


@dataclass
class ResolvedOwner:
    user_id: uuid.UUID
    max_owned_companies: int | None  # None = unlimited


@dataclass
class OwnerResolutionError:
    code: OwnerErrorCode
    message: str


@dataclass
class _UserSnapshot:
    """Just the User columns the resolver needs — keeps the lookup tables
    independent of SQLAlchemy session state once `from_org` has loaded
    them."""

    id: uuid.UUID
    email: str
    name: str
    is_active: bool
    max_owned_companies: int | None


class OwnerResolver:
    """Case-folded lookup table for an org's users.

    Build one per import run via :meth:`from_org`. Reuse :meth:`resolve`
    per CSV row — there is no DB access inside `resolve`, so the matcher
    loop stays cheap even for 50 k row imports.
    """

    def __init__(
        self,
        *,
        by_email: dict[str, _UserSnapshot],
        by_name: dict[str, list[_UserSnapshot]],
    ) -> None:
        self._by_email = by_email
        self._by_name = by_name

    @classmethod
    async def from_org(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
    ) -> OwnerResolver:
        stmt = select(User).where(User.organization_id == organization_id)
        rows = (await session.execute(stmt)).scalars().all()
        by_email: dict[str, _UserSnapshot] = {}
        by_name: dict[str, list[_UserSnapshot]] = {}
        for row in rows:
            snap = _UserSnapshot(
                id=row.id,
                email=row.email,
                name=row.name,
                is_active=row.is_active,
                max_owned_companies=row.max_owned_companies,
            )
            by_email[snap.email.lower()] = snap
            by_name.setdefault(snap.name.strip().lower(), []).append(snap)
        return cls(by_email=by_email, by_name=by_name)

    def get_by_id(self, user_id: uuid.UUID) -> ResolvedOwner | OwnerResolutionError:
        """Look up a user by primary key; used for the bulk-assign path
        where the wizard hands us a UUID directly rather than a cell
        value. Returns ``owner_unknown`` if the id is foreign to the org."""
        for snap in self._by_email.values():
            if snap.id == user_id:
                if not snap.is_active:
                    return OwnerResolutionError(
                        code="owner_inactive",
                        message=f"Uživatel {snap.email} je deaktivovaný a nemůže vlastnit firmy.",
                    )
                return ResolvedOwner(user_id=snap.id, max_owned_companies=snap.max_owned_companies)
        return OwnerResolutionError(
            code="owner_unknown",
            message=f"Uživatel {user_id} není členem této organizace.",
        )

    def resolve(self, raw_value: str) -> ResolvedOwner | OwnerResolutionError:
        """Look up the user. ``@`` in the value picks the email path; else
        we fall back to case-folded name matching."""
        value = raw_value.strip()
        if not value:
            # Caller should treat empty cell as "no owner change" — never
            # reach here with empty input. Guard anyway for safety.
            return OwnerResolutionError(
                code="owner_unknown", message="Buňka s obchodníkem je prázdná."
            )
        if "@" in value:
            snap = self._by_email.get(value.lower())
            if snap is None:
                return OwnerResolutionError(
                    code="owner_unknown",
                    message=f"Žádný uživatel v organizaci nemá e-mail {value!r}.",
                )
        else:
            hits = self._by_name.get(value.lower(), [])
            if not hits:
                return OwnerResolutionError(
                    code="owner_unknown",
                    message=f"Žádný uživatel v organizaci se nejmenuje {value!r}.",
                )
            if len(hits) > 1:
                emails = ", ".join(h.email for h in hits[:3])
                return OwnerResolutionError(
                    code="owner_ambiguous",
                    message=(
                        f"Jméno {value!r} odpovídá více uživatelům ({emails}). "
                        "Použijte v CSV e-mail."
                    ),
                )
            snap = hits[0]
        if not snap.is_active:
            return OwnerResolutionError(
                code="owner_inactive",
                message=f"Uživatel {snap.email} je deaktivovaný a nemůže vlastnit firmy.",
            )
        return ResolvedOwner(user_id=snap.id, max_owned_companies=snap.max_owned_companies)
