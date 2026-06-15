"""Smoke tests for the per-user SMTP settings model (Task A2)."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Organization, User, UserRole, UserSmtpSettings


async def _seed_org_and_user(db_session: AsyncSession) -> tuple[Organization, User]:
    org = Organization(name="SMTP Test s.r.o.")
    db_session.add(org)
    await db_session.flush()
    user = User(
        email=f"owner-{org.id.hex[:8]}@smtp.cz",
        name="Majitel",
        role=UserRole.admin,
        organization_id=org.id,
    )
    db_session.add(user)
    await db_session.flush()
    return org, user


async def test_create_user_smtp_settings_defaults(db_session: AsyncSession) -> None:
    org, user = await _seed_org_and_user(db_session)
    row = UserSmtpSettings(
        user_id=user.id,
        organization_id=org.id,
        host="mail.x.cz",
        port=465,
        use_ssl=True,
        use_starttls=False,
        username="u@x.cz",
        password_encrypted="enc",
        from_email="u@x.cz",
    )
    db_session.add(row)
    await db_session.flush()
    await db_session.refresh(row)
    assert row.id is not None
    assert row.verified_at is None
    assert row.from_name is None


async def test_user_smtp_settings_unique_per_user(db_session: AsyncSession) -> None:
    org, user = await _seed_org_and_user(db_session)
    base = {
        "user_id": user.id,
        "organization_id": org.id,
        "host": "mail.x.cz",
        "port": 465,
        "use_ssl": True,
        "use_starttls": False,
        "username": "u@x.cz",
        "password_encrypted": "enc",
        "from_email": "u@x.cz",
    }
    db_session.add(UserSmtpSettings(**base))
    await db_session.flush()
    db_session.add(UserSmtpSettings(**base))
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_query_back(db_session: AsyncSession) -> None:
    org, user = await _seed_org_and_user(db_session)
    db_session.add(
        UserSmtpSettings(
            user_id=user.id,
            organization_id=org.id,
            host="mail.x.cz",
            port=587,
            use_ssl=False,
            use_starttls=True,
            username="u@x.cz",
            password_encrypted="enc",
            from_email="u@x.cz",
            from_name="Jan Novák",
        )
    )
    await db_session.flush()
    found = (
        await db_session.execute(
            select(UserSmtpSettings).where(UserSmtpSettings.user_id == user.id)
        )
    ).scalar_one()
    assert found.use_starttls is True
    assert found.from_name == "Jan Novák"
