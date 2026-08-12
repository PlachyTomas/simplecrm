"""activity_type: add manual_action

Revision ID: e1f2a3b4c5d6
Revises: d5e6f7a8b9c0
Create Date: 2026-08-12 12:00:00.000000+00:00

One new `activity_type` value for user-authored timeline entries. Alone in
its own migration so the value is committed before anything can reference
it (same pattern as f7a8b9c0d1e2).
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: str | None = "d5e6f7a8b9c0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'manual_action'")


def downgrade() -> None:
    # Postgres can't drop a single enum value without recreating the type;
    # leaving an unused value in place is harmless (same as f7a8b9c0d1e2).
    pass
