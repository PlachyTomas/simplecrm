"""event fields addons: all-day/reminders/meet + attendees table

Revision ID: b5c6d7e8f9a0
Revises: a4b5c6d7e8f9
Create Date: 2026-08-17 16:00:00.000000+00:00

Plain columns and a plain table — no native enums, so nothing here needs to
run outside a transaction, and no backfill: existing events default to
all_day=false, reminders=[], meet_requested=false, no attendees.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "b5c6d7e8f9a0"
down_revision: str | None = "a4b5c6d7e8f9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "calendar_events",
        sa.Column("all_day", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "calendar_events",
        sa.Column(
            "reminders",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
    )
    op.add_column(
        "calendar_events",
        sa.Column("meet_requested", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column("calendar_events", sa.Column("meet_url", sa.String(length=1024), nullable=True))
    op.create_table(
        "calendar_event_attendees",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.CheckConstraint(
            "(contact_id IS NULL) != (user_id IS NULL)",
            name="ck_calendar_event_attendees_one_subject",
        ),
        sa.ForeignKeyConstraint(["event_id"], ["calendar_events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contact_id"], ["contacts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", "contact_id", name="uq_event_attendee_contact"),
        sa.UniqueConstraint("event_id", "user_id", name="uq_event_attendee_user"),
    )
    op.create_index(
        "ix_calendar_event_attendees_event_id", "calendar_event_attendees", ["event_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_calendar_event_attendees_event_id", table_name="calendar_event_attendees")
    op.drop_table("calendar_event_attendees")
    op.drop_column("calendar_events", "meet_url")
    op.drop_column("calendar_events", "meet_requested")
    op.drop_column("calendar_events", "reminders")
    op.drop_column("calendar_events", "all_day")
