"""per-user email signature

Revision ID: f1b2c3d4e5a6
Revises: e4a7c9d21b83
Create Date: 2026-07-27 11:00:00.000000+00:00

The signature lives on `user_smtp_settings` rather than `users` because it
belongs to the sending identity (`from_name`/`from_email`), not to the
person's CRM profile. Nullable: an existing row has no signature and must
keep appending nothing.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f1b2c3d4e5a6"
down_revision: str | None = "e4a7c9d21b83"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("user_smtp_settings", sa.Column("signature", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("user_smtp_settings", "signature")
