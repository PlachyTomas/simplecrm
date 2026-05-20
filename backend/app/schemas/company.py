from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.contact import ContactOut


class CompanyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    ico: str | None = Field(default=None, pattern=r"^\d{8}$")
    dic: str | None = Field(default=None, max_length=16)
    address_street: str | None = Field(default=None, max_length=200)
    address_city: str | None = Field(default=None, max_length=120)
    address_zip: str | None = Field(default=None, max_length=12)
    legal_form: str | None = Field(default=None, max_length=120)
    website: str | None = Field(default=None, max_length=300)
    email: EmailStr | None = Field(default=None, max_length=320)
    phone: str | None = Field(default=None, max_length=40)
    industry: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=2000)
    owner_user_id: uuid.UUID | None = None


class CompanyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    ico: str | None = Field(default=None, pattern=r"^\d{8}$")
    dic: str | None = Field(default=None, max_length=16)
    address_street: str | None = Field(default=None, max_length=200)
    address_city: str | None = Field(default=None, max_length=120)
    address_zip: str | None = Field(default=None, max_length=12)
    legal_form: str | None = Field(default=None, max_length=120)
    website: str | None = Field(default=None, max_length=300)
    email: EmailStr | None = Field(default=None, max_length=320)
    phone: str | None = Field(default=None, max_length=40)
    industry: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=2000)
    owner_user_id: uuid.UUID | None = None
    main_contact_id: uuid.UUID | None = None


class CompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    ico: str | None = None
    dic: str | None = None
    address_street: str | None = None
    address_city: str | None = None
    address_zip: str | None = None
    legal_form: str | None = None
    website: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    industry: str | None = None
    note: str | None = None
    owner_user_id: uuid.UUID | None = None
    last_order_at: datetime | None = None
    ownership_expires_at: datetime
    created_at: datetime
    updated_at: datetime
    main_contact_id: uuid.UUID | None = None
    # Resolved server-side: the explicitly-chosen main contact when set,
    # otherwise the alphabetically-first contact on the company. Null
    # when the company has no contacts at all.
    main_contact: ContactOut | None = None
