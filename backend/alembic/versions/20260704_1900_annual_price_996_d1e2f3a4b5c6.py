"""annual plan price 999 -> 996 Kč (83 Kč/mo)

Revision ID: d1e2f3a4b5c6
Revises: acc079a4c30e
Create Date: 2026-07-04 19:00:00.000000+00:00

Drops the annual plan's per-user price from 999 Kč/yr to 996 Kč/yr so it lands
on a clean 83 Kč/mo effective rate for the annual-first landing presentation.
Safe as a straight UPDATE — there are no paying annual subscribers yet.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "d1e2f3a4b5c6"
down_revision: str | None = "acc079a4c30e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("UPDATE plans SET price_per_user_minor = 99600 WHERE code = 'annual'")


def downgrade() -> None:
    op.execute("UPDATE plans SET price_per_user_minor = 99900 WHERE code = 'annual'")
