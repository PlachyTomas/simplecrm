"""user max_owned_companies cap

Revision ID: a814b0ce67f3
Revises: e7a2cd91f405
Create Date: 2026-05-13 13:00:00.000000+00:00

Admin-set ceiling on the number of companies a single salesperson can
hold at once. NULL = unlimited (the existing behavior). When the
column is set and the user already owns N >= cap companies, every
new ownership-assignment path (create, ownership change on update,
reassign) returns 409 with `error: cap_reached`.

The check is per-user; we don't have an org-wide default yet — the
feedback only asks for a per-row admin control.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a814b0ce67f3"
down_revision: str | None = "e7a2cd91f405"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("max_owned_companies", sa.Integer(), nullable=True),
    )
    op.create_check_constraint(
        "ck_users_max_owned_companies_nonneg",
        "users",
        "max_owned_companies IS NULL OR max_owned_companies >= 0",
    )


def downgrade() -> None:
    op.drop_constraint("ck_users_max_owned_companies_nonneg", "users", type_="check")
    op.drop_column("users", "max_owned_companies")
