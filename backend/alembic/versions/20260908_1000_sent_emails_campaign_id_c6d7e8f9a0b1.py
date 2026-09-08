"""sent_emails.campaign_id: campaign sends land in the mail history

Revision ID: c6d7e8f9a0b1
Revises: b5c6d7e8f9a0
Create Date: 2026-09-08 10:00:00.000000+00:00

Plain nullable column + FK + index — no enums, so nothing runs outside a
transaction. No backfill: historic campaigns stored the unrendered template
(merge fields literal), so they stay on the campaigns page only.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c6d7e8f9a0b1"
down_revision: str | None = "b5c6d7e8f9a0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sent_emails",
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_sent_emails_campaign_id_email_campaigns",
        "sent_emails",
        "email_campaigns",
        ["campaign_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_sent_emails_campaign_id", "sent_emails", ["campaign_id"])


def downgrade() -> None:
    op.drop_index("ix_sent_emails_campaign_id", table_name="sent_emails")
    op.drop_constraint(
        "fk_sent_emails_campaign_id_email_campaigns", "sent_emails", type_="foreignkey"
    )
    op.drop_column("sent_emails", "campaign_id")
