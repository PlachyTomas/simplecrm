from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.db.models.enums import UserRole


class OrganizationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    locale: str
    currency: str
    trial_ends_at: datetime


class CurrentUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    name: str
    avatar_url: str | None = None
    role: UserRole
    organization: OrganizationSummary


class AuthCallbackResult(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105 — OAuth token-type string, not a password
    user: CurrentUser
