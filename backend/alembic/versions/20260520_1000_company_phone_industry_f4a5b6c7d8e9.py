"""companies.phone + companies.industry

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-05-20 10:00:00.000000+00:00

Optional company-level phone and industry ("Obor", e.g. "cars",
"gastro") so a firma row carries its own contact number distinct from
its main contact, and the admin can segment companies by sector. Both
columns are free text — we don't constrain `industry` to an enum yet
because the vocabulary differs per organization.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f4a5b6c7d8e9"
down_revision: str | None = "e3f4a5b6c7d8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "companies",
        sa.Column("phone", sa.String(length=40), nullable=True),
    )
    op.add_column(
        "companies",
        sa.Column("industry", sa.String(length=120), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("companies", "industry")
    op.drop_column("companies", "phone")
