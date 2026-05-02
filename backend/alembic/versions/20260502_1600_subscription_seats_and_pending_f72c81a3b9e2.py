"""subscription seats + pending plan/seat fields

Revision ID: f72c81a3b9e2
Revises: e4b81f9c2d10
Create Date: 2026-05-02 16:00:00.000000+00:00

Adds:
- subscriptions.seat_count (int, default 1, NOT NULL) — drives the bill
  total and acts as the hard cap on active users.
- subscriptions.pending_plan_id (uuid → plans.id, nullable) — queued
  monthly↔annual switch applied at period rollover.
- subscriptions.pending_seat_count (int, nullable) — queued seat
  reduction applied at period rollover.

Existing rows backfill `seat_count = 1` (the founding admin); operators
can adjust per-org afterwards from the new Settings → Organizace tab.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f72c81a3b9e2"
down_revision: str | None = "e4b81f9c2d10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "subscriptions",
        sa.Column("seat_count", sa.Integer(), server_default="1", nullable=False),
    )
    op.add_column(
        "subscriptions",
        sa.Column(
            "pending_plan_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_subscriptions_pending_plan",
        "subscriptions",
        "plans",
        ["pending_plan_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.add_column(
        "subscriptions",
        sa.Column("pending_seat_count", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("subscriptions", "pending_seat_count")
    op.drop_constraint(
        "fk_subscriptions_pending_plan", "subscriptions", type_="foreignkey"
    )
    op.drop_column("subscriptions", "pending_plan_id")
    op.drop_column("subscriptions", "seat_count")
