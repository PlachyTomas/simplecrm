from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RefreshToken(Base):
    """Allowlist of active refresh-token jtis.

    A refresh JWT is only honored when its `jti` claim is present in this
    table. Issuing a token (OAuth callback, dev-login, refresh rotation)
    inserts a row; refresh rotates by deleting the old row and inserting
    a new one; logout deletes the current row. Closes the
    cryptographic-rotation-but-no-server-side-invalidation gap (QA-024
    Part B): a leaked refresh JWT becomes useless the moment the legitimate
    user refreshes.

    Multi-device safe — each device has its own row, so revoking one does
    not affect the others. `expires_at` is set to the JWT's `exp` so we
    can prune expired rows opportunistically without watching the JWT.
    """

    __tablename__ = "refresh_tokens"
    __table_args__ = (
        Index("ix_refresh_tokens_user_id", "user_id"),
        Index("ix_refresh_tokens_expires_at", "expires_at"),
    )

    # `secrets.token_urlsafe(16)` produces a 22-char base64url string;
    # 64 chars leaves headroom if the entropy is ever bumped.
    jti: Mapped[str] = mapped_column(String(64), primary_key=True)

    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
