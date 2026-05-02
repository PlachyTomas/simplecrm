from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

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
    # Nullable until the user finishes the create-org step on first login.
    # Frontend `ProtectedRoute` reads this and routes to /onboarding/create-org
    # when null instead of attempting any org-scoped queries.
    organization: OrganizationSummary | None = None


class AuthCallbackResult(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105 — OAuth token-type string, not a password
    user: CurrentUser
