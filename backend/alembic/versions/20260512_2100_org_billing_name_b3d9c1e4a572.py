"""org billing_name override

Revision ID: b3d9c1e4a572
Revises: 1a5b9f76b1ee
Create Date: 2026-05-12 21:00:00.000000+00:00

Adds `Organization.billing_name` so a customer whose day-to-day org name
("Acme team") differs from the legal name that must appear on the tax
invoice ("Acme s.r.o.") can override it without renaming the workspace.
Nullable; null means "use organization.name on invoices."
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b3d9c1e4a572"
down_revision: str | None = "1a5b9f76b1ee"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("billing_name", sa.String(length=200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("organizations", "billing_name")
