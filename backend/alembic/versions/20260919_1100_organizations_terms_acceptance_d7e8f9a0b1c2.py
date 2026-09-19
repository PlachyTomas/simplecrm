"""organizations: terms acceptance record from the org-creation declaration

Revision ID: d7e8f9a0b1c2
Revises: c6d7e8f9a0b1
Create Date: 2026-09-19 11:00:00.000000+00:00

Three nullable columns + FK — nothing runs outside a transaction. No
backfill: organizations created before the checkbox keep NULL, which the
Privacy settings page renders as "no record".
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d7e8f9a0b1c2"
down_revision: str | None = "c6d7e8f9a0b1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("organizations", sa.Column("terms_version", sa.String(length=16), nullable=True))
    op.add_column(
        "organizations",
        sa.Column("terms_accepted_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_organizations_terms_accepted_by_user_id_users",
        "organizations",
        "users",
        ["terms_accepted_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_organizations_terms_accepted_by_user_id_users", "organizations", type_="foreignkey"
    )
    op.drop_column("organizations", "terms_accepted_by_user_id")
    op.drop_column("organizations", "terms_version")
    op.drop_column("organizations", "terms_accepted_at")
