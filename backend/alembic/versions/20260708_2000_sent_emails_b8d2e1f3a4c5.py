"""sent_emails: single-email send history

Revision ID: b8d2e1f3a4c5
Revises: a7c1f0b2d3e4
Create Date: 2026-07-08 20:00:00.000000+00:00

Table backing the send-only mail client: one row per user-composed email
(sent or failed), with recipient/attachment-filename snapshots and threading
columns. Attachment bytes are NOT persisted (filenames only, as with bulk
email).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "b8d2e1f3a4c5"
down_revision: str | None = "a7c1f0b2d3e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sent_emails",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("sender_user_id", sa.UUID(), nullable=True),
        sa.Column("deal_id", sa.UUID(), nullable=True),
        sa.Column("company_id", sa.UUID(), nullable=True),
        sa.Column("to_emails", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("cc_emails", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("bcc_emails", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("subject", sa.String(length=300), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "attachment_filenames", postgresql.JSONB(astext_type=sa.Text()), nullable=False
        ),
        sa.Column(
            "status",
            sa.Enum("sent", "failed", name="sent_email_status"),
            nullable=False,
        ),
        sa.Column("error", sa.String(length=500), nullable=True),
        sa.Column("message_id", sa.String(length=500), nullable=False),
        sa.Column("in_reply_to_message_id", sa.String(length=500), nullable=True),
        sa.Column("thread_id", sa.UUID(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sender_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sent_emails_deal_id", "sent_emails", ["deal_id"])
    op.create_index("ix_sent_emails_company_id", "sent_emails", ["company_id"])
    op.create_index("ix_sent_emails_thread_id", "sent_emails", ["thread_id"])
    op.create_index(
        "ix_sent_emails_organization_id_created_at",
        "sent_emails",
        ["organization_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_sent_emails_organization_id_created_at", table_name="sent_emails")
    op.drop_index("ix_sent_emails_thread_id", table_name="sent_emails")
    op.drop_index("ix_sent_emails_company_id", table_name="sent_emails")
    op.drop_index("ix_sent_emails_deal_id", table_name="sent_emails")
    op.drop_table("sent_emails")
    op.execute("DROP TYPE IF EXISTS sent_email_status")
