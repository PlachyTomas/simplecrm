"""activity: add company_id + new activity types, backfill

Revision ID: a7c1f0b2d3e4
Revises: d1e2f3a4b5c6
Create Date: 2026-07-08 19:30:00.000000+00:00

Adds a nullable, indexed `company_id` to `activities` so the company
timeline can surface company-level *and* its deals'/events'/emails'
activity in one query, plus four new `activity_type` values
(deal_created / deal_updated / company_updated / event_created).

Backfills `company_id` for existing rows: `entity_type='company'` rows get
their own `entity_id`; `entity_type='deal'` rows get the deal's company via
join. PG 12+ allows `ALTER TYPE ... ADD VALUE` inside a transaction as long
as the value isn't *used* in the same transaction (it isn't — the backfill
only touches `company_id`).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a7c1f0b2d3e4"
down_revision: str | None = "d1e2f3a4b5c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'deal_created'")
    op.execute("ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'deal_updated'")
    op.execute("ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'company_updated'")
    op.execute("ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'event_created'")

    op.add_column("activities", sa.Column("company_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_activities_company_id_companies",
        "activities",
        "companies",
        ["company_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_activities_company_id", "activities", ["company_id"])

    # Backfill: company-entity rows point at themselves; deal-entity rows fan
    # up to the deal's company. Cast the enum to text to avoid literal-coercion
    # surprises.
    op.execute(
        "UPDATE activities SET company_id = entity_id "
        "WHERE entity_type::text = 'company' AND company_id IS NULL"
    )
    op.execute(
        "UPDATE activities a SET company_id = d.company_id "
        "FROM deals d "
        "WHERE a.entity_type::text = 'deal' AND a.entity_id = d.id AND a.company_id IS NULL"
    )


def downgrade() -> None:
    op.drop_index("ix_activities_company_id", table_name="activities")
    op.drop_constraint("fk_activities_company_id_companies", "activities", type_="foreignkey")
    op.drop_column("activities", "company_id")
    # The four added enum values are left in place: Postgres can't drop a single
    # enum value without recreating the type, and leaving unused values is
    # harmless.
