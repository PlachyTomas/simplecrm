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

# 3 open stages + 1 won. Tuned to match the marketing demo and to avoid
# overwhelming new orgs with stages they'd just rename anyway. Admins can
# always add Schůzka / Nabídka / Lost via Settings → Pipeline.
DEFAULT_STAGES: tuple[StageSeed, ...] = (
    StageSeed("Nový lead", 10, "#3D5AFE", StageType.open),
    StageSeed("Osloveno", 30, "#5470FF", StageType.open),
    StageSeed("Jednání", 70, "#10B981", StageType.open),
    # Vyhráno stage seed is the canonical magenta brand-accent. The brief
    # retires lime entirely.
    StageSeed("Vyhráno", 100, "#EC4899", StageType.won),
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
