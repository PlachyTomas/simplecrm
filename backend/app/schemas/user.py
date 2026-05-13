from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.db.models.enums import UserRole


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    name: str
    avatar_url: str | None = None
    role: UserRole
    team_id: uuid.UUID | None = None
    can_invite: bool
    is_active: bool
    max_owned_companies: int | None = None
    last_login_at: datetime | None = None
    created_at: datetime


class UserUpdate(BaseModel):
    role: UserRole | None = None
    team_id: uuid.UUID | None = None
    can_invite: bool | None = None
    is_active: bool | None = None
    # `Field(...)` distinguishes "field not present in payload" (leave alone)
    # from "field is explicitly null" (clear the cap → unlimited).
    max_owned_companies: int | None = Field(default=None, ge=0)
