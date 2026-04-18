"""Auth business logic: turn a Google profile into a persisted User."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Organization, User, UserRole
from app.services.google_oauth import GoogleProfile
from app.services.pipeline import create_default_pipeline


def _default_org_name(email: str) -> str:
    domain = email.split("@", 1)[1] if "@" in email else "Nová firma"
    # Strip the TLD — "example.com" → "Example" — gives a reasonable placeholder
    # that the onboarding flow will overwrite with the real legal name.
    label = domain.rsplit(".", 1)[0]
    return label.capitalize() or "Nová firma"


async def upsert_user_from_google_profile(session: AsyncSession, profile: GoogleProfile) -> User:
    """Return the User matching this Google identity, creating an Organization
    + admin User if this is a first-time login.

    Matching order:
      1. `google_id` — strongest; same Google account.
      2. `email` — a User that was invited before their first Google login.
         In that case we attach the `google_id` to the existing row.

    If neither matches, provision a placeholder Organization (trial window
    comes from the Organization default) and create an admin User inside it.
    """
    stmt_by_google_id = select(User).where(User.google_id == profile.google_id)
    user = (await session.execute(stmt_by_google_id)).scalar_one_or_none()
    if user is None:
        stmt_by_email = select(User).where(User.email == profile.email)
        user = (await session.execute(stmt_by_email)).scalar_one_or_none()
        if user is not None and user.google_id is None:
            user.google_id = profile.google_id

    if user is None:
        organization = Organization(name=_default_org_name(profile.email))
        session.add(organization)
        await session.flush()
        await create_default_pipeline(session, organization.id)
        user = User(
            email=profile.email,
            name=profile.name,
            avatar_url=profile.picture,
            google_id=profile.google_id,
            role=UserRole.admin,
            organization_id=organization.id,
        )
        session.add(user)
    else:
        # Keep the profile picture and display name in sync with Google.
        if profile.picture and user.avatar_url != profile.picture:
            user.avatar_url = profile.picture
        if profile.name and user.name != profile.name:
            user.name = profile.name

    user.last_login_at = datetime.now(tz=UTC)
    await session.flush()
    await session.refresh(user)
    return user


async def upsert_dev_user(session: AsyncSession, email: str, name: str | None = None) -> User:
    """Dev-bypass twin of the Google upsert: creates (or finds) a User +
    Organization without an OAuth round-trip. Only callable from the
    dev-login endpoint, which is itself gated on `dev_auth_enabled` +
    `app_env == "dev"`.
    """
    stmt = select(User).where(User.email == email)
    user = (await session.execute(stmt)).scalar_one_or_none()

    if user is None:
        organization = Organization(name=_default_org_name(email))
        session.add(organization)
        await session.flush()
        await create_default_pipeline(session, organization.id)
        user = User(
            email=email,
            name=name or email.split("@", 1)[0].capitalize(),
            role=UserRole.admin,
            organization_id=organization.id,
        )
        session.add(user)

    user.last_login_at = datetime.now(tz=UTC)
    await session.flush()
    await session.refresh(user)
    return user
