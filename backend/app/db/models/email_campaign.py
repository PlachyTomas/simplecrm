from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import EmailRecipientStatus

if TYPE_CHECKING:
    from app.db.models.organization import Organization
    from app.db.models.user import User


class EmailCampaign(Base):
    """A single bulk-email send. Stores the message text + per-send counts;
    one `EmailCampaignRecipient` row per addressee records the outcome so the
    user can later check what was sent and whether the server accepted it.

    Attachment bytes are intentionally not persisted — only the filename.
    """

    __tablename__ = "email_campaigns"
    __table_args__ = (
        Index("ix_email_campaigns_org_created", "organization_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )

    subject: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    from_email: Mapped[str] = mapped_column(String(320), nullable=False)
    attachment_filename: Mapped[str | None] = mapped_column(String(255))

    total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sent_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skipped_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    recipients: Mapped[list[EmailCampaignRecipient]] = relationship(
        back_populates="campaign", cascade="all, delete-orphan"
    )
    created_by: Mapped[User | None] = relationship()
    organization: Mapped[Organization] = relationship()


class EmailCampaignRecipient(Base):
    """One addressee within a campaign, with the delivery outcome.

    `email` / `company_name` are snapshots so history survives later edits or
    deletion of the underlying company/contact.
    """

    __tablename__ = "email_campaign_recipients"
    __table_args__ = (Index("ix_email_campaign_recipients_campaign", "campaign_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("email_campaigns.id", ondelete="CASCADE"),
        nullable=False,
    )
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="SET NULL"),
    )
    contact_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("contacts.id", ondelete="SET NULL"),
    )

    email: Mapped[str] = mapped_column(String(320), nullable=False)
    company_name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[EmailRecipientStatus] = mapped_column(
        Enum(EmailRecipientStatus, name="email_recipient_status"), nullable=False
    )
    error: Mapped[str | None] = mapped_column(String(500))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    campaign: Mapped[EmailCampaign] = relationship(back_populates="recipients")
