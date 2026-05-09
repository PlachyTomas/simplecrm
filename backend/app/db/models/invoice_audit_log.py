"""Append-only event log for invoice lifecycle.

Insert-only by design: the ``trg_invoice_audit_log_no_update`` and
``trg_invoice_audit_log_no_delete`` triggers reject any UPDATE or DELETE
at the database level so a compromised application role still can't
rewrite invoice history.

Event values used by the orchestrator (commit #5):
  ``allocated`` | ``issued`` | ``pdf_stored`` | ``pdf_verified`` |
  ``sent`` | ``send_failed`` | ``paid`` | ``voided`` |
  ``credit_note_created`` | ``export_run`` | ``integrity_failure``

``invoice_id`` is nullable so cross-cutting events (year-export job
runs, weekly archive integrity checks) can be logged without a
specific invoice context.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class InvoiceAuditLog(Base):
    __tablename__ = "invoice_audit_log"
    __table_args__ = (
        Index("ix_invoice_audit_log_invoice_id", "invoice_id"),
        Index("ix_invoice_audit_log_event", "event"),
        Index("ix_invoice_audit_log_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("invoices.id"),
    )
    event: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default="{}", default=dict
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
