"""organizations.deleted_at

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-05-18 22:30:00.000000+00:00

Soft-delete flag for organizations. Set by the GDPR Art. 17 erasure
endpoint. The org row is kept (and anonymized in place) so that
invoices linked to it survive the 10-year accounting retention
window required by § 31 zák. č. 563/1991 Sb.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e3f4a5b6c7d8"
down_revision: str | None = "d2e3f4a5b6c7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("organizations", "deleted_at")
