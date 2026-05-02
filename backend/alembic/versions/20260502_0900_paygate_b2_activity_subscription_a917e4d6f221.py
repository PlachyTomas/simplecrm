"""paygate B2: extend activity enums for subscription audit

Revision ID: a917e4d6f221
Revises: b3a5d27e1c84
Create Date: 2026-05-02 09:00:00.000000+00:00

Adds 'organization' to `activity_entity_type` and 'subscription_change'
to `activity_type` so `BillingService` can write Activity rows for
every subscription transition (choose / activate / set_comp /
set_enterprise / cancel / extend_trial).

Postgres `ALTER TYPE … ADD VALUE` cannot run inside the implicit
transaction Alembic wraps each migration in, so we commit before
issuing the DDL.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a917e4d6f221"
down_revision: str | None = "b3a5d27e1c84"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ALTER TYPE … ADD VALUE must run outside a transaction in Postgres.
    # Alembic 1.13+ supports `op.execute` with a transactionless context
    # via the COMMIT-then-DDL pattern below.
    op.execute("COMMIT")
    op.execute(
        "ALTER TYPE activity_entity_type ADD VALUE IF NOT EXISTS 'organization'"
    )
    op.execute(
        "ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'subscription_change'"
    )


def downgrade() -> None:
    # Postgres can't drop a single enum value. Recreate the type without
    # the new values and rebind every column. Cheap because the column
    # set referencing each type is small.
    op.execute("COMMIT")

    # Rename old types out of the way.
    op.execute("ALTER TYPE activity_entity_type RENAME TO activity_entity_type_old")
    op.execute("ALTER TYPE activity_type RENAME TO activity_type_old")

    # Recreate old shapes.
    sa.Enum("company", "contact", "deal", name="activity_entity_type").create(
        op.get_bind(), checkfirst=False
    )
    sa.Enum(
        "note",
        "stage_change",
        "owner_change",
        "deal_won",
        "deal_lost",
        "company_freed",
        "ownership_reassigned",
        name="activity_type",
    ).create(op.get_bind(), checkfirst=False)

    # Drop any rows that referenced the soon-to-be-gone values; the
    # subscription audit trail is regenerable, so this is safe.
    op.execute(
        "DELETE FROM activities "
        "WHERE entity_type::text = 'organization' "
        "OR activity_type::text = 'subscription_change'"
    )

    op.execute(
        "ALTER TABLE activities "
        "ALTER COLUMN entity_type TYPE activity_entity_type "
        "USING entity_type::text::activity_entity_type"
    )
    op.execute(
        "ALTER TABLE activities "
        "ALTER COLUMN activity_type TYPE activity_type "
        "USING activity_type::text::activity_type"
    )

    op.execute("DROP TYPE activity_entity_type_old")
    op.execute("DROP TYPE activity_type_old")
