"""deals.note — the static deal description

Revision ID: a1b2c3d4e5f6
Revises: f9a0b1c2d3e4
Create Date: 2026-07-28 09:00:00.000000+00:00

Closes the inconsistency called out in the Pipedrive migration spec (phase
2b): `companies` and `contacts` each have a `note` column *and* an activity
timeline, `deals` only had the timeline. The column is the record attribute
("Region: Morava"); `ActivityType.note` rows stay the running commentary.

Nullable with no backfill — an absent description is the correct state for
every existing deal.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "f9a0b1c2d3e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("deals", sa.Column("note", sa.String(length=2000), nullable=True))


def downgrade() -> None:
    op.drop_column("deals", "note")
