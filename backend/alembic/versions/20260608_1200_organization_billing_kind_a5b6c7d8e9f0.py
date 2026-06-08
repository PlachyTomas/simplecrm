"""organizations.billing_kind

Revision ID: a5b6c7d8e9f0
Revises: f4a5b6c7d8e9
Create Date: 2026-06-08 12:00:00.000000+00:00

Stores whether the customer bills as a company (firma — has IČO) or a
private individual (soukromá osoba — no IČO). Collected in the
pre-payment billing form. Nullable: legacy rows stay null and the UI
infers the toggle from IČO presence.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a5b6c7d8e9f0"
down_revision: str | None = "f4a5b6c7d8e9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("billing_kind", sa.String(length=16), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("organizations", "billing_kind")
