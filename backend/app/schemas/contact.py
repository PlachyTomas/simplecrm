from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ContactCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    company_id: uuid.UUID | None = None
    position: str | None = Field(default=None, max_length=160)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    linkedin_url: str | None = Field(default=None, max_length=300)
    note: str | None = Field(default=None, max_length=2000)


class ContactUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=120)
    last_name: str | None = Field(default=None, min_length=1, max_length=120)
    company_id: uuid.UUID | None = None
    position: str | None = Field(default=None, max_length=160)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    linkedin_url: str | None = Field(default=None, max_length=300)
    note: str | None = Field(default=None, max_length=2000)


class ContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    company_id: uuid.UUID | None = None
    first_name: str
    last_name: str
    position: str | None = None
    email: str | None = None
    phone: str | None = None
    linkedin_url: str | None = None
    note: str | None = None
    created_at: datetime
    updated_at: datetime
