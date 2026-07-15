"""user language

Revision ID: b936c7a9df14
Revises: b8d2e1f3a4c5
Create Date: 2026-07-12 19:41:19.748569+00:00

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b936c7a9df14"
down_revision: str | None = "b8d2e1f3a4c5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("language", sa.String(length=8), nullable=False, server_default="cs"),
    )


def downgrade() -> None:
    op.drop_column("users", "language")
