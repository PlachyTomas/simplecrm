"""Pipeline + stage provisioning."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Pipeline, Stage, StageType


@dataclass(frozen=True)
class StageSeed:
    name: str
    default_probability: int
    color: str
    stage_type: StageType


DEFAULT_PIPELINE_NAME = "Výchozí"

# 5 open stages + 1 won. Lost deals keep their current stage but set
# `closed_at` + `lost_reason`; admins who want a visible lost column can add
# one later via the pipeline editor (Phase 10).
DEFAULT_STAGES: tuple[StageSeed, ...] = (
    StageSeed("Nový lead", 10, "#3D5AFE", StageType.open),
    StageSeed("Kontaktováno", 25, "#5470FF", StageType.open),
    StageSeed("Schůzka", 45, "#F59E0B", StageType.open),
    StageSeed("Nabídka", 65, "#A8D03A", StageType.open),
    StageSeed("Jednání", 85, "#10B981", StageType.open),
    StageSeed("Vyhráno", 100, "#C9F24E", StageType.won),
)


async def create_default_pipeline(session: AsyncSession, organization_id: uuid.UUID) -> Pipeline:
    """Provision the default pipeline and its stages for a new organization.

    Safe to call only once per org: the partial-unique index on
    `(organization_id) WHERE is_default = TRUE` will raise IntegrityError on a
    second call. Callers should treat the first-login pathway as the single
    invocation site for MVP.
    """
    pipeline = Pipeline(
        organization_id=organization_id,
        name=DEFAULT_PIPELINE_NAME,
        is_default=True,
    )
    session.add(pipeline)
    await session.flush()

    for position, seed in enumerate(DEFAULT_STAGES):
        session.add(
            Stage(
                pipeline_id=pipeline.id,
                name=seed.name,
                default_probability=seed.default_probability,
                color=seed.color,
                position=position,
                stage_type=seed.stage_type,
            )
        )
    await session.flush()
    return pipeline
