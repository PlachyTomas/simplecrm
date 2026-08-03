"""billing settings seller dic

Revision ID: 43bae7c54192
Revises: f7a8b9c0d1e2
Create Date: 2026-08-03 08:26:28.987220+00:00

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '43bae7c54192'
down_revision: str | None = 'f7a8b9c0d1e2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("billing_settings", sa.Column("seller_dic", sa.String(length=14), nullable=True))


def downgrade() -> None:
    op.drop_column("billing_settings", "seller_dic")
