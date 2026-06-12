"""calendar events google connections

Revision ID: 825199d7e150
Revises: a5b6c7d8e9f0
Create Date: 2026-06-12 09:00:34.300024+00:00

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "825199d7e150"
down_revision: str | None = "a5b6c7d8e9f0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "google_calendar_connections",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("google_email", sa.String(length=320), nullable=False),
        sa.Column("refresh_token_encrypted", sa.Text(), nullable=False),
        sa.Column("access_token_encrypted", sa.Text(), nullable=True),
        sa.Column("access_token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sync_broken", sa.Boolean(), server_default="false", nullable=False),
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
            name=op.f("fk_google_calendar_connections_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_google_calendar_connections_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_google_calendar_connections")),
        sa.UniqueConstraint("user_id", name=op.f("uq_google_calendar_connections_user_id")),
    )
    op.create_index(
        "ix_google_calendar_connections_organization_id",
        "google_calendar_connections",
        ["organization_id"],
        unique=False,
    )
    op.create_table(
        "calendar_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("deal_id", sa.UUID(), nullable=False),
        sa.Column("owner_user_id", sa.UUID(), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location", sa.String(length=200), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("google_event_id", sa.String(length=1024), nullable=True),
        sa.Column(
            "google_sync_status",
            sa.Enum("not_synced", "synced", "error", name="google_sync_status"),
            server_default="not_synced",
            nullable=False,
        ),
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
            "ends_at > starts_at",
            name=op.f("ck_calendar_events_ck_calendar_events_ends_after_starts"),
        ),
        sa.ForeignKeyConstraint(
            ["deal_id"],
            ["deals.id"],
            name=op.f("fk_calendar_events_deal_id_deals"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_calendar_events_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["owner_user_id"],
            ["users.id"],
            name=op.f("fk_calendar_events_owner_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_calendar_events")),
    )
    op.create_index("ix_calendar_events_deal_id", "calendar_events", ["deal_id"], unique=False)
    op.create_index(
        "ix_calendar_events_organization_id", "calendar_events", ["organization_id"], unique=False
    )
    op.create_index(
        "ix_calendar_events_owner_user_id", "calendar_events", ["owner_user_id"], unique=False
    )
    op.create_index("ix_calendar_events_starts_at", "calendar_events", ["starts_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_calendar_events_starts_at", table_name="calendar_events")
    op.drop_index("ix_calendar_events_owner_user_id", table_name="calendar_events")
    op.drop_index("ix_calendar_events_organization_id", table_name="calendar_events")
    op.drop_index("ix_calendar_events_deal_id", table_name="calendar_events")
    op.drop_table("calendar_events")
    op.drop_index(
        "ix_google_calendar_connections_organization_id", table_name="google_calendar_connections"
    )
    op.drop_table("google_calendar_connections")
    sa.Enum(name="google_sync_status").drop(op.get_bind(), checkfirst=True)
