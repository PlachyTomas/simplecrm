"""phase2 activities

Revision ID: 94077b6331b7
Revises: 597c44f5ac56
Create Date: 2026-04-18 08:52:59.841463+00:00

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "94077b6331b7"
down_revision: str | None = "597c44f5ac56"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "activities",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column(
            "entity_type",
            sa.Enum("company", "contact", "deal", name="activity_entity_type"),
            nullable=False,
        ),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column(
            "activity_type",
            sa.Enum(
                "note",
                "stage_change",
                "owner_change",
                "deal_won",
                "deal_lost",
                "company_freed",
                "ownership_reassigned",
                name="activity_type",
            ),
            nullable=False,
        ),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_activities_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_activities_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_activities")),
    )
    op.create_index("ix_activities_created_at", "activities", ["created_at"], unique=False)
    op.create_index(
        "ix_activities_entity", "activities", ["entity_type", "entity_id"], unique=False
    )
    op.create_index(
        "ix_activities_organization_id",
        "activities",
        ["organization_id"],
        unique=False,
    )
    op.create_index("ix_activities_user_id", "activities", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_activities_user_id", table_name="activities")
    op.drop_index("ix_activities_organization_id", table_name="activities")
    op.drop_index("ix_activities_entity", table_name="activities")
    op.drop_index("ix_activities_created_at", table_name="activities")
    op.drop_table("activities")

    sa.Enum(name="activity_type").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="activity_entity_type").drop(op.get_bind(), checkfirst=True)
