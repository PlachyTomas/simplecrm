"""Unit tests for the row-level scoping helpers."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.scoping import can_write_row, scope_by_owner, team_member_ids
from app.db.models import Company, Organization, Team, User, UserRole


async def test_admin_sees_all_users_in_org(db_session: AsyncSession) -> None:
    org = Organization(name="Admin test org")
    db_session.add(org)
    await db_session.flush()
    users = [
        User(
            email=f"admin-{i}@ex.cz",
            name=f"U{i}",
            role=UserRole.salesperson,
            organization_id=org.id,
        )
        for i in range(3)
    ]
    admin = User(email="admin@ex.cz", name="A", role=UserRole.admin, organization_id=org.id)
    db_session.add_all([admin, *users])
    await db_session.flush()

    ids = await team_member_ids(db_session, admin)
    assert len(ids) == 4
    assert admin.id in ids


async def test_salesperson_sees_teammates_only(db_session: AsyncSession) -> None:
    org = Organization(name="Sales test org")
    db_session.add(org)
    await db_session.flush()
    team = Team(organization_id=org.id, name="Sever")
    other = Team(organization_id=org.id, name="Jih")
    db_session.add_all([team, other])
    await db_session.flush()

    sales = User(
        email="sales@ex.cz",
        name="S",
        role=UserRole.salesperson,
        organization_id=org.id,
        team_id=team.id,
    )
    teammate = User(
        email="mate@ex.cz",
        name="M",
        role=UserRole.salesperson,
        organization_id=org.id,
        team_id=team.id,
    )
    stranger = User(
        email="stranger@ex.cz",
        name="X",
        role=UserRole.salesperson,
        organization_id=org.id,
        team_id=other.id,
    )
    db_session.add_all([sales, teammate, stranger])
    await db_session.flush()

    ids = await team_member_ids(db_session, sales)
    assert set(ids) == {sales.id, teammate.id}
    assert stranger.id not in ids


async def test_manager_sees_managed_team_members(db_session: AsyncSession) -> None:
    org = Organization(name="Manager test org")
    db_session.add(org)
    await db_session.flush()
    team = Team(organization_id=org.id, name="Managed")
    unmanaged = Team(organization_id=org.id, name="Unmanaged")
    db_session.add_all([team, unmanaged])
    await db_session.flush()

    manager = User(
        email="mgr@ex.cz",
        name="Mgr",
        role=UserRole.manager,
        organization_id=org.id,
    )
    db_session.add(manager)
    await db_session.flush()
    team.manager_user_id = manager.id
    member = User(
        email="member@ex.cz",
        name="Mem",
        role=UserRole.salesperson,
        organization_id=org.id,
        team_id=team.id,
    )
    outsider = User(
        email="outsider@ex.cz",
        name="Out",
        role=UserRole.salesperson,
        organization_id=org.id,
        team_id=unmanaged.id,
    )
    db_session.add_all([member, outsider])
    await db_session.flush()

    ids = await team_member_ids(db_session, manager)
    assert member.id in ids
    assert manager.id in ids
    assert outsider.id not in ids


async def test_scope_by_owner_filters_companies_for_salesperson(
    db_session: AsyncSession,
) -> None:
    org = Organization(name="Scope test org")
    db_session.add(org)
    await db_session.flush()
    team = Team(organization_id=org.id, name="T")
    db_session.add(team)
    await db_session.flush()

    sales = User(
        email="sales@scope.cz",
        name="S",
        role=UserRole.salesperson,
        organization_id=org.id,
        team_id=team.id,
    )
    other = User(
        email="other@scope.cz",
        name="O",
        role=UserRole.salesperson,
        organization_id=org.id,
    )
    db_session.add_all([sales, other])
    await db_session.flush()

    mine = Company(organization_id=org.id, name="Mine", owner_user_id=sales.id)
    theirs = Company(organization_id=org.id, name="Theirs", owner_user_id=other.id)
    pool = Company(organization_id=org.id, name="Pool", owner_user_id=None)
    db_session.add_all([mine, theirs, pool])
    await db_session.flush()

    base = select(Company).where(Company.organization_id == org.id)
    scoped = await scope_by_owner(
        base, session=db_session, user=sales, owner_col=Company.owner_user_id
    )
    names = {c.name for c in (await db_session.execute(scoped)).scalars().all()}
    assert names == {"Mine", "Pool"}


async def test_admin_can_write_anything(db_session: AsyncSession) -> None:
    org = Organization(name="Write admin org")
    db_session.add(org)
    await db_session.flush()
    admin = User(email="a@w.cz", name="A", role=UserRole.admin, organization_id=org.id)
    db_session.add(admin)
    await db_session.flush()
    # Even a random UUID target: admin passes.
    import uuid

    assert await can_write_row(db_session, admin, uuid.uuid4()) is True


async def test_salesperson_cannot_write_outside_team(db_session: AsyncSession) -> None:
    org = Organization(name="Write sales org")
    db_session.add(org)
    await db_session.flush()
    sales = User(
        email="s@w.cz",
        name="S",
        role=UserRole.salesperson,
        organization_id=org.id,
    )
    outsider = User(
        email="out@w.cz",
        name="O",
        role=UserRole.salesperson,
        organization_id=org.id,
    )
    db_session.add_all([sales, outsider])
    await db_session.flush()

    assert await can_write_row(db_session, sales, sales.id) is True
    assert await can_write_row(db_session, sales, None) is True
    assert await can_write_row(db_session, sales, outsider.id) is False
