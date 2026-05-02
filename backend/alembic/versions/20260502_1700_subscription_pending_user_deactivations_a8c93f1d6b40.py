"""subscription pending_user_deactivations

Revision ID: a8c93f1d6b40
Revises: f72c81a3b9e2
Create Date: 2026-05-02 17:00:00.000000+00:00

Adds `subscriptions.pending_user_deactivations` (JSONB, nullable) so a
seat-count downsize can queue which users lose access at next period
rollover instead of flipping `User.is_active` immediately.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a8c93f1d6b40"
down_revision: str | None = "f72c81a3b9e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "subscriptions",
        sa.Column(
            "pending_user_deactivations",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("subscriptions", "pending_user_deactivations")
