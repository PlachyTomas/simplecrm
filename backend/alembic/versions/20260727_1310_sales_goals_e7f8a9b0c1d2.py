"""monthly sales goals

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-07-27 13:10:00.000000+00:00

One target per (org, user-or-org-wide, month, metric). `user_id` NULL means
an org-wide goal; because Postgres treats NULLs as distinct in a UNIQUE
constraint, the org-wide case needs its own partial unique index on top of
the four-column constraint.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "e7f8a9b0c1d2"
down_revision: str | None = "d6e7f8a9b0c1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_METRIC = postgresql.ENUM(
    "won_value",
    "won_count",
    name="sales_goal_metric",
    create_type=False,
)


def upgrade() -> None:
    _METRIC.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "sales_goals",
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
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("period_month", sa.Date(), nullable=False),
        sa.Column("metric", _METRIC, nullable=False),
        sa.Column("target_value", sa.Numeric(14, 2), nullable=False),
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
        sa.UniqueConstraint(
            "organization_id",
            "user_id",
            "period_month",
            "metric",
            name="uq_sales_goals_scope_month_metric",
        ),
    )
    op.create_index("ix_sales_goals_organization_id", "sales_goals", ["organization_id"])
    op.create_index("ix_sales_goals_period_month", "sales_goals", ["period_month"])
    op.create_index(
        "uq_sales_goals_orgwide_month_metric",
        "sales_goals",
        ["organization_id", "period_month", "metric"],
        unique=True,
        postgresql_where=sa.text("user_id IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_sales_goals_orgwide_month_metric", table_name="sales_goals")
    op.drop_index("ix_sales_goals_period_month", table_name="sales_goals")
    op.drop_index("ix_sales_goals_organization_id", table_name="sales_goals")
    op.drop_table("sales_goals")
    _METRIC.drop(op.get_bind(), checkfirst=True)
