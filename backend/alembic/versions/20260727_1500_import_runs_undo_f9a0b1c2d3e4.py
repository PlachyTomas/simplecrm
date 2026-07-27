"""import runs + provenance columns (undo)

Revision ID: f9a0b1c2d3e4
Revises: e7f8a9b0c1d2
Create Date: 2026-07-27 15:00:00.000000+00:00

`import_runs` is the anchor for import undo; `companies.import_run_id`,
`contacts.import_run_id` and `deals.import_run_id` are the provenance stamps.

Both FK directions are deliberate:
- import_runs.organization_id CASCADE — the history dies with the org.
- import_runs.user_id / undone_by_user_id SET NULL — history outlives the
  admin who ran it.
- <entity>.import_run_id SET NULL — dropping a history row must never
  cascade into business data.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "f9a0b1c2d3e4"
down_revision: str | None = "e7f8a9b0c1d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_STATUS = postgresql.ENUM(
    "committed",
    "undone",
    "partially_undone",
    name="import_run_status",
    create_type=False,
)

_STAMPED_TABLES = ("companies", "contacts", "deals")


def upgrade() -> None:
    _STATUS.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "import_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("provider", sa.String(50), nullable=False, server_default="generic"),
        sa.Column(
            "counts",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("status", _STATUS, nullable=False, server_default="committed"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("undone_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "undone_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_import_runs_organization_id_created_at",
        "import_runs",
        ["organization_id", "created_at"],
    )

    for table in _STAMPED_TABLES:
        op.add_column(
            table,
            sa.Column("import_run_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.create_foreign_key(
            f"fk_{table}_import_run_id",
            table,
            "import_runs",
            ["import_run_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index(f"ix_{table}_import_run_id", table, ["import_run_id"])


def downgrade() -> None:
    for table in _STAMPED_TABLES:
        op.drop_index(f"ix_{table}_import_run_id", table_name=table)
        op.drop_constraint(f"fk_{table}_import_run_id", table, type_="foreignkey")
        op.drop_column(table, "import_run_id")
    op.drop_index("ix_import_runs_organization_id_created_at", table_name="import_runs")
    op.drop_table("import_runs")
    _STATUS.drop(op.get_bind(), checkfirst=True)
