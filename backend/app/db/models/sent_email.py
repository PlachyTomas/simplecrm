from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import EmailDirection, SentEmailStatus

if TYPE_CHECKING:
    from app.db.models.company import Company
    from app.db.models.deal import Deal
    from app.db.models.organization import Organization
    from app.db.models.user import User


class SentEmail(Base):
    """One email on a company/deal timeline — sent from the CRM, or captured
    inbound via Smart BCC. Recipient addresses are snapshotted as JSONB arrays;
    attachment *bytes* are never persisted (filenames only, consistent with
    bulk email).

    Threading: a fresh send starts a new `thread_id`; a follow-up ("Odpovědět")
    copies the parent's `thread_id` and links via `in_reply_to_message_id`. An
    inbound message whose `In-Reply-To` matches a mail we sent joins that same
    thread, so a BCC'd reply lands under its original.

    Despite the table name, `direction` is what says which way a row travelled
    (see :class:`EmailDirection`). The name is kept because renaming it would
    churn every history endpoint, index and migration for no user-visible gain.
    """

    __tablename__ = "sent_emails"
    __table_args__ = (
        Index("ix_sent_emails_deal_id", "deal_id"),
        Index("ix_sent_emails_company_id", "company_id"),
        Index("ix_sent_emails_thread_id", "thread_id"),
        Index("ix_sent_emails_organization_id_created_at", "organization_id", "created_at"),
        Index("ix_sent_emails_tracking_token", "tracking_token", unique=True),
        # Idempotency for the inbound pipeline: an MTA worker that retries
        # (or a user who BCCs twice) must not duplicate the timeline entry.
        # Scoped to the org because two orgs can legitimately capture the same
        # broadcast message.
        Index(
            "uq_sent_emails_organization_id_message_id",
            "organization_id",
            "message_id",
            unique=True,
        ),
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

    direction: Mapped[EmailDirection] = mapped_column(
        Enum(EmailDirection, name="email_direction"),
        nullable=False,
        default=EmailDirection.outbound,
        server_default=EmailDirection.outbound.value,
    )

    # Who the mail came FROM. NULL on outbound rows (the sender is
    # `sender_user_id`'s configured SMTP identity); on inbound rows it is the
    # correspondent's address, which is what the timeline shows.
    from_email: Mapped[str | None] = mapped_column(String(320))

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

    # Open/click tracking (see services/email_tracking.py). `tracking_token`
    # is NULL for historic rows and for sends made with `track=false`, so the
    # unique index tolerates many NULLs by design. `*_at` holds the *first*
    # event, `*_count` every subsequent one.
    tracking_token: Mapped[str | None] = mapped_column(Text)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    open_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    clicked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    click_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )

    organization: Mapped[Organization] = relationship()
    sender: Mapped[User | None] = relationship()
    deal: Mapped[Deal | None] = relationship()
    company: Mapped[Company | None] = relationship()
