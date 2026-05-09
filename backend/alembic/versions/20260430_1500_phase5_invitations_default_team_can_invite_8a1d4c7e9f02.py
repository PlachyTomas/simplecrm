"""phase5 invitations + default team + can_invite

Revision ID: 8a1d4c7e9f02
Revises: 3c63455f1e8b
Create Date: 2026-04-30 15:00:00.000000+00:00

Adds:
- `users.can_invite` column (defaults to false; admins always implicitly can).
- `users.organization_id` made nullable so a Google-authenticated user with
  no pending invite can land in a "needs org setup" state.
- `teams.is_default` + a partial unique index ensuring at most one default
  team per org.
- `invitations` table for the admin-driven invite flow.

Backfills:
- Each existing org gets a default team named "Hlavní tým" (created if no
  team exists, or the lexicographically-first existing team is promoted to
  default if any teams exist). Users with `team_id IS NULL` are assigned
  to the default team.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "8a1d4c7e9f02"
down_revision: str | None = "3c63455f1e8b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. users.can_invite
    op.add_column(
        "users",
        sa.Column(
            "can_invite",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )

    # 2. users.organization_id -> nullable
    op.alter_column(
        "users",
        "organization_id",
        existing_type=sa.UUID(),
        nullable=True,
    )

    # 3. teams.is_default + partial unique index
    op.add_column(
        "teams",
        sa.Column(
            "is_default",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    op.create_index(
        "uq_teams_one_default_per_org",
        "teams",
        ["organization_id"],
        unique=True,
        postgresql_where=sa.text("is_default = true"),
    )

    # 4. invitations table
    op.create_table(
        "invitations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column(
            "role",
            postgresql.ENUM(
                "salesperson",
                "manager",
                "admin",
                name="user_role",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("team_id", sa.UUID(), nullable=True),
        sa.Column(
            "can_invite",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column("invited_by_user_id", sa.UUID(), nullable=True),
        sa.Column("token_jti", sa.UUID(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_invitations_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["team_id"],
            ["teams.id"],
            name=op.f("fk_invitations_team_id_teams"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["invited_by_user_id"],
            ["users.id"],
            name=op.f("fk_invitations_invited_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_invitations")),
        sa.UniqueConstraint("token_jti", name=op.f("uq_invitations_token_jti")),
    )
    op.create_index("ix_invitations_organization_id", "invitations", ["organization_id"])
    op.create_index(
        "ix_invitations_email_lower",
        "invitations",
        [sa.text("lower(email)")],
    )
    op.create_index(
        "uq_invitations_open_org_email",
        "invitations",
        ["organization_id", sa.text("lower(email)")],
        unique=True,
        postgresql_where=sa.text("accepted_at IS NULL AND revoked_at IS NULL"),
    )

    # 5. Backfill: ensure each existing org has a default team and team-less
    # users are assigned to it. Promote an existing team if the org has any;
    # otherwise create "Hlavní tým".
    op.execute(
        sa.text(
            """
            WITH first_team_per_org AS (
                SELECT DISTINCT ON (organization_id)
                    id, organization_id
                FROM teams
                ORDER BY organization_id, name, created_at, id
            )
            UPDATE teams t
            SET is_default = true
            FROM first_team_per_org f
            WHERE t.id = f.id
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO teams (id, name, organization_id, is_default, created_at)
            SELECT gen_random_uuid(), 'Hlavní tým', o.id, true, now()
            FROM organizations o
            WHERE NOT EXISTS (
                SELECT 1 FROM teams t
                WHERE t.organization_id = o.id AND t.is_default = true
            )
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE users u
            SET team_id = t.id
            FROM teams t
            WHERE u.team_id IS NULL
              AND u.organization_id IS NOT NULL
              AND t.organization_id = u.organization_id
              AND t.is_default = true
            """
        )
    )


def downgrade() -> None:
    # 4. invitations
    op.drop_index("uq_invitations_open_org_email", table_name="invitations")
    op.drop_index("ix_invitations_email_lower", table_name="invitations")
    op.drop_index("ix_invitations_organization_id", table_name="invitations")
    op.drop_table("invitations")

    # 3. teams.is_default
    op.drop_index("uq_teams_one_default_per_org", table_name="teams")
    op.drop_column("teams", "is_default")

    # 2. users.organization_id -> NOT NULL again. Fail loudly if any rows
    # currently have NULL — those are users mid-onboarding and the operator
    # should resolve that before downgrading.
    op.alter_column(
        "users",
        "organization_id",
        existing_type=sa.UUID(),
        nullable=False,
    )

    # 1. users.can_invite
    op.drop_column("users", "can_invite")
