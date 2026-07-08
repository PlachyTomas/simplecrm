from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import SentEmailStatus

if TYPE_CHECKING:
    from app.db.models.company import Company
    from app.db.models.deal import Deal
    from app.db.models.organization import Organization
    from app.db.models.user import User


class SentEmail(Base):
    """A single email the user composed and sent from the CRM (send-only mail
    client). Recipient addresses are snapshotted as JSONB arrays; attachment
    *bytes* are not persisted (filenames only, consistent with bulk email).

    Threading: a fresh send starts a new `thread_id`; a follow-up ("Odpovědět")
    copies the parent's `thread_id` and links via `in_reply_to_message_id`. A
    "thread" is the chain of mails *we* sent — there is no inbox, so inbound
    replies are never captured.
    """

    __tablename__ = "sent_emails"
    __table_args__ = (
        Index("ix_sent_emails_deal_id", "deal_id"),
        Index("ix_sent_emails_company_id", "company_id"),
        Index("ix_sent_emails_thread_id", "thread_id"),
        Index("ix_sent_emails_organization_id_created_at", "organization_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    sender_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    deal_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("deals.id", ondelete="SET NULL"),
    )
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="SET NULL"),
    )

    # Recipient snapshots — lists of raw address strings.
    to_emails: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    cc_emails: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    bcc_emails: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)

    subject: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # Filenames only — bytes are not persisted (matches bulk email).
    attachment_filenames: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)

    status: Mapped[SentEmailStatus] = mapped_column(
        Enum(SentEmailStatus, name="sent_email_status"),
        nullable=False,
    )
    error: Mapped[str | None] = mapped_column(String(500))

    # The Message-ID we stamp on the outbound mail, plus the threading links.
    message_id: Mapped[str] = mapped_column(String(500), nullable=False)
    in_reply_to_message_id: Mapped[str | None] = mapped_column(String(500))
    thread_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)

    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    organization: Mapped[Organization] = relationship()
    sender: Mapped[User | None] = relationship()
    deal: Mapped[Deal | None] = relationship()
    company: Mapped[Company | None] = relationship()
