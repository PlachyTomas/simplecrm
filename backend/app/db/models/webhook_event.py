from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WebhookEvent(Base):
    """Idempotency log for ComGate notifications.

    ComGate retries callbacks until acknowledged; we insert-or-skip on
    `comgate_event_id` so a re-delivery doesn't double-process a charge.
    `payload` is the raw POST body for forensics if a webhook needs to
    be replayed manually.
    """

    __tablename__ = "webhook_events"

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    comgate_event_id: Mapped[str] = mapped_column(
        String(128), unique=True, nullable=False
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
