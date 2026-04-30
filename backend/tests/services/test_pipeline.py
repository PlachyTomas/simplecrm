"""Tests for the default-pipeline seeder."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Organization, Pipeline, Stage, StageType
from app.services.pipeline import DEFAULT_STAGES, create_default_pipeline


async def test_create_default_pipeline_inserts_six_stages(
    db_session: AsyncSession,
) -> None:
    org = Organization(name="Test s.r.o.")
    db_session.add(org)
    await db_session.flush()

    pipeline = await create_default_pipeline(db_session, org.id)
    await db_session.refresh(pipeline, attribute_names=["stages"])

    assert pipeline.is_default is True
    assert len(pipeline.stages) == len(DEFAULT_STAGES) == 6

    for idx, stage in enumerate(pipeline.stages):
        seed = DEFAULT_STAGES[idx]
        assert stage.position == idx
        assert stage.name == seed.name
        assert stage.default_probability == seed.default_probability
        assert stage.stage_type is seed.stage_type
        assert stage.color == seed.color

    # Terminal stage is the won one.
    assert pipeline.stages[-1].stage_type is StageType.won
    assert pipeline.stages[-1].default_probability == 100


async def test_create_default_pipeline_twice_fails(
    db_session: AsyncSession,
) -> None:
    org = Organization(name="Dupe s.r.o.")
    db_session.add(org)
    await db_session.flush()

    await create_default_pipeline(db_session, org.id)
    with pytest.raises(IntegrityError):
        await create_default_pipeline(db_session, org.id)


async def test_stage_probability_check_constraint(db_session: AsyncSession) -> None:
    org = Organization(name="Check s.r.o.")
    db_session.add(org)
    await db_session.flush()
    pipeline = Pipeline(organization_id=org.id, name="P", is_default=False)
    db_session.add(pipeline)
    await db_session.flush()

    bad = Stage(
        pipeline_id=pipeline.id,
        name="Invalid",
        default_probability=120,
        color="#000000",
        position=0,
        stage_type=StageType.open,
    )
    db_session.add(bad)
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_create_organization_seeds_default_pipeline(db_session: AsyncSession) -> None:
    """`POST /onboarding/organization` (via `create_organization_with_admin`)
    provisions the org + its default pipeline alongside the default team."""
    from app.db.models import User, UserRole
    from app.services.onboarding import create_organization_with_admin

    founder = User(
        email="founder@pipetest.cz",
        name="Zakladatel",
        role=UserRole.salesperson,
        organization_id=None,
    )
    db_session.add(founder)
    await db_session.flush()

    org = await create_organization_with_admin(
        db_session, name="Pipe s.r.o.", founder=founder
    )

    pipelines = (
        (
            await db_session.execute(
                select(Pipeline).where(Pipeline.organization_id == org.id)
            )
        )
        .scalars()
        .all()
    )
    assert len(pipelines) == 1
    assert pipelines[0].is_default is True
    await db_session.refresh(pipelines[0], attribute_names=["stages"])
    assert len(pipelines[0].stages) == 6
    assert founder.role is UserRole.admin
    assert founder.team_id is not None
