"""phase2 pipelines and stages

Revision ID: 396feead22c3
Revises: 3a06ad7bed4c
Create Date: 2026-04-18 08:46:16.031932+00:00

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "396feead22c3"
down_revision: str | None = "3a06ad7bed4c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pipelines",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_pipelines_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pipelines")),
    )
    op.create_index(
        "ix_pipelines_organization_id",
        "pipelines",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        "uq_pipelines_one_default_per_org",
        "pipelines",
        ["organization_id"],
        unique=True,
        postgresql_where=sa.text("is_default = true"),
    )

    op.create_table(
        "stages",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("pipeline_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("default_probability", sa.Integer(), nullable=False),
        sa.Column("color", sa.String(length=9), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column(
            "stage_type",
            sa.Enum("open", "won", "lost", name="stage_type"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "default_probability >= 0 AND default_probability <= 100",
            name="ck_stages_default_probability",
        ),
        sa.ForeignKeyConstraint(
            ["pipeline_id"],
            ["pipelines.id"],
            name=op.f("fk_stages_pipeline_id_pipelines"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_stages")),
        sa.UniqueConstraint("pipeline_id", "position", name="uq_stages_pipeline_position"),
    )


def downgrade() -> None:
    op.drop_table("stages")
    op.drop_index(
        "uq_pipelines_one_default_per_org",
        table_name="pipelines",
        postgresql_where=sa.text("is_default = true"),
    )
    op.drop_index("ix_pipelines_organization_id", table_name="pipelines")
    op.drop_table("pipelines")

    sa.Enum(name="stage_type").drop(op.get_bind(), checkfirst=True)
