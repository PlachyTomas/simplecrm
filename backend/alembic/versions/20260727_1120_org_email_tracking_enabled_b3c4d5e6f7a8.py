"""org-level email tracking opt-out

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-07-27 11:20:00.000000+00:00

Default TRUE so existing orgs keep the behavior F1 shipped with. An admin
who reads ePrivacy/GDPR as requiring consent for the open pixel flips it
off, and both send paths stop minting tracking tokens entirely.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b3c4d5e6f7a8"
down_revision: str | None = "a2b3c4d5e6f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column(
            "email_tracking_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("organizations", "email_tracking_enabled")
