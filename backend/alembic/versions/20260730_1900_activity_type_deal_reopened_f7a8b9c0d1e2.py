"""activity_type: add deal_reopened

Revision ID: f7a8b9c0d1e2
Revises: c3d4e5f6a7b8
Create Date: 2026-07-30 19:00:00.000000+00:00

One new `activity_type` value for the dedicated reopen endpoint
(POST /deals/{id}/reopen). PG 12+ allows `ALTER TYPE ... ADD VALUE` inside a
transaction as long as the value isn't *used* in the same transaction — and
this migration touches nothing else (same pattern as a7c1f0b2d3e4).
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "f7a8b9c0d1e2"
down_revision: str | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'deal_reopened'")


def downgrade() -> None:
    # Postgres can't drop a single enum value without recreating the type;
    # leaving an unused value in place is harmless (same as a7c1f0b2d3e4).
    pass
