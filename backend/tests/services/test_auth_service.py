"""Unit tests for the Google → User upsert business logic."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Organization, User, UserRole
from app.services.auth import upsert_user_from_google_profile
from app.services.google_oauth import GoogleProfile


async def test_first_login_creates_user_without_org(
    db_session: AsyncSession,
) -> None:
    """First Google login (no invite) lands the user without an org and
    as a placeholder salesperson. The frontend then routes to the
    create-org page; `POST /onboarding/organization` promotes them to admin."""
    profile = GoogleProfile(
        google_id="g-100",
        email="first@alfa.cz",
        name="První",
        picture="https://avatar.example/100",
    )
    user = await upsert_user_from_google_profile(db_session, profile)
    assert user.role is UserRole.salesperson
    assert user.organization_id is None
    assert user.email == "first@alfa.cz"
    assert user.avatar_url == "https://avatar.example/100"
    assert user.last_login_at is not None


async def test_returning_user_is_reused_by_google_id(
    db_session: AsyncSession,
) -> None:
    profile = GoogleProfile(
        google_id="g-200",
        email="repeat@beta.cz",
        name="Opakující",
        picture=None,
    )
    first = await upsert_user_from_google_profile(db_session, profile)
    first_org = first.organization_id
    await db_session.flush()

    profile_updated = GoogleProfile(
        google_id="g-200",
        email="repeat@beta.cz",
        name="Opakující Nové Jméno",
        picture="https://avatar.example/200",
    )
    second = await upsert_user_from_google_profile(db_session, profile_updated)
    assert second.id == first.id
    assert second.organization_id == first_org
    assert second.name == "Opakující Nové Jméno"
    assert second.avatar_url == "https://avatar.example/200"

    users = (
        (await db_session.execute(select(User).where(User.email == "repeat@beta.cz")))
        .scalars()
        .all()
    )
    assert len(users) == 1


async def test_invited_user_by_email_gets_google_id_attached(
    db_session: AsyncSession,
) -> None:
    # An invite-created User row that hasn't seen a Google login yet.
    org = Organization(name="Gamma")
    db_session.add(org)
    await db_session.flush()
    existing = User(
        email="invited@gamma.cz",
        name="Invited",
        role=UserRole.salesperson,
        organization_id=org.id,
    )
    db_session.add(existing)
    await db_session.flush()

    profile = GoogleProfile(
        google_id="g-300",
        email="invited@gamma.cz",
        name="Invited",
        picture=None,
    )
    user = await upsert_user_from_google_profile(db_session, profile)
    assert user.id == existing.id
    assert user.google_id == "g-300"
    assert user.role is UserRole.salesperson
