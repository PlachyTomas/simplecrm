"""companies.email

Revision ID: b7c1d2e3f4a5
Revises: a1f2c3d4e5b6
Create Date: 2026-05-17 21:00:00.000000+00:00

Optional contact email on Company. Distinct from any Contact-level email —
this is the firm's general inbox (info@, fakturace@) used for outbound
invoice/notification delivery when no specific contact is preferred.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b7c1d2e3f4a5"
down_revision: str | None = "a1f2c3d4e5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "companies",
        sa.Column("email", sa.String(length=320), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("companies", "email")
