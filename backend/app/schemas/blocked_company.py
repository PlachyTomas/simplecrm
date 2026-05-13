from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.db.models.enums import BlockedCompanyReason


class BlockedCompanyCreate(BaseModel):
    ico: str = Field(min_length=8, max_length=8, pattern=r"^\d{8}$")
    reason_category: BlockedCompanyReason
    note: str | None = Field(default=None, max_length=500)


class BlockedCompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ico: str
    reason_category: BlockedCompanyReason
    note: str | None = None
    ares_name: str | None = None
    created_by: uuid.UUID | None = None
    created_at: datetime
