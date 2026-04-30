"""phase4 org show_leaderboard_to_salespeople

Revision ID: 3c63455f1e8b
Revises: d4eeb0570c57
Create Date: 2026-04-30 12:00:00.000000+00:00

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "3c63455f1e8b"
down_revision: str | None = "d4eeb0570c57"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column(
            "show_leaderboard_to_salespeople",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("organizations", "show_leaderboard_to_salespeople")
