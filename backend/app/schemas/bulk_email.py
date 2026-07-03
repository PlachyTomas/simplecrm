"""Schemas for the bulk-email feature (Phase B)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.db.models.enums import EmailRecipientStatus
from app.schemas.contact import ContactOut

# Hard cap on recipients per send. Shared with the service so the schema
# rejects oversized payloads before any work happens.
MAX_RECIPIENTS = 250


class BulkEmailFilters(BaseModel):
    """Filter criteria for choosing target companies. Always restricted to
    owned companies in the caller's scope (enforced server-side)."""

    industry: str | None = Field(default=None, max_length=120)
    city: str | None = Field(default=None, max_length=120)
    # Managers/admins may target a specific owner; ignored (forced to self)
    # for salespeople.
    owner_user_id: uuid.UUID | None = None
    # Target the unowned pool (Nezabrané) instead of an owner. Takes
    # precedence over `owner_user_id`; ignored for salespeople.
    unowned: bool = False
    # Company has a deal currently in this stage.
    stage_id: uuid.UUID | None = None
    # Company has at least one won deal.
    has_won_deal: bool | None = None
    # Company's last order is older than N days (or it never ordered).
    no_order_since_days: int | None = Field(default=None, ge=1, le=3650)


class RecipientCandidate(BaseModel):
    """A matched company with its resolved default recipient + contacts, so
    the wizard can let the user hand-pick which addresses to mail."""

    company_id: uuid.UUID
    company_name: str
    default_email: str | None  # company.email or main contact's email
    contacts: list[ContactOut]
    emailable: bool
    skip_reason: str | None = None  # "no_email" | "blocked"


class BulkEmailRecipientIn(BaseModel):
    company_id: uuid.UUID
    # Chosen addresses for this company (company email and/or contacts).
    emails: list[EmailStr] = Field(min_length=1, max_length=50)
    # Optional: the contact behind the first chosen address, for the
    # company-timeline link on the recorded recipient row.
    contact_id: uuid.UUID | None = None


class BulkEmailSendIn(BaseModel):
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1, max_length=20000)
    recipients: list[BulkEmailRecipientIn] = Field(min_length=1, max_length=MAX_RECIPIENTS)
    create_deals: bool = False
    deal_title: str | None = Field(default=None, max_length=200)


class CampaignRecipientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    company_id: uuid.UUID | None = None
    company_name: str
    email: str
    status: EmailRecipientStatus
    error: str | None = None
    sent_at: datetime | None = None


class CampaignOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    subject: str
    from_email: str
    attachment_filename: str | None = None
    total: int
    sent_count: int
    failed_count: int
    skipped_count: int
    created_at: datetime


class CampaignDetailOut(CampaignOut):
    body: str
    recipients: list[CampaignRecipientOut]
