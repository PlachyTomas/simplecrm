"""users.preferences

Revision ID: c1d2e3f4a5b6
Revises: b7c1d2e3f4a5
Create Date: 2026-05-17 23:00:00.000000+00:00

Free-form per-user preference blob. Today it carries the first-login
tutorial state (`tutorial_completed_at`, `tutorial_dismissed_at`,
`tutorial_step_index`); kept separate from `reports_dashboard_config`
because that one has a structured Pydantic schema and a dedicated
endpoint. Server-default `'{}'` so the column is non-nullable but
existing rows backfill without a one-off UPDATE.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c1d2e3f4a5b6"
down_revision: str | None = "b7c1d2e3f4a5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "preferences",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "preferences")
