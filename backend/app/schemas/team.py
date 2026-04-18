from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TeamCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    manager_user_id: uuid.UUID | None = None


class TeamUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    manager_user_id: uuid.UUID | None = None


class TeamMemberUpdate(BaseModel):
    """Replace the team's member set in one call."""

    member_ids: list[uuid.UUID]


class TeamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    manager_user_id: uuid.UUID | None = None
    created_at: datetime
