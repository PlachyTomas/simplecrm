"""phase1 foundation: org user team plan

Revision ID: c98b20a997d0
Revises: 6c57c6890dde
Create Date: 2026-04-17 21:58:29.621652+00:00

"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

import sqlalchemy as sa

from alembic import op

revision: str = "c98b20a997d0"
down_revision: str | None = "6c57c6890dde"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("ico", sa.String(length=8), nullable=True),
        sa.Column("dic", sa.String(length=16), nullable=True),
        sa.Column("address_street", sa.String(length=200), nullable=True),
        sa.Column("address_city", sa.String(length=120), nullable=True),
        sa.Column("address_zip", sa.String(length=12), nullable=True),
        sa.Column("legal_form", sa.String(length=120), nullable=True),
        sa.Column("registered_on", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "region",
            sa.Enum("eu-cz", name="organization_region"),
            nullable=False,
        ),
        sa.Column("locale", sa.String(length=16), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("billing_email", sa.String(length=320), nullable=True),
        sa.Column("stripe_customer_id", sa.String(length=64), nullable=True),
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_organizations")),
    )
    op.create_index(
        "ix_organizations_trial_ends_at",
        "organizations",
        ["trial_ends_at"],
        unique=False,
    )

    plans_table = op.create_table(
        "plans",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("price_minor_units", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column(
            "interval",
            sa.Enum("monthly", "annual", name="plan_interval"),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_plans")),
        sa.UniqueConstraint("name", name=op.f("uq_plans_name")),
    )

    # Create `teams` without the manager_user_id FK; it's added after `users`
    # exists to avoid circular-FK issues at create time.
    op.create_table(
        "teams",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("manager_user_id", sa.UUID(), nullable=True),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_teams_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_teams")),
    )
    op.create_index("ix_teams_organization_id", "teams", ["organization_id"], unique=False)

    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("avatar_url", sa.String(length=500), nullable=True),
        sa.Column("google_id", sa.String(length=64), nullable=True),
        sa.Column(
            "role",
            sa.Enum("salesperson", "manager", "admin", name="user_role"),
            nullable=False,
        ),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("team_id", sa.UUID(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_users_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["team_id"],
            ["teams.id"],
            name=op.f("fk_users_team_id_teams"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
        sa.UniqueConstraint("google_id", name=op.f("uq_users_google_id")),
    )
    op.create_index("ix_users_organization_id", "users", ["organization_id"], unique=False)
    op.create_index("ix_users_team_id", "users", ["team_id"], unique=False)

    # Add the circular FK now that both tables exist.
    op.create_foreign_key(
        op.f("fk_teams_manager_user_id_users"),
        "teams",
        "users",
        ["manager_user_id"],
        ["id"],
        ondelete="SET NULL",
        use_alter=True,
    )

    now = datetime.now(tz=UTC).replace(microsecond=0) - timedelta(seconds=1)
    op.bulk_insert(
        plans_table,
        [
            {
                "id": uuid.UUID("11111111-1111-1111-1111-111111111111"),
                "name": "trial",
                "price_minor_units": 0,
                "currency": "CZK",
                "interval": "monthly",
                "is_active": True,
                "created_at": now,
            },
            {
                "id": uuid.UUID("22222222-2222-2222-2222-222222222222"),
                "name": "team",
                "price_minor_units": 9900,
                "currency": "CZK",
                "interval": "monthly",
                "is_active": True,
                "created_at": now,
            },
        ],
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_teams_manager_user_id_users"), "teams", type_="foreignkey")
    op.drop_index("ix_users_team_id", table_name="users")
    op.drop_index("ix_users_organization_id", table_name="users")
    op.drop_table("users")
    op.drop_index("ix_teams_organization_id", table_name="teams")
    op.drop_table("teams")
    op.drop_table("plans")
    op.drop_index("ix_organizations_trial_ends_at", table_name="organizations")
    op.drop_table("organizations")

    # Explicitly drop enum types — Postgres leaves them around after
    # `drop_table` when they were created via the column definition.
    sa.Enum(name="organization_region").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="plan_interval").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="user_role").drop(op.get_bind(), checkfirst=True)
