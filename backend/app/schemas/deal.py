from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.db.models.enums import StageType

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
    note: str | None = Field(default=None, max_length=2000)


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
    note: str | None = Field(default=None, max_length=2000)


class DealStageMove(BaseModel):
    stage_id: uuid.UUID


class DealMarkLost(BaseModel):
    lost_reason: str = Field(min_length=1, max_length=200)


class DealPaymentUpdate(BaseModel):
    paid: bool


class DealNoteCreate(BaseModel):
    """Free-text note logged against a deal.

    Notes are not their own table — they are `ActivityType.note` rows in the
    activity log, so they show up in the deal/company timelines next to stage
    changes and sent emails without a second read model.
    """

    body: str = Field(min_length=1, max_length=2000)


class DealCallCreate(BaseModel):
    """A call that already happened, logged against a deal.

    The summary is optional on purpose: "I called them" is worth recording
    even when there's nothing to write down, and forcing a note would push
    people to type "-" instead of logging the call at all.
    """

    body: str | None = Field(default=None, max_length=2000)


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


class DealDetailOut(DealOut):
    """`DealOut` plus the fields only a single-deal view needs.

    `note` lives here rather than on `DealOut` because `DealOut` is the base
    of both `DealListItemOut` and `BoardDealOut`: put a 2000-char column on it
    and every kanban card and every list row starts carrying a description
    nothing renders. One deal by id → this; many deals → the leaner bases.
    """

    note: str | None = None


def _derive_deal_status(
    stage_type: StageType, closed_at: datetime | None
) -> Literal["open", "won", "lost"]:
    """Single-object mirror of the `deal_status` filter branches in
    `app.api.v1.deals._scoped_deals_query` — keep the two in sync. That
    query builds a SQL predicate over many rows; this derives the same
    partition for one already-loaded deal, so the shapes don't unify into
    one function, but the semantics must stay identical:
    won = won-type stage; lost = lost-type stage, or an open-type stage
    already closed (the house convention for "lost without its own
    stage"); open = open-type stage and not yet closed.
    """
    if stage_type == StageType.won:
        return "won"
    if stage_type == StageType.lost:
        return "lost"
    return "lost" if closed_at is not None else "open"


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
    status: Literal["open", "won", "lost"]

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
            status=_derive_deal_status(deal.stage.stage_type, deal.closed_at),
        )
