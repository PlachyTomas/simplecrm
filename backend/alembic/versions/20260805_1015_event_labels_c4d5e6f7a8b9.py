"""event labels + calendar event label links

Revision ID: c4d5e6f7a8b9
Revises: 43bae7c54192
Create Date: 2026-08-05 10:15:00.000000+00:00

Org-shared colored labels for calendar events. Plain tables — no native
enums, so nothing here needs to run outside a transaction.

The backfill mirrors `services/event_labels.create_default_event_labels`
for orgs that already exist: three seeds picked by `organizations.locale`
(`cs*` → Hovor / Schůzka / Follow-up, anything else → Call / Meeting /
Follow-up, same colors). Erased orgs (`deleted_at IS NOT NULL`) are skipped
— they're accounting tombstones, not live workspaces.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c4d5e6f7a8b9"
down_revision: str | None = "43bae7c54192"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_BACKFILL_CS = """
    INSERT INTO event_labels (id, organization_id, name, color)
    SELECT gen_random_uuid(), o.id, seed.name, seed.color
    FROM organizations o
    CROSS JOIN (VALUES
        ('Hovor', '#0EA5E9'),
        ('Schůzka', '#6366F1'),
        ('Follow-up', '#F59E0B')
    ) AS seed(name, color)
    WHERE o.deleted_at IS NULL AND left(lower(o.locale), 2) = 'cs'
"""

_BACKFILL_EN = """
    INSERT INTO event_labels (id, organization_id, name, color)
    SELECT gen_random_uuid(), o.id, seed.name, seed.color
    FROM organizations o
    CROSS JOIN (VALUES
        ('Call', '#0EA5E9'),
        ('Meeting', '#6366F1'),
        ('Follow-up', '#F59E0B')
    ) AS seed(name, color)
    WHERE o.deleted_at IS NULL AND left(lower(o.locale), 2) <> 'cs'
"""


def upgrade() -> None:
    op.create_table(
        "event_labels",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("color", sa.String(length=9), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_event_labels_organization_id", "event_labels", ["organization_id"])
    # Case-insensitive uniqueness per org — "Hovor" and "hovor" are one label.
    op.create_index(
        "uq_event_labels_org_name_lower",
        "event_labels",
        ["organization_id", sa.text("lower(name)")],
        unique=True,
    )

    op.create_table(
        "calendar_event_labels",
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("calendar_events.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "label_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("event_labels.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
    )
    op.create_index("ix_calendar_event_labels_label_id", "calendar_event_labels", ["label_id"])

    # Backfill the three defaults for every existing (non-erased) org.
    op.execute(sa.text(_BACKFILL_CS))
    op.execute(sa.text(_BACKFILL_EN))


def downgrade() -> None:
    op.drop_index("ix_calendar_event_labels_label_id", table_name="calendar_event_labels")
    op.drop_table("calendar_event_labels")
    op.drop_index("uq_event_labels_org_name_lower", table_name="event_labels")
    op.drop_index("ix_event_labels_organization_id", table_name="event_labels")
    op.drop_table("event_labels")
