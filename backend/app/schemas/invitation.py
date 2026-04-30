from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.db.models.enums import UserRole


class InvitationCreate(BaseModel):
    email: EmailStr
    role: UserRole
    team_id: uuid.UUID | None = None
    can_invite: bool = False


class InvitationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    email: EmailStr
    role: UserRole
    team_id: uuid.UUID | None = None
    can_invite: bool
    invited_by_user_id: uuid.UUID | None = None
    expires_at: datetime
    accepted_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime


class InvitationCreated(BaseModel):
    """Response payload for `POST /invitations`. Includes the dev-only
    `invite_url` for testability — once a real SMTP backend is wired in,
    this field stays useful for admins who want to copy the link manually
    (e.g. when the invitee never received the email)."""

    invitation: InvitationOut
    invite_url: str


class InvitationPreview(BaseModel):
    """Public preview shown on the AcceptInvitePage before the invitee
    signs in with Google. No tokens or org IDs are exposed beyond what's
    strictly needed to render the page."""

    organization_name: str = Field(min_length=1)
    email: EmailStr
    role: UserRole
    team_name: str | None = None


class CreateOrganizationIn(BaseModel):
    """Body for `POST /onboarding/organization` — submitted by a freshly
    signed-up user with no org yet."""

    name: str = Field(min_length=1, max_length=200)
