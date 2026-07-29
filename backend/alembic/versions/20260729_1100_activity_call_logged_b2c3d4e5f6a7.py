"""activity: add the call_logged type

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-29 11:00:00.000000+00:00

Backs "Zaznamenat hovor" in the deal quick actions: a logged call is an
activity row like a note, so it lands on the deal and company timelines
with no second read model.

PG 12+ allows `ALTER TYPE ... ADD VALUE` inside a transaction as long as
the new value isn't *used* in the same transaction — this migration only
adds it, so no `autocommit_block` is needed.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'call_logged'")


def downgrade() -> None:
    # Postgres cannot drop a value from an enum type. Removing it would mean
    # rebuilding the type and rewriting every dependent column, which would
    # destroy any call_logged rows already written — so the value stays.
    pass
