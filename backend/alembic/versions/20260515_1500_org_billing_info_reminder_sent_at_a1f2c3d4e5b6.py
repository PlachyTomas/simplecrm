"""organizations.billing_info_reminder_sent_at

Revision ID: a1f2c3d4e5b6
Revises: ed34f716656f
Create Date: 2026-05-15 15:00:00.000000+00:00

Dedup column for `run_billing_info_reminder_sweep`. Stamped once when
the "your trial ends in ~7 days and your billing details are missing"
email goes out, so the daily sweep never re-emails the same admin. Set
back to NULL only if billing info was filled in and then re-emptied
(rare; we just let the operator clear it manually if needed).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1f2c3d4e5b6"
down_revision: str | None = "ed34f716656f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column(
            "billing_info_reminder_sent_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("organizations", "billing_info_reminder_sent_at")
