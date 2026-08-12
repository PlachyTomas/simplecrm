"""activities: user-settable occurred_at + shared event label

Revision ID: a4b5c6d7e8f9
Revises: e1f2a3b4c5d6
Create Date: 2026-08-12 12:05:00.000000+00:00

`created_at` stays the immutable write stamp; `occurred_at` is when the user
says the thing happened, and is what the timelines order by. Existing rows
are backfilled to their write stamp, so nothing reorders until someone
backdates an entry.

The column keeps a `now()` server default on purpose: code paths that predate
this migration (and any parallel branch checked out against the same dev DB)
insert activities without naming the column, and a bare NOT NULL would break
them.

`label_id` reuses the org-shared calendar vocabulary (`event_labels`) so the
kind list is the same one users already curate from the event form.

(The plan proposed revision id `a1b2c3d4e5f6`; that identifier is already
taken by the 20260728_0900 deal-note migration, so this one is `a4b5c6d7e8f9`.)
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a4b5c6d7e8f9"
down_revision: str | None = "e1f2a3b4c5d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "activities",
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            nullable=True,
            server_default=sa.text("now()"),
        ),
    )
    op.execute("UPDATE activities SET occurred_at = created_at")
    op.alter_column("activities", "occurred_at", nullable=False)
    op.add_column(
        "activities",
        sa.Column("label_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_activities_label_id",
        "activities",
        "event_labels",
        ["label_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_activities_entity_occurred",
        "activities",
        ["entity_type", "entity_id", sa.text("occurred_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_activities_entity_occurred", table_name="activities")
    op.drop_constraint("fk_activities_label_id", "activities", type_="foreignkey")
    op.drop_column("activities", "label_id")
    op.drop_column("activities", "occurred_at")
