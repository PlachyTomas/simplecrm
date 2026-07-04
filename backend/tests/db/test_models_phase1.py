"""Smoke tests for the Phase 1 foundation models."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Organization,
    Plan,
    Team,
    User,
    UserRole,
)


async def test_default_plans_are_seeded(db_session: AsyncSession) -> None:
    result = await db_session.execute(select(Plan).order_by(Plan.sort_order))
    plans = {p.code: p for p in result.scalars()}
    assert set(plans.keys()) == {"trial", "monthly", "annual", "enterprise", "comp"}
    assert plans["trial"].price_per_user_minor == 0
    assert plans["trial"].is_public is False
    assert plans["monthly"].price_per_user_minor == 9900
    assert plans["monthly"].billing_interval == "monthly"
    assert plans["monthly"].is_public is True
    assert plans["annual"].price_per_user_minor == 99600
    assert plans["annual"].is_public is True
    assert plans["enterprise"].price_per_user_minor is None
    assert plans["enterprise"].billing_interval == "custom"
    assert plans["comp"].billing_interval == "free"
    assert all(p.currency == "CZK" for p in plans.values())


async def test_organization_has_default_trial_window(db_session: AsyncSession) -> None:
    org = Organization(name="Testovací s.r.o.")
    db_session.add(org)
    await db_session.flush()
    await db_session.refresh(org)

    assert org.id is not None
    assert org.locale == "cs-CZ"
    assert org.currency == "CZK"
    assert org.trial_ends_at > org.created_at
    # ~30 days give-or-take DB-roundtrip rounding.
    delta = org.trial_ends_at - org.created_at
    assert 29 * 86400 < delta.total_seconds() < 31 * 86400


async def test_user_requires_organization(db_session: AsyncSession) -> None:
    orphan = User(
        email="orphan@example.com",
        name="Orphan",
        role=UserRole.salesperson,
        organization_id=uuid.uuid4(),  # nonexistent org
    )
    db_session.add(orphan)
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_team_links_to_organization_and_manager(db_session: AsyncSession) -> None:
    org = Organization(name="Alfa s.r.o.")
    db_session.add(org)
    await db_session.flush()

    manager = User(
        email="manager@alfa.cz",
        name="Manažer",
        role=UserRole.manager,
        organization_id=org.id,
    )
    db_session.add(manager)
    await db_session.flush()

    team = Team(name="Sever", organization_id=org.id, manager_user_id=manager.id)
    db_session.add(team)
    await db_session.flush()

    # Put the manager into the team they lead.
    manager.team_id = team.id
    await db_session.flush()

    await db_session.refresh(team, attribute_names=["members", "manager"])
    assert team.manager is not None
    assert team.manager.email == "manager@alfa.cz"
    assert any(m.id == manager.id for m in team.members)


async def test_user_email_is_globally_unique(db_session: AsyncSession) -> None:
    org = Organization(name="Beta s.r.o.")
    db_session.add(org)
    await db_session.flush()

    first = User(
        email="sam@beta.cz",
        name="Sam",
        role=UserRole.salesperson,
        organization_id=org.id,
    )
    second = User(
        email="sam@beta.cz",
        name="Sam 2",
        role=UserRole.salesperson,
        organization_id=org.id,
    )
    db_session.add_all([first, second])
    with pytest.raises(IntegrityError):
        await db_session.flush()
