from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class DealCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    company_id: uuid.UUID
    stage_id: uuid.UUID
    owner_user_id: uuid.UUID | None = None
    primary_contact_id: uuid.UUID | None = None
    value: Decimal = Field(default=Decimal("0"), ge=Decimal("0"))
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    probability_override: int | None = Field(default=None, ge=0, le=100)
    expected_close_date: date | None = None


class DealUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    company_id: uuid.UUID | None = None
    stage_id: uuid.UUID | None = None
    owner_user_id: uuid.UUID | None = None
    primary_contact_id: uuid.UUID | None = None
    value: Decimal | None = Field(default=None, ge=Decimal("0"))
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    probability_override: int | None = Field(default=None, ge=0, le=100)
    expected_close_date: date | None = None
    lost_reason: str | None = Field(default=None, max_length=200)


class DealStageMove(BaseModel):
    stage_id: uuid.UUID


class DealMarkLost(BaseModel):
    lost_reason: str = Field(min_length=1, max_length=200)


class DealPaymentUpdate(BaseModel):
    paid: bool


class DealOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    company_id: uuid.UUID
    stage_id: uuid.UUID
    owner_user_id: uuid.UUID | None = None
    primary_contact_id: uuid.UUID | None = None
    name: str
    value: Decimal
    currency: str
    probability_override: int | None = None
    expected_close_date: date | None = None
    closed_at: datetime | None = None
    lost_reason: str | None = None
    is_paid: bool = False
    paid_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
