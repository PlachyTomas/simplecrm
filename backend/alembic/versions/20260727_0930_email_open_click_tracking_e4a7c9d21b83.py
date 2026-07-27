"""email open + click tracking

Revision ID: e4a7c9d21b83
Revises: c7d8e9f0a1b2
Create Date: 2026-07-27 09:30:00.000000+00:00

Adds the per-send tracking columns to both outbound-mail surfaces:
`sent_emails` (1:1 composer) and `email_campaign_recipients` (bulk
campaigns). `tracking_token` is nullable on purpose — every row written
before this migration, plus any send made with `track=false`, has none,
and Postgres lets a UNIQUE index hold arbitrarily many NULLs. The
counters are NOT NULL with a `0` server default so historic rows read
back as "never opened" instead of NULL.

Plain column adds + two unique indexes; no enum changes.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e4a7c9d21b83"
down_revision: str | None = "c7d8e9f0a1b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = ("sent_emails", "email_campaign_recipients")


def upgrade() -> None:
    for table in _TABLES:
        op.add_column(table, sa.Column("tracking_token", sa.Text(), nullable=True))
        op.add_column(table, sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True))
        op.add_column(
            table,
            sa.Column("open_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        )
        op.add_column(table, sa.Column("clicked_at", sa.DateTime(timezone=True), nullable=True))
        op.add_column(
            table,
            sa.Column("click_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        )
        op.create_index(f"ix_{table}_tracking_token", table, ["tracking_token"], unique=True)


def downgrade() -> None:
    for table in _TABLES:
        op.drop_index(f"ix_{table}_tracking_token", table_name=table)
        op.drop_column(table, "click_count")
        op.drop_column(table, "clicked_at")
        op.drop_column(table, "open_count")
        op.drop_column(table, "opened_at")
        op.drop_column(table, "tracking_token")
