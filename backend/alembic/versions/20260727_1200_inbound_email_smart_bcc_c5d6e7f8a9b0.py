"""smart bcc: inbound email logging

Revision ID: c5d6e7f8a9b0
Revises: b3c4d5e6f7a8
Create Date: 2026-07-27 12:00:00.000000+00:00

Feature F3. Four changes, all additive:

  * `users.inbound_token` — the random half of a user's magic BCC address,
    minted lazily on first read of `/me/inbound-address`. NULL for everyone
    until then, and Postgres lets a UNIQUE index hold arbitrarily many NULLs.
  * `sent_emails.direction` — a new `email_direction` enum so one table can
    carry both sides of the correspondence. The `outbound` server default
    backfills every pre-F3 row in place, with no UPDATE pass.
  * `sent_emails.from_email` — the correspondent's address on inbound rows
    (NULL on outbound, where the sender is `sender_user_id`'s SMTP identity).
  * a UNIQUE index on `(organization_id, message_id)` — the idempotency key
    for the inbound endpoint, so an MTA retry can't duplicate a timeline row.

Plus the `email_received` activity type. PG 12+ allows `ALTER TYPE ... ADD
VALUE` inside a transaction as long as the value isn't *used* in the same
transaction — nothing here writes an activity, so this is safe.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c5d6e7f8a9b0"
down_revision: str | None = "b3c4d5e6f7a8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_DIRECTION_VALUES = ("outbound", "inbound")


def upgrade() -> None:
    op.execute("ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'email_received'")

    op.add_column("users", sa.Column("inbound_token", sa.Text(), nullable=True))
    op.create_index("ix_users_inbound_token", "users", ["inbound_token"], unique=True)

    direction_enum = sa.Enum(*_DIRECTION_VALUES, name="email_direction")
    direction_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "sent_emails",
        sa.Column(
            "direction",
            direction_enum,
            nullable=False,
            server_default="outbound",
        ),
    )
    op.add_column("sent_emails", sa.Column("from_email", sa.String(length=320), nullable=True))

    # Defensive de-dup before the unique index. Outbound Message-IDs are minted
    # as `<uuid4hex@domain>` so a collision shouldn't exist, but a failed index
    # build mid-deploy is far worse than suffixing the (already ambiguous)
    # id of a duplicate row. Only rows that are *already* broken are touched.
    op.execute(
        """
        UPDATE sent_emails s
        SET message_id = left(s.message_id, 460) || '.dup-' || left(s.id::text, 8)
        FROM (
            SELECT id,
                   row_number() OVER (
                       PARTITION BY organization_id, message_id ORDER BY created_at, id
                   ) AS rn
            FROM sent_emails
        ) d
        WHERE d.id = s.id AND d.rn > 1
        """
    )
    op.create_index(
        "uq_sent_emails_organization_id_message_id",
        "sent_emails",
        ["organization_id", "message_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_sent_emails_organization_id_message_id", table_name="sent_emails")
    op.drop_column("sent_emails", "from_email")
    op.drop_column("sent_emails", "direction")
    sa.Enum(name="email_direction").drop(op.get_bind(), checkfirst=True)
    op.drop_index("ix_users_inbound_token", table_name="users")
    op.drop_column("users", "inbound_token")
    # `email_received` is left in `activity_type`: Postgres can't drop a single
    # enum value without recreating the type, and an unused value is harmless.
