from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.db.models.enums import EmailDirection, SentEmailStatus


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
    # Embed the open pixel + rewrite links through the click tracker. On by
    # default; the composer can opt out per send (no token is issued then,
    # and the mail goes out plain-text-only exactly as before tracking).
    # An org-level opt-out (`Organization.email_tracking_enabled=false`)
    # overrides this — tracking is then off regardless of what is sent here.
    track: bool = True
    # Append the sender's stored signature (Nastavení → SMTP) behind the
    # RFC 3676 "-- " delimiter, after merge fields resolve. On by default.
    append_signature: bool = True


class SentEmailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    sender_user_id: uuid.UUID | None = None
    deal_id: uuid.UUID | None = None
    company_id: uuid.UUID | None = None
    # `inbound` rows come from Smart BCC (the user BCC'd their magic address);
    # `from_email` is the correspondent on those, NULL on outbound sends.
    direction: EmailDirection = EmailDirection.outbound
    from_email: str | None = None
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
    # Open/click tracking. `*_at` is the first event, `*_count` every event.
    # All zero/None for untracked sends (`track=false`) and pre-tracking rows.
    opened_at: datetime | None = None
    open_count: int = 0
    clicked_at: datetime | None = None
    click_count: int = 0


class SentEmailDetail(SentEmailOut):
    """One sent email plus every other mail sharing its `thread_id`."""

    thread: list[SentEmailOut] = Field(default_factory=list)
