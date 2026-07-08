from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.db.models.enums import SentEmailStatus


class SentEmailCreate(BaseModel):
    """The JSON `payload` part of the multipart compose request.

    Attachments ride alongside as `attachments[]` file parts, validated at the
    API boundary (allowlist + size cap).
    """

    to: list[EmailStr] = Field(min_length=1)
    cc: list[EmailStr] = Field(default_factory=list)
    bcc: list[EmailStr] = Field(default_factory=list)
    subject: str = Field(min_length=1, max_length=300)
    body: str = ""
    deal_id: uuid.UUID | None = None
    company_id: uuid.UUID | None = None
    # When set, this send is a follow-up to a previously *sent* email: it
    # inherits that mail's thread_id and links via In-Reply-To/References.
    reply_to_email_id: uuid.UUID | None = None


class SentEmailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    sender_user_id: uuid.UUID | None = None
    deal_id: uuid.UUID | None = None
    company_id: uuid.UUID | None = None
    to_emails: list[str]
    cc_emails: list[str]
    bcc_emails: list[str]
    subject: str
    body: str
    attachment_filenames: list[str]
    status: SentEmailStatus
    error: str | None = None
    message_id: str
    in_reply_to_message_id: str | None = None
    thread_id: uuid.UUID
    sent_at: datetime | None = None
    created_at: datetime


class SentEmailDetail(SentEmailOut):
    """One sent email plus every other mail sharing its `thread_id`."""

    thread: list[SentEmailOut] = Field(default_factory=list)
