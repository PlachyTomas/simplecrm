"""email password auth

Revision ID: f0b01efb64c6
Revises: c4f9e2a18b67
Create Date: 2026-05-09 09:00:00.000000+00:00

Adds password-based authentication alongside the existing Google OAuth flow:
  * users.password_hash    — nullable; null = OAuth-only user
  * users.email_verified   — not null, default false
  * users.email_verified_at
  * auth_action_tokens     — short-lived signed tokens for verify_email / reset_password

Existing users all signed in via Google, where Google attests email
ownership; backfilled to email_verified=true.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f0b01efb64c6"
down_revision: str | None = "c4f9e2a18b67"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("password_hash", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "email_verified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "users",
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Every existing user signed in via Google, which already verifies email
    # ownership at the IdP. Treat them as verified so they don't get locked out.
    op.execute(
        "UPDATE users "
        "SET email_verified = true, email_verified_at = now() "
        "WHERE google_id IS NOT NULL"
    )

    op.create_table(
        "auth_action_tokens",
        sa.Column("jti", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_auth_action_tokens_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("jti", name=op.f("pk_auth_action_tokens")),
    )
    op.create_index(
        "ix_auth_action_tokens_user_id",
        "auth_action_tokens",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_auth_action_tokens_user_id", table_name="auth_action_tokens")
    op.drop_table("auth_action_tokens")
    op.drop_column("users", "email_verified_at")
    op.drop_column("users", "email_verified")
    op.drop_column("users", "password_hash")
