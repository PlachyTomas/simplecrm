"""user reports_dashboard_config

Revision ID: d2c45f8e1a3b
Revises: a8c93f1d6b40
Create Date: 2026-05-02 19:00:00.000000+00:00

Adds `users.reports_dashboard_config` (JSONB, NOT NULL, default '{}')
for the configurable Reports widget dashboard. Empty `{}` means "use
the default layout"; populated dicts conform to `DashboardConfig`
(landing in R0.3) and are validated at the API edge.

No backfill needed — existing rows pick up the column-default.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d2c45f8e1a3b"
down_revision: str | None = "a8c93f1d6b40"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "reports_dashboard_config",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "reports_dashboard_config")
