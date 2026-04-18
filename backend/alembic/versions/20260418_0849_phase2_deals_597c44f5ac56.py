"""phase2 deals

Revision ID: 597c44f5ac56
Revises: 396feead22c3
Create Date: 2026-04-18 08:49:19.331942+00:00

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "597c44f5ac56"
down_revision: str | None = "396feead22c3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "deals",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("primary_contact_id", sa.UUID(), nullable=True),
        sa.Column("stage_id", sa.UUID(), nullable=False),
        sa.Column("owner_user_id", sa.UUID(), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("value", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("probability_override", sa.Integer(), nullable=True),
        sa.Column("expected_close_date", sa.Date(), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lost_reason", sa.String(length=200), nullable=True),
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
        sa.CheckConstraint(
            "probability_override IS NULL OR "
            "(probability_override >= 0 AND probability_override <= 100)",
            name="ck_deals_probability_override",
        ),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name=op.f("fk_deals_company_id_companies"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_deals_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["owner_user_id"],
            ["users.id"],
            name=op.f("fk_deals_owner_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["primary_contact_id"],
            ["contacts.id"],
            name=op.f("fk_deals_primary_contact_id_contacts"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["stage_id"],
            ["stages.id"],
            name=op.f("fk_deals_stage_id_stages"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_deals")),
    )
    op.create_index("ix_deals_company_id", "deals", ["company_id"], unique=False)
    op.create_index("ix_deals_expected_close_date", "deals", ["expected_close_date"], unique=False)
    op.create_index("ix_deals_organization_id", "deals", ["organization_id"], unique=False)
    op.create_index("ix_deals_owner_user_id", "deals", ["owner_user_id"], unique=False)
    op.create_index("ix_deals_stage_id", "deals", ["stage_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_deals_stage_id", table_name="deals")
    op.drop_index("ix_deals_owner_user_id", table_name="deals")
    op.drop_index("ix_deals_organization_id", table_name="deals")
    op.drop_index("ix_deals_expected_close_date", table_name="deals")
    op.drop_index("ix_deals_company_id", table_name="deals")
    op.drop_table("deals")
