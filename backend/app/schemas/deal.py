from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from app.db.models import Deal


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


class DealListItemOut(DealOut):
    """`DealOut` plus denormalized display fields so list views (Firmy →
    obchody, the all-deals table) can render names — not UUIDs — without a
    per-row fetch. Mirrors the `deal_name` denormalization on the events list.
    """

    company_name: str
    company_email: str | None = None
    stage_name: str
    owner_name: str | None = None
    primary_contact_name: str | None = None
    primary_contact_email: str | None = None

    @classmethod
    def from_deal(cls, deal: Deal) -> DealListItemOut:
        """Build from a `Deal` whose `company`, `stage`, `owner`, and
        `primary_contact` relationships have been eager-loaded."""
        contact = deal.primary_contact
        contact_name = f"{contact.first_name} {contact.last_name}".strip() if contact else None
        return cls(
            **DealOut.model_validate(deal).model_dump(),
            company_name=deal.company.name,
            company_email=deal.company.email,
            stage_name=deal.stage.name,
            owner_name=deal.owner.name if deal.owner else None,
            primary_contact_name=contact_name,
            primary_contact_email=contact.email if contact else None,
        )
