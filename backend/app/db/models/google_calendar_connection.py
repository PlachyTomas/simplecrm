from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.organization import Organization
    from app.db.models.user import User


class GoogleCalendarConnection(Base):
    """Per-user Google Calendar OAuth grant.

    Separate from login OAuth — login only asks for `openid email profile`
    and discards Google tokens, so calendar access (scope `calendar.events`)
    needs its own consent + a stored refresh token. One connection per user;
    tokens are Fernet-encrypted at rest (`app.core.token_crypto`).
    """

    __tablename__ = "google_calendar_connections"
    __table_args__ = (Index("ix_google_calendar_connections_organization_id", "organization_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )

    # The Google account the calendar lives under — may differ from the
    # user's CRM login email (e.g. password signup with a work email,
    # calendar on a personal Gmail).
    google_email: Mapped[str] = mapped_column(String(320), nullable=False)

    refresh_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    access_token_encrypted: Mapped[str | None] = mapped_column(Text)
    access_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Flipped when Google answers `invalid_grant` (user revoked access in
    # their Google account). The UI then prompts a reconnect; event pushes
    # skip Google until the grant is refreshed.
    sync_broken: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped[User] = relationship()
    organization: Mapped[Organization] = relationship()
