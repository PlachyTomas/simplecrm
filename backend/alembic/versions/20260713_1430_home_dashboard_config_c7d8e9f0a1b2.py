"""home dashboard config

Revision ID: c7d8e9f0a1b2
Revises: 12d3a3862222
Create Date: 2026-07-13 14:30:00.000000+00:00

Adds `users.home_dashboard_config` JSONB — the per-user editable home
dashboard layout, sibling to `reports_dashboard_config`. Empty `{}`
(server default) means "use the role-aware default layout from
`services/home_dashboard.py`"; populated dicts conform to the
`HomeDashboardConfig` Pydantic schema, validated at the API edge.
Plain column add, no enum changes.

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c7d8e9f0a1b2"
down_revision: str | None = "12d3a3862222"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "home_dashboard_config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "home_dashboard_config")
