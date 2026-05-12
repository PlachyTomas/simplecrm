from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.db.models.enums import UserRole


class OrganizationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    ico: str | None = None
    locale: str
    currency: str
    trial_ends_at: datetime
    show_leaderboard_to_salespeople: bool
    ownership_window_days: int


class CurrentUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    name: str
    avatar_url: str | None = None
    role: UserRole
    can_invite: bool
    # Drives the super-admin gear icon in the user menu and the route guard
    # on /admin. Exposed on /auth/me so the frontend doesn't need a probe
    # request to figure out who can see the admin surface.
    is_super_admin: bool = False
    # False for users who registered with email+password and haven't clicked
    # the verification link yet. We no longer block login on this — the
    # frontend shows a banner with a "resend verification email" CTA.
    email_verified: bool = False
    # Nullable until the user finishes the create-org step on first login.
    # Frontend `ProtectedRoute` reads this and routes to /onboarding/create-org
    # when null instead of attempting any org-scoped queries.
    organization: OrganizationSummary | None = None


class AuthCallbackResult(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105 — OAuth token-type string, not a password
    user: CurrentUser


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    name: str = Field(min_length=1, max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class TokenCheckRequest(BaseModel):
    token: str = Field(min_length=1, max_length=2048)


class TokenCheckResponse(BaseModel):
    email: EmailStr
    requires_password: bool


class VerifyConsumeRequest(BaseModel):
    token: str = Field(min_length=1, max_length=2048)
    # Optional: only required when the token belongs to an oauth-only user
    # who's setting their first password through this flow.
    password: str | None = Field(default=None, min_length=12, max_length=128)


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirmRequest(BaseModel):
    token: str = Field(min_length=1, max_length=2048)
    new_password: str = Field(min_length=12, max_length=128)


class InviteAcceptRequest(BaseModel):
    """Body for `POST /auth/invite/accept`. Email is taken from the invite
    row, not the request, so the user can't accept under a different
    address. Password is ignored if the matched User already has one set
    (preserving an existing credential)."""

    token: str = Field(min_length=1, max_length=2048)
    password: str = Field(min_length=12, max_length=128)
    name: str = Field(min_length=1, max_length=200)


class AuthSuccessResponse(BaseModel):
    """Returned by signup-verify, login, password-reset-confirm — the same
    shape as the Google callback's hash redirect, just over JSON."""

    access_token: str
    token_type: str = "bearer"  # noqa: S105
    user: CurrentUser
