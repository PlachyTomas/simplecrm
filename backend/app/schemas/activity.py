from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.db.models.enums import ActivityEntityType, ActivityType


class ActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    entity_type: ActivityEntityType
    entity_id: uuid.UUID
    user_id: uuid.UUID | None
    activity_type: ActivityType
    payload: dict[str, Any]
    created_at: datetime
