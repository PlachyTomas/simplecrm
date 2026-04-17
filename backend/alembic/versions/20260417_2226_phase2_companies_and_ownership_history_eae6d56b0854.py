"""phase2 companies and ownership history

Revision ID: eae6d56b0854
Revises: c98b20a997d0
Create Date: 2026-04-17 22:26:49.151305+00:00

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "eae6d56b0854"
down_revision: str | None = "c98b20a997d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "companies",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("ico", sa.String(length=8), nullable=True),
        sa.Column("dic", sa.String(length=16), nullable=True),
        sa.Column("address_street", sa.String(length=200), nullable=True),
        sa.Column("address_city", sa.String(length=120), nullable=True),
        sa.Column("address_zip", sa.String(length=12), nullable=True),
        sa.Column("legal_form", sa.String(length=120), nullable=True),
        sa.Column("registered_on", sa.DateTime(timezone=True), nullable=True),
        sa.Column("website", sa.String(length=300), nullable=True),
        sa.Column("note", sa.String(length=2000), nullable=True),
        sa.Column("owner_user_id", sa.UUID(), nullable=True),
        sa.Column("last_order_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ownership_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ares_synced_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_companies_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["owner_user_id"],
            ["users.id"],
            name=op.f("fk_companies_owner_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_companies")),
        sa.UniqueConstraint("organization_id", "ico", name="uq_companies_org_ico"),
    )
    op.create_index("ix_companies_ico", "companies", ["ico"], unique=False)
    op.create_index("ix_companies_organization_id", "companies", ["organization_id"], unique=False)
    op.create_index("ix_companies_owner_user_id", "companies", ["owner_user_id"], unique=False)
    op.create_index(
        "ix_companies_ownership_expires_at",
        "companies",
        ["ownership_expires_at"],
        unique=False,
    )

    op.create_table(
        "ownership_history",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column(
            "assigned_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "reason",
            sa.Enum(
                "initial",
                "reassigned",
                "freed_timeout",
                "won_deal_refresh",
                name="ownership_change_reason",
            ),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name=op.f("fk_ownership_history_company_id_companies"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_ownership_history_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ownership_history")),
    )
    op.create_index(
        "ix_ownership_history_company_id",
        "ownership_history",
        ["company_id"],
        unique=False,
    )
    op.create_index("ix_ownership_history_user_id", "ownership_history", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_ownership_history_user_id", table_name="ownership_history")
    op.drop_index("ix_ownership_history_company_id", table_name="ownership_history")
    op.drop_table("ownership_history")
    op.drop_index("ix_companies_ownership_expires_at", table_name="companies")
    op.drop_index("ix_companies_owner_user_id", table_name="companies")
    op.drop_index("ix_companies_organization_id", table_name="companies")
    op.drop_index("ix_companies_ico", table_name="companies")
    op.drop_table("companies")

    sa.Enum(name="ownership_change_reason").drop(op.get_bind(), checkfirst=True)
