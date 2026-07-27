"""org-shared email templates

Revision ID: a2b3c4d5e6f7
Revises: f1b2c3d4e5a6
Create Date: 2026-07-27 11:10:00.000000+00:00

Org-shared subject/body pairs for the composer and campaigns. Unique on
(organization_id, name) so a picker never shows two identical labels;
`created_by_user_id` is SET NULL so removing the author keeps the org's
template.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a2b3c4d5e6f7"
down_revision: str | None = "f1b2c3d4e5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "email_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("subject", sa.String(length=300), nullable=False),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("organization_id", "name", name="uq_email_templates_org_name"),
    )
    op.create_index("ix_email_templates_organization_id", "email_templates", ["organization_id"])


def downgrade() -> None:
    op.drop_index("ix_email_templates_organization_id", table_name="email_templates")
    op.drop_table("email_templates")
