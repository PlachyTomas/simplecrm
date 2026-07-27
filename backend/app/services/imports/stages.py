"""Turn a foreign CRM's stage column + status word into our stage/closed_at.

The house convention this module exists to protect (spec, *"Deals: the part
that needs care"*):

    A **lost** deal sits in an **open-type** stage with ``closed_at`` and
    ``lost_reason`` set. There is no lost stage in the default pipeline.

`app/api/v1/deals.py` filters `status=lost` as *"lost-type stage OR
open-type stage with closed_at set"* and `status=open` as *"open-type stage
AND closed_at IS NULL"*. An importer that dropped Pipedrive's lost deals
into an open stage without stamping ``closed_at`` would put every one of
them back into the open pipeline — silently wrong forecasts, wrong funnel,
wrong rotting badges. Hence :meth:`StageResolver.resolve` decides
``closed_at`` from the *status word*, and the stage mapping only positions
the deal.
"""

from __future__ import annotations

import difflib
import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Pipeline, Stage, StageType
from app.services.imports.mapping import RowError
from app.services.imports.normalize import normalize_text

DealStatus = Literal["open", "won", "lost"]

# Status vocabulary. Normalized (diacritics-folded, lowercase) on both
# sides, so "Vyhráno", "vyhrano" and "WON" all land on `won`.
_STATUS_ALIASES: dict[DealStatus, frozenset[str]] = {
    "open": frozenset(
        {"open", "opened", "in progress", "ongoing", "otevreno", "otevreny", "probiha", "aktivni"}
    ),
    "won": frozenset({"won", "win", "vyhrano", "vyhrany", "vyhra", "uspesne", "success"}),
    "lost": frozenset(
        {"lost", "lose", "prohrano", "prohrany", "prohra", "ztraceno", "neuspesne", "failed"}
    ),
}

# Used when the source has no lost-reason column at all. Better than NULL:
# `lost_reason` is what the lost-deals report groups by, and an empty group
# reads as a data bug rather than a migration artefact.
FALLBACK_LOST_REASON = "Importováno jako prohraný obchod"

# difflib cut-off for the stage-name suggestion. 0.72 accepts
# "Qualified"/"Kvalifikace"-grade near-misses within one language and
# rejects unrelated names; the user confirms every guess in the wizard
# anyway, so a false positive costs one click, not data.
_FUZZY_CUTOFF = 0.72


@dataclass(frozen=True)
class StageInfo:
    id: uuid.UUID
    name: str
    stage_type: StageType
    position: int
    pipeline_id: uuid.UUID
    pipeline_name: str
    pipeline_is_default: bool


@dataclass(frozen=True)
class ResolvedDealState:
    stage_id: uuid.UUID
    closed_at: datetime | None
    lost_reason: str | None


async def load_stages(session: AsyncSession, organization_id: uuid.UUID) -> list[StageInfo]:
    """Every stage of the org, ordered default-pipeline-first then position."""
    stmt = (
        select(Stage, Pipeline)
        .join(Pipeline, Pipeline.id == Stage.pipeline_id)
        .where(Pipeline.organization_id == organization_id)
        .order_by(Pipeline.is_default.desc(), Pipeline.name, Stage.position)
    )
    rows = (await session.execute(stmt)).all()
    return [
        StageInfo(
            id=stage.id,
            name=stage.name,
            stage_type=stage.stage_type,
            position=stage.position,
            pipeline_id=pipeline.id,
            pipeline_name=pipeline.name,
            pipeline_is_default=pipeline.is_default,
        )
        for stage, pipeline in rows
    ]


def parse_status(raw: str | None) -> DealStatus | None:
    """``None`` for an empty cell (→ treat as open); ``None`` is also what an
    unknown word returns — the caller distinguishes the two by checking the
    raw cell, because an unrecognised status must block rather than default."""
    if raw is None or not raw.strip():
        return "open"
    key = normalize_text(raw)
    for status, aliases in _STATUS_ALIASES.items():
        if key in aliases:
            return status
    return None


def suggest_stage_mapping(
    values: Iterable[str],
    stages: Sequence[StageInfo],
) -> dict[str, uuid.UUID | None]:
    """Pre-fill the wizard's one-select-per-source-value stage mapping.

    Purely a convenience: the user confirms (and every unmapped value blocks
    the import), so this is allowed to guess.

    Order of attack: normalized exact name → status vocabulary (a source
    stage literally called "Won" maps to the won-type stage) → substring
    containment → :mod:`difflib` ratio above :data:`_FUZZY_CUTOFF`.
    """
    by_norm: dict[str, StageInfo] = {}
    for stage in stages:
        by_norm.setdefault(normalize_text(stage.name), stage)
    norm_names = list(by_norm)

    def first_of_type(stage_type: StageType) -> StageInfo | None:
        return next((s for s in stages if s.stage_type is stage_type), None)

    out: dict[str, uuid.UUID | None] = {}
    for value in values:
        key = normalize_text(value)
        if not key:
            out[value] = None
            continue
        hit = by_norm.get(key)
        if hit is None:
            if key in _STATUS_ALIASES["won"]:
                hit = first_of_type(StageType.won)
            elif key in _STATUS_ALIASES["lost"]:
                hit = first_of_type(StageType.lost) or first_of_type(StageType.open)
        if hit is None:
            contained = [n for n in norm_names if key in n or n in key]
            if len(contained) == 1:
                hit = by_norm[contained[0]]
        if hit is None:
            close = difflib.get_close_matches(key, norm_names, n=1, cutoff=_FUZZY_CUTOFF)
            if close:
                hit = by_norm[close[0]]
        out[value] = hit.id if hit is not None else None
    return out


class StageResolver:
    """Applies the spec's status → stage/closed_at table to one deal row.

    Built once per import run from the org's stages plus the caller-supplied
    ``{source stage value → our stage id}`` map.
    """

    def __init__(
        self,
        *,
        stages: Sequence[StageInfo],
        stage_mapping: dict[str, uuid.UUID],
        import_now: datetime,
    ) -> None:
        self._by_id = {s.id: s for s in stages}
        # Source values are matched diacritics/case/punctuation-insensitively
        # so "Nový lead" from the CSV finds the "novy lead" the wizard sent.
        self._mapping = {normalize_text(k): v for k, v in stage_mapping.items() if k.strip()}
        self._now = import_now
        self._stages = list(stages)

    @property
    def stage_ids(self) -> set[uuid.UUID]:
        return set(self._by_id)

    def unmapped_values(self, values: Iterable[str]) -> list[str]:
        """Distinct source values with no mapping — the blocking set the
        preview surfaces so the wizard can highlight them."""
        seen: dict[str, None] = {}
        for value in values:
            if not value or not value.strip():
                continue
            if normalize_text(value) not in self._mapping:
                seen.setdefault(value.strip(), None)
        return list(seen)

    def _default_open(self, pipeline_id: uuid.UUID | None) -> StageInfo | None:
        pool = [s for s in self._stages if s.stage_type is StageType.open]
        if not pool:
            return None
        if pipeline_id is not None:
            same = [s for s in pool if s.pipeline_id == pipeline_id]
            if same:
                return min(same, key=lambda s: s.position)
        return min(pool, key=lambda s: (not s.pipeline_is_default, s.position))

    def _won_stage(self, pipeline_id: uuid.UUID | None) -> StageInfo | None:
        pool = [s for s in self._stages if s.stage_type is StageType.won]
        if not pool:
            return None
        if pipeline_id is not None:
            same = [s for s in pool if s.pipeline_id == pipeline_id]
            if same:
                return min(same, key=lambda s: s.position)
        return min(pool, key=lambda s: (not s.pipeline_is_default, s.position))

    def resolve(
        self,
        *,
        row_index: int,
        stage_raw: str | None,
        status_raw: str | None,
        lost_reason_raw: str | None,
        won_time: datetime | None,
        lost_time: datetime | None,
        closed_on: datetime | None,
    ) -> tuple[ResolvedDealState | None, list[RowError]]:
        """Returns ``(state, errors)``. ``state is None`` ⇒ the row is
        blocked; errors may also be non-blocking warnings alongside a state."""
        errors: list[RowError] = []

        def fail(code: str, message: str, field: str | None) -> tuple[None, list[RowError]]:
            errors.append(
                RowError(row_index=row_index, side="deal", field=field, code=code, message=message)
            )
            return None, errors

        status = parse_status(status_raw)
        if status is None:
            return fail(
                "status_unknown",
                f"Neznámý stav obchodu {status_raw!r} (očekáváme otevřený / vyhraný / prohraný).",
                "status",
            )

        mapped: StageInfo | None = None
        if stage_raw and stage_raw.strip():
            stage_id = self._mapping.get(normalize_text(stage_raw))
            if stage_id is None:
                return fail(
                    "stage_unmapped",
                    f"Fáze {stage_raw.strip()!r} není namapovaná na žádnou fázi v SimpleCRM.",
                    "stage",
                )
            mapped = self._by_id.get(stage_id)
            if mapped is None:
                return fail(
                    "stage_unknown",
                    f"Namapovaná fáze {stage_id} neexistuje v této organizaci.",
                    "stage",
                )

        pipeline_id = mapped.pipeline_id if mapped is not None else None

        if status == "open":
            stage = mapped or self._default_open(pipeline_id)
            if stage is None:
                return fail("no_open_stage", "Organizace nemá žádnou otevřenou fázi.", "stage")
            return ResolvedDealState(stage_id=stage.id, closed_at=None, lost_reason=None), errors

        if status == "won":
            stage = mapped if (mapped is not None and mapped.stage_type is StageType.won) else None
            if stage is None:
                stage = self._won_stage(pipeline_id)
            if stage is None:
                return fail(
                    "no_won_stage",
                    "Organizace nemá žádnou vyhranou fázi — vyhrané obchody nelze naimportovat.",
                    "stage",
                )
            closed_at = won_time or closed_on or self._now
            return ResolvedDealState(
                stage_id=stage.id, closed_at=closed_at, lost_reason=None
            ), errors

        # Lost. An open-type stage is the *correct* destination here.
        stage = mapped
        if stage is not None and stage.stage_type is StageType.won:
            # Contradictory source data: a "Lost" deal pointed at a won-type
            # stage would read as won everywhere. Demote it and say so.
            errors.append(
                RowError(
                    row_index=row_index,
                    side="deal",
                    field="stage",
                    code="lost_in_won_stage",
                    message=(
                        f"Prohraný obchod měl namapovanou vyhranou fázi {stage.name!r}; "
                        "přesunut do otevřené fáze se stavem prohráno."
                    ),
                )
            )
            stage = None
        if stage is None:
            stage = self._default_open(pipeline_id)
        if stage is None:
            return fail("no_open_stage", "Organizace nemá žádnou otevřenou fázi.", "stage")
        closed_at = lost_time or closed_on or self._now
        reason = (lost_reason_raw or "").strip() or FALLBACK_LOST_REASON
        return ResolvedDealState(stage_id=stage.id, closed_at=closed_at, lost_reason=reason), errors
