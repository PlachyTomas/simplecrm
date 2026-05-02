"""org ownership_window_days

Revision ID: e4b81f9c2d10
Revises: a917e4d6f221
Create Date: 2026-05-02 15:00:00.000000+00:00

Adds Organization.ownership_window_days so each org configures the
salesperson-to-manager auto-release window for companies. Default 365
matches the previous hardcoded value, so existing rows behave the same.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e4b81f9c2d10"
down_revision: str | None = "a917e4d6f221"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column(
            "ownership_window_days",
            sa.Integer(),
            server_default="365",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("organizations", "ownership_window_days")
