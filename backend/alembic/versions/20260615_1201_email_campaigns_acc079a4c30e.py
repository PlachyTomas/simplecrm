"""email campaigns

Revision ID: acc079a4c30e
Revises: ebd46b27f894
Create Date: 2026-06-15 12:01:30.334384+00:00

Adds the bulk-email tables + the `email_sent` activity type. Autogenerate
also surfaced unrelated drift (partial indexes / server defaults it can't
faithfully introspect); those were stripped. The `ALTER TYPE ... ADD VALUE`
is hand-added because autogenerate does not detect native-enum value
additions.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "acc079a4c30e"
down_revision: str | None = "ebd46b27f894"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # New value on the existing native enum. PG 12+ allows ADD VALUE inside a
    # transaction as long as the value isn't *used* in the same transaction
    # (it isn't here). IF NOT EXISTS keeps re-runs idempotent.
    op.execute("ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'email_sent'")

    op.create_table(
        "email_campaigns",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("created_by_user_id", sa.UUID(), nullable=True),
        sa.Column("subject", sa.String(length=300), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("from_email", sa.String(length=320), nullable=False),
        sa.Column("attachment_filename", sa.String(length=255), nullable=True),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column("sent_count", sa.Integer(), nullable=False),
        sa.Column("failed_count", sa.Integer(), nullable=False),
        sa.Column("skipped_count", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name=op.f("fk_email_campaigns_created_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_email_campaigns_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_email_campaigns")),
    )
    op.create_index(
        "ix_email_campaigns_org_created",
        "email_campaigns",
        ["organization_id", "created_at"],
        unique=False,
    )
    op.create_table(
        "email_campaign_recipients",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("campaign_id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=True),
        sa.Column("contact_id", sa.UUID(), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("company_name", sa.String(length=200), nullable=False),
        sa.Column(
            "status",
            sa.Enum("sent", "failed", "skipped", name="email_recipient_status"),
            nullable=False,
        ),
        sa.Column("error", sa.String(length=500), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["campaign_id"],
            ["email_campaigns.id"],
            name=op.f("fk_email_campaign_recipients_campaign_id_email_campaigns"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name=op.f("fk_email_campaign_recipients_company_id_companies"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["contact_id"],
            ["contacts.id"],
            name=op.f("fk_email_campaign_recipients_contact_id_contacts"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_email_campaign_recipients")),
    )
    op.create_index(
        "ix_email_campaign_recipients_campaign",
        "email_campaign_recipients",
        ["campaign_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_email_campaign_recipients_campaign", table_name="email_campaign_recipients")
    op.drop_table("email_campaign_recipients")
    op.drop_index("ix_email_campaigns_org_created", table_name="email_campaigns")
    op.drop_table("email_campaigns")
    op.execute("DROP TYPE IF EXISTS email_recipient_status")
    # The 'email_sent' value on activity_type is intentionally left in place:
    # Postgres cannot drop an enum value without recreating the type.
