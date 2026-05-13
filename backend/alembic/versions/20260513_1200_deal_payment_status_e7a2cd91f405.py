"""deal payment status (is_paid, paid_at)

Revision ID: e7a2cd91f405
Revises: b3d9c1e4a572
Create Date: 2026-05-13 12:00:00.000000+00:00

Adds a payment flag to deals so the won column can show paid vs.
outstanding revenue. Per Tomáš's feedback, the won column will sink
paid deals to the bottom and tint their outline brand-accent. The two
columns are deliberately separate from `closed_at`/`stage_id`: a deal
can sit in the won stage for weeks before the invoice clears, and we
need the timestamp to drive the won-column sort.

Existing won deals migrate as is_paid=false. The salesperson ticks
them paid manually — backfilling from `closed_at` would silently mark
revenue as collected and we'd rather make the user assert it.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e7a2cd91f405"
down_revision: str | None = "b3d9c1e4a572"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "deals",
        sa.Column(
            "is_paid",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "deals",
        sa.Column(
            "paid_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    # Partial index on (is_paid, paid_at) for won-column pagination/order.
    # We only ever sort within the won stage, so the index doesn't need to
    # cover the full table; this keeps it small as the deal table grows.
    op.create_index(
        "ix_deals_is_paid_paid_at",
        "deals",
        ["is_paid", "paid_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_deals_is_paid_paid_at", table_name="deals")
    op.drop_column("deals", "paid_at")
    op.drop_column("deals", "is_paid")
