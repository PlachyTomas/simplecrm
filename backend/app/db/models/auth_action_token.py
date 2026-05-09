from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AuthActionToken(Base):
    """Short-lived signed tokens for email-auth side trips.

    Two purposes share one table:
      * ``verify_email``   — confirms a fresh signup or links a password
                             onto an existing Google-only account.
      * ``reset_password`` — proves email ownership before letting the
                             user pick a new password.

    The link mailed to the user carries a signed itsdangerous token whose
    payload is just the ``jti``. Each row also pins an ``expires_at`` so a
    leaked DB snapshot can't outlive the cryptographic TTL. Tokens are
    deleted on consume (matches the ``refresh_tokens`` allowlist pattern)
    and on resend so only one outstanding link per (user, purpose) is
    valid at a time.
    """

    __tablename__ = "auth_action_tokens"
    __table_args__ = (Index("ix_auth_action_tokens_user_id", "user_id"),)

    # secrets.token_urlsafe(16) produces a 22-char base64url string; 64 chars
    # leaves headroom for a future entropy bump.
    jti: Mapped[str] = mapped_column(String(64), primary_key=True)

    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Plain string column, not an Enum, to keep the migration cheap. Values
    # come from `AuthActionPurpose` in services/email_auth.py.
    purpose: Mapped[str] = mapped_column(String(32), nullable=False)

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
