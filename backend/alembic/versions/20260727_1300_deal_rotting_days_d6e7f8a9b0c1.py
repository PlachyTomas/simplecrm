"""org-configurable deal rotting threshold

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-07-27 13:00:00.000000+00:00

Days without a stage change before the pipeline board flags a card as
rotting. Default 14 matches the cheapest tier of the tools this competes
with; 0 switches the indicator off for the org.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d6e7f8a9b0c1"
down_revision: str | None = "c5d6e7f8a9b0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column(
            "deal_rotting_days",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("14"),
        ),
    )


def downgrade() -> None:
    op.drop_column("organizations", "deal_rotting_days")
