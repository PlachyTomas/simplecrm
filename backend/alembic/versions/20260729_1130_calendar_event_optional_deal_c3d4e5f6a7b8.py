"""calendar_events: allow an event with no deal

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-29 11:30:00.000000+00:00

`deal_id` was NOT NULL, which forced every meeting to be about a deal
before it existed. Users need to block out a call first and attach the
deal later, so the column becomes nullable. The FK and its ON DELETE
CASCADE stay as they are — an event that *is* linked still dies with its
deal.

Widening a NOT NULL to nullable needs no backfill and no data rewrite;
the downgrade is the one that can fail, so it clears orphans first.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: str | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "calendar_events",
        "deal_id",
        existing_type=sa.UUID(),
        nullable=True,
    )


def downgrade() -> None:
    # Deal-less events cannot survive the NOT NULL. Drop them rather than
    # failing the migration halfway — they are exactly the rows this
    # revision made possible.
    op.execute("DELETE FROM calendar_events WHERE deal_id IS NULL")
    op.alter_column(
        "calendar_events",
        "deal_id",
        existing_type=sa.UUID(),
        nullable=False,
    )
