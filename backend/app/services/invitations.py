"""Invitation lifecycle: create, send, list, revoke, accept.

Architecture:
- A signed URL-safe token (`itsdangerous.URLSafeTimedSerializer`) carries
  only the invite's `token_jti`. The Invitation row holds the source of
  truth for the email, role, team, can_invite, expiry, and accept/revoke
  state.
- Email delivery goes through the existing `services/email.py` stub, which
  logs at INFO in MVP and will swap to a real provider with no caller
  changes.
- Cross-org membership is forbidden: if the invitee's email already maps
  to a User in another org, acceptance fails with a typed error so the
  API can return 409 with `code="user_already_in_organization"`.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.config import get_settings
from app.core.security import (
    INVITE_TOKEN_TTL_SECONDS,
    InviteTokenExpiredError,
    InviteTokenInvalidError,
    sign_invite_token,
    verify_invite_token,
)
from app.db.models import Invitation, Subscription, Team, User, UserRole
from app.services.email import Email, send_email
from app.services.google_oauth import GoogleProfile


class InvitationError(Exception):
    """Base class for invitation-acceptance failures the API should map to HTTP errors."""


class InvitationNotFoundError(InvitationError):
    """Token signature is valid but no matching Invitation row exists."""


class InvitationAlreadyConsumedError(InvitationError):
    """The invitation was already accepted or revoked."""


class InvitationExpiredError(InvitationError):
    """Invitation row's `expires_at` has passed (regardless of token signature TTL)."""


class InvitationEmailMismatchError(InvitationError):
    """The Google profile email doesn't match the email the invite was sent to."""


class UserAlreadyInOrganizationError(InvitationError):
    """A User row with the invitee's email already belongs to another org.

    Cross-org membership is intentionally not supported (see
    `db/models/user.py`). The API returns 409 with `code="user_already_in_organization"`.
    """


class SeatLimitReachedError(InvitationError):
    """The org is at its contracted seat count (active users + open
    invitations). Admin must increase `Subscription.seat_count` (or
    revoke an open invitation) before issuing more invites.
    """


@dataclass(frozen=True)
class IssuedInvitation:
    invitation: Invitation
    token: str


def _now() -> datetime:
    return datetime.now(tz=UTC)


def build_invite_link(token: str) -> str:
    """Build the invite-acceptance URL the email links to. Falls back to a
    relative path when no frontend base URL is configured (dev/test)."""
    base = get_settings().frontend_success_redirect
    # `frontend_success_redirect` is something like "https://app.example.com/app";
    # peel any trailing path so /invite/<token> lands on the right host.
    origin = base.split("/", 3)
    root = "/".join(origin[:3]) if base.startswith(("http://", "https://")) else ""
    return f"{root}/invite/{token}"


def _build_invite_email(*, to: str, organization_name: str, link: str) -> Email:
    subject = f"SimpleCRM: pozvánka do {organization_name}"
    body = (
        f"Ahoj,\n\n"
        f"byli jste pozváni do organizace {organization_name} v aplikaci SimpleCRM.\n"
        f"Pozvánku přijměte kliknutím na následující odkaz:\n\n"
        f"{link}\n\n"
        "Odkaz vyprší za 7 dní.\n"
    )
    return Email(to=to, subject=subject, body=body)


async def create_invitation(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    inviter: User,
    email: str,
    role: UserRole,
    team_id: uuid.UUID | None,
    can_invite: bool,
) -> IssuedInvitation:
    """Create a pending invitation and dispatch the invite email.

    The caller is the API layer, which is already gated by `require_can_invite`.
    Pre-conditions checked here:
      - `team_id` (if given) belongs to `organization_id`.
      - No open invitation for `(organization_id, lower(email))` already exists.
      - No User with this email is already in *another* org.
    """
    normalized_email = email.strip().lower()

    if team_id is not None:
        team = await session.get(Team, team_id)
        if team is None or team.organization_id != organization_id:
            raise ValueError("Team does not exist in your organization")

    # Reject cross-org takeovers up-front so admins don't waste an invite
    # on someone they can't actually onboard.
    existing_user_stmt = select(User).where(User.email == normalized_email)
    existing_user = (await session.execute(existing_user_stmt)).scalar_one_or_none()
    if (
        existing_user is not None
        and existing_user.organization_id is not None
        and existing_user.organization_id != organization_id
    ):
        raise UserAlreadyInOrganizationError()

    # Reject duplicate open invitation for the same (org, email).
    open_invite_stmt = select(Invitation).where(
        Invitation.organization_id == organization_id,
        Invitation.email == normalized_email,
        Invitation.accepted_at.is_(None),
        Invitation.revoked_at.is_(None),
    )
    if (await session.execute(open_invite_stmt)).scalar_one_or_none() is not None:
        raise ValueError("An open invitation for this email already exists")

    # Enforce the contracted seat count: active users + still-open invitations
    # must stay ≤ Subscription.seat_count. The admin needs to bump seats in
    # Settings → Organizace before issuing more invites.
    sub = (
        await session.execute(
            select(Subscription).where(Subscription.organization_id == organization_id)
        )
    ).scalar_one_or_none()
    if sub is not None:
        active_count = (
            await session.execute(
                select(func.count(User.id))
                .where(User.organization_id == organization_id)
                .where(User.is_active.is_(True))
            )
        ).scalar_one()
        open_invite_count = (
            await session.execute(
                select(func.count(Invitation.id))
                .where(Invitation.organization_id == organization_id)
                .where(Invitation.accepted_at.is_(None))
                .where(Invitation.revoked_at.is_(None))
            )
        ).scalar_one()
        if active_count + open_invite_count >= sub.seat_count:
            raise SeatLimitReachedError(
                f"Seat limit reached: {sub.seat_count} contracted, "
                f"{active_count} active + {open_invite_count} pending invitations."
            )

    jti = uuid.uuid4()
    invitation = Invitation(
        organization_id=organization_id,
        email=normalized_email,
        role=role,
        team_id=team_id,
        can_invite=can_invite,
        invited_by_user_id=inviter.id,
        token_jti=jti,
        expires_at=_now() + timedelta(seconds=INVITE_TOKEN_TTL_SECONDS),
    )
    session.add(invitation)
    await session.flush()
    await session.refresh(invitation, attribute_names=["organization"])

    token = sign_invite_token(jti)
    org_name = invitation.organization.name if invitation.organization else "SimpleCRM"
    await send_email(_build_invite_email(to=normalized_email, organization_name=org_name, link=build_invite_link(token)))

    return IssuedInvitation(invitation=invitation, token=token)


async def revoke_invitation(
    session: AsyncSession,
    *,
    invitation_id: uuid.UUID,
    actor: User,
) -> Invitation:
    """Mark an invitation revoked. Idempotent: revoking an already-consumed
    invitation is a no-op (returns the row unchanged)."""
    invitation = await session.get(Invitation, invitation_id)
    if invitation is None or invitation.organization_id != actor.organization_id:
        raise InvitationNotFoundError()
    if invitation.accepted_at is not None or invitation.revoked_at is not None:
        return invitation
    invitation.revoked_at = _now()
    await session.flush()
    return invitation


async def get_invitation_by_token(session: AsyncSession, token: str) -> Invitation:
    """Resolve a signed token to an Invitation row, validating signature
    TTL, row state, and `expires_at`."""
    try:
        jti = verify_invite_token(token)
    except InviteTokenExpiredError as exc:
        raise InvitationExpiredError() from exc
    except InviteTokenInvalidError as exc:
        raise InvitationNotFoundError() from exc

    stmt = (
        select(Invitation)
        .where(Invitation.token_jti == jti)
        .options(joinedload(Invitation.organization), joinedload(Invitation.team))
    )
    invitation = (await session.execute(stmt)).scalar_one_or_none()
    if invitation is None:
        raise InvitationNotFoundError()
    if invitation.revoked_at is not None:
        raise InvitationAlreadyConsumedError()
    if invitation.accepted_at is not None:
        raise InvitationAlreadyConsumedError()
    if invitation.expires_at <= _now():
        raise InvitationExpiredError()
    return invitation


async def accept_invitation_for_google_profile(
    session: AsyncSession,
    *,
    token: str,
    profile: GoogleProfile,
) -> User:
    """Consume an invitation as part of the Google OAuth callback flow.

    Caller (the OAuth callback) has already exchanged the OAuth code for a
    `GoogleProfile`. We:
      1. Resolve token → Invitation, validating signature, state, expiry.
      2. Verify the Google email matches the invite's email.
      3. Reject if the email already belongs to a *different* org.
      4. Create or update the User, attaching `google_id`, role, team, and
         `can_invite` from the invite.
      5. Mark the invitation accepted.
    """
    invitation = await get_invitation_by_token(session, token)

    if profile.email.strip().lower() != invitation.email:
        raise InvitationEmailMismatchError()

    existing_stmt = select(User).where(User.email == invitation.email)
    user = (await session.execute(existing_stmt)).scalar_one_or_none()

    if user is not None:
        if user.organization_id is not None and user.organization_id != invitation.organization_id:
            raise UserAlreadyInOrganizationError()
        # User exists from a prior signup attempt without an org, or matches
        # this org already — adopt the invitation's role/team/can_invite.
        user.organization_id = invitation.organization_id
        user.role = invitation.role
        user.team_id = invitation.team_id
        user.can_invite = invitation.can_invite
        if user.google_id is None:
            user.google_id = profile.google_id
        if profile.picture and user.avatar_url != profile.picture:
            user.avatar_url = profile.picture
        if profile.name and user.name != profile.name:
            user.name = profile.name
    else:
        user = User(
            email=invitation.email,
            name=profile.name or invitation.email.split("@", 1)[0].capitalize(),
            avatar_url=profile.picture,
            google_id=profile.google_id,
            role=invitation.role,
            organization_id=invitation.organization_id,
            team_id=invitation.team_id,
            can_invite=invitation.can_invite,
        )
        session.add(user)

    invitation.accepted_at = _now()
    await session.flush()
    await session.refresh(user, attribute_names=["organization"])
    return user


async def accept_invitation_for_email_signup(
    session: AsyncSession,
    *,
    token: str,
    password: str,
    name: str,
) -> User:
    """Consume an invitation as part of an email + password signup.

    Click on the invite link is itself proof of email ownership (only the
    inbox owner could receive it), so we don't send a separate verification
    email — we just mark `email_verified=True` and auto-login.

    Behavior matrix on `password_hash`:
      * No user exists for invite.email → create with `password_hash=hash(password)`,
        adopt the invite's org/role/team/can_invite, mark verified.
      * User exists with no password (Google-only) → set `password_hash`, adopt
        the invite, mark verified. The two methods are now linked on one row.
      * User exists with a password already set → DO NOT overwrite the
        password. Adopt the invite's org/role/team. The user keeps logging in
        with whatever password they had; auto-login is justified by the
        invite-token-as-email-proof.

    Cross-org safety: if the existing user already belongs to a *different*
    org, raise `UserAlreadyInOrganizationError` — caller maps to 409 with the
    same error code as the Google invite path.

    Caller is responsible for password-strength validation before calling.
    """
    invitation = await get_invitation_by_token(session, token)

    existing_stmt = select(User).where(User.email == invitation.email)
    user = (await session.execute(existing_stmt)).scalar_one_or_none()

    if user is not None:
        if (
            user.organization_id is not None
            and user.organization_id != invitation.organization_id
        ):
            raise UserAlreadyInOrganizationError()
        # Adopt the invite. Preserve any existing password — the invite click
        # is enough to justify the org change, but not enough to overwrite a
        # credential the user might still rely on.
        user.organization_id = invitation.organization_id
        user.role = invitation.role
        user.team_id = invitation.team_id
        user.can_invite = invitation.can_invite
        if user.password_hash is None:
            # Defer the heavy import so module load stays cheap.
            from app.core.passwords import hash_password

            user.password_hash = hash_password(password)
        if name and name != user.name:
            user.name = name
        if not user.email_verified:
            user.email_verified = True
            user.email_verified_at = _now()
    else:
        from app.core.passwords import hash_password

        user = User(
            email=invitation.email,
            name=name or invitation.email.split("@", 1)[0].capitalize(),
            password_hash=hash_password(password),
            email_verified=True,
            email_verified_at=_now(),
            role=invitation.role,
            organization_id=invitation.organization_id,
            team_id=invitation.team_id,
            can_invite=invitation.can_invite,
        )
        session.add(user)

    user.last_login_at = _now()
    invitation.accepted_at = _now()
    await session.flush()
    await session.refresh(user, attribute_names=["organization"])
    return user
