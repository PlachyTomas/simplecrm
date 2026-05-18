"""super_admin_audit_log

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-05-18 22:00:00.000000+00:00

Per-action audit trail for super-admin operations against customer
organizations. Customer admins read their org's rows via
`GET /organizations/me/admin-access-log`, satisfying the
transparency obligation we now disclose in the DPA.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d2e3f4a5b6c7"
down_revision: str | None = "c1d2e3f4a5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ACTION_VALUES = (
    "list_users",
    "view_subscription",
    "view_invoices",
    "view_activity",
    "impersonate",
)


def upgrade() -> None:
    action_enum = postgresql.ENUM(*ACTION_VALUES, name="super_admin_action")
    action_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "super_admin_audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("super_admin_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("super_admin_email", sa.String(length=320), nullable=False),
        sa.Column("target_organization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("target_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("target_user_email", sa.String(length=320), nullable=True),
        sa.Column(
            "action",
            postgresql.ENUM(*ACTION_VALUES, name="super_admin_action", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["super_admin_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["target_organization_id"], ["organizations.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["target_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_super_admin_audit_log_org_created",
        "super_admin_audit_log",
        ["target_organization_id", "created_at"],
    )
    op.create_index(
        "ix_super_admin_audit_log_actor",
        "super_admin_audit_log",
        ["super_admin_user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_super_admin_audit_log_actor", table_name="super_admin_audit_log")
    op.drop_index("ix_super_admin_audit_log_org_created", table_name="super_admin_audit_log")
    op.drop_table("super_admin_audit_log")
    postgresql.ENUM(name="super_admin_action").drop(op.get_bind(), checkfirst=True)
