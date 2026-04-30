"""Auth business logic: turn a Google profile into a persisted User.

Onboarding modes (in order of precedence):
  1. **Existing user** — match by `google_id`, then by `email`. Update
     profile picture/name from Google.
  2. **Pending invitation** — when a signed invite token is supplied via
     OAuth state, accept it: create/adopt the User into the inviting
     org with the role/team/can_invite that the invite specified.
  3. **Brand-new signup** — no match, no invite. Create a User with
     `organization_id = NULL`. The frontend's `ProtectedRoute` reads
     `/auth/me`, sees `organization == null`, and redirects to the
     create-org page where `POST /onboarding/organization` finishes setup.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User, UserRole
from app.services.google_oauth import GoogleProfile
from app.services.invitations import (
    InvitationAlreadyConsumedError,
    InvitationEmailMismatchError,
    InvitationExpiredError,
    InvitationNotFoundError,
    UserAlreadyInOrganizationError,
    accept_invitation_for_google_profile,
)
from app.services.onboarding import create_organization_with_admin


async def upsert_user_from_google_profile(
    session: AsyncSession,
    profile: GoogleProfile,
    *,
    invite_token: str | None = None,
) -> User:
    """Resolve (or create) the User behind this Google identity.

    When `invite_token` is supplied, route through invitation acceptance
    so the new (or existing-without-org) User lands inside the inviting
    org with the invite's role/team/can_invite. Errors from acceptance
    bubble up unchanged so the OAuth callback can map them to redirect
    targets.

    Without an invite, this never auto-provisions an org. New users land
    in the "needs org setup" state described in the module docstring.
    """
    if invite_token is not None:
        # Let invitation errors propagate; the caller maps them to a
        # redirect with an error code so the AcceptInvitePage can display
        # a precise message.
        accepted = await accept_invitation_for_google_profile(
            session, token=invite_token, profile=profile
        )
        accepted.last_login_at = datetime.now(tz=UTC)
        await session.flush()
        return accepted

    stmt_by_google_id = select(User).where(User.google_id == profile.google_id)
    user: User | None = (await session.execute(stmt_by_google_id)).scalar_one_or_none()
    if user is None:
        stmt_by_email = select(User).where(User.email == profile.email)
        user = (await session.execute(stmt_by_email)).scalar_one_or_none()
        if user is not None and user.google_id is None:
            user.google_id = profile.google_id

    if user is None:
        user = User(
            email=profile.email,
            name=profile.name,
            avatar_url=profile.picture,
            google_id=profile.google_id,
            role=UserRole.salesperson,  # placeholder; promoted to admin on org creation
            organization_id=None,
        )
        session.add(user)
    else:
        if profile.picture and user.avatar_url != profile.picture:
            user.avatar_url = profile.picture
        if profile.name and user.name != profile.name:
            user.name = profile.name

    user.last_login_at = datetime.now(tz=UTC)
    await session.flush()
    await session.refresh(user, attribute_names=["organization"])
    return user


async def upsert_dev_user(
    session: AsyncSession,
    email: str,
    name: str | None = None,
    *,
    auto_create_org: bool = True,
) -> User:
    """Dev-bypass twin of the Google upsert: creates (or finds) a User
    without an OAuth round-trip.

    Default `auto_create_org=True` keeps the existing dev workflow working
    (admin@example.com lands directly in a usable app). Set False to
    exercise the create-org / invite-accept paths from dev-login.
    """
    stmt = select(User).where(User.email == email)
    user = (await session.execute(stmt)).scalar_one_or_none()

    if user is None:
        user = User(
            email=email,
            name=name or email.split("@", 1)[0].capitalize(),
            role=UserRole.salesperson,
            organization_id=None,
        )
        session.add(user)
        await session.flush()

    if auto_create_org and user.organization_id is None:
        await create_organization_with_admin(
            session, name=_default_org_name(email), founder=user
        )

    user.last_login_at = datetime.now(tz=UTC)
    await session.flush()
    await session.refresh(user, attribute_names=["organization"])
    return user


def _default_org_name(email: str) -> str:
    domain = email.split("@", 1)[1] if "@" in email else "Nová firma"
    label = domain.rsplit(".", 1)[0]
    return label.capitalize() or "Nová firma"


__all__ = [
    "InvitationAlreadyConsumedError",
    "InvitationEmailMismatchError",
    "InvitationExpiredError",
    "InvitationNotFoundError",
    "UserAlreadyInOrganizationError",
    "upsert_dev_user",
    "upsert_user_from_google_profile",
]
