"""comgate billing: payment_methods + invoices + webhook_events + subscription columns

Revision ID: c4f9e2a18b67
Revises: d2c45f8e1a3b
Create Date: 2026-05-03 17:00:00.000000+00:00

Lays the schema for the ComGate-backed billing rewrite. Three new tables
(`payment_methods`, `invoices`, `webhook_events`) plus four columns on
`subscriptions` (`contracted_seat_count`, `dunning_attempts`,
`last_charge_failed_at`, `next_renewal_charge_at`).

`contracted_seat_count` backfills from existing `seat_count` so post-deploy
every existing org's "paid" cap matches what they're already at — closes
the seat-cap abuse vector (Finding 1 in the 2026-05-03 adversary report)
without retroactively rejecting customers who legitimately bumped earlier.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c4f9e2a18b67"
down_revision: str | None = "d2c45f8e1a3b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # payment_methods — one row per org with a saved card on file at ComGate.
    # ------------------------------------------------------------------
    op.create_table(
        "payment_methods",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        # ComGate's transaction ID from the original `create` with
        # `initRecurring=true`. We replay this transId via `recurring`
        # to charge the same card for renewals + seat upgrades. Cannot
        # be re-derived if lost — losing it forces the customer to
        # re-enter card details.
        sa.Column("comgate_initial_trans_id", sa.String(64), nullable=False),
        sa.Column("card_brand", sa.String(32), nullable=True),
        sa.Column("card_last4", sa.String(4), nullable=True),
        sa.Column("card_exp_month", sa.SmallInteger(), nullable=True),
        sa.Column("card_exp_year", sa.SmallInteger(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # ------------------------------------------------------------------
    # invoices — one row per ComGate charge attempt. Idempotency-keyed by
    # `comgate_trans_id`. The webhook handler writes pending → paid
    # (or failed); the customer-facing invoice list reads from this.
    # ------------------------------------------------------------------
    op.create_table(
        "invoices",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # initial = first activation after choose-plan
        # renewal = scheduled period rollover charge
        # seat_upgrade = mid-period prorated charge for added seats
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("amount_minor", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="CZK"),
        # pending → paid | failed (terminal). refunded is reserved for the
        # not-yet-implemented refund path.
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("comgate_trans_id", sa.String(64), nullable=True, unique=True),
        sa.Column("seats", sa.Integer(), nullable=True),
        sa.Column(
            "period_starts_at", sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column(
            "period_ends_at", sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_invoices_organization_id_created_at",
        "invoices",
        ["organization_id", sa.text("created_at DESC")],
    )

    # ------------------------------------------------------------------
    # webhook_events — idempotency log. ComGate retries notifications;
    # we insert-or-skip on the unique `comgate_event_id` so a re-fire
    # doesn't double-process a charge.
    # ------------------------------------------------------------------
    op.create_table(
        "webhook_events",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        # ComGate's transaction ID — duplicated in `invoices` but kept
        # here so we can dedupe even before the invoice exists (e.g. a
        # webhook racing the customer's return). Unique so a second
        # delivery silently no-ops.
        sa.Column(
            "comgate_event_id", sa.String(128), nullable=False, unique=True
        ),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "processed_at", sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
    )

    # ------------------------------------------------------------------
    # subscriptions — new columns
    # ------------------------------------------------------------------
    # contracted_seat_count = the seat count last blessed by a payment.
    # `seat_count` (live cap) is allowed to move freely upward only when
    # status='trialing'; once active, increases above contracted require
    # a successful ComGate charge that bumps both seat_count AND
    # contracted_seat_count together. Closes the bump-then-drop abuse.
    op.add_column(
        "subscriptions",
        sa.Column(
            "contracted_seat_count",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
    )
    # Backfill: every existing org's contracted cap = current seat_count.
    op.execute(
        "UPDATE subscriptions SET contracted_seat_count = seat_count"
    )

    op.add_column(
        "subscriptions",
        sa.Column(
            "dunning_attempts",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "subscriptions",
        sa.Column(
            "last_charge_failed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    # When set, the recurring-charge job will attempt a charge at this
    # time. Normally equals current_period_ends_at; can be pushed forward
    # by dunning logic to schedule a retry.
    op.add_column(
        "subscriptions",
        sa.Column(
            "next_renewal_charge_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_subscriptions_next_renewal_charge_at",
        "subscriptions",
        ["next_renewal_charge_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_subscriptions_next_renewal_charge_at", table_name="subscriptions"
    )
    op.drop_column("subscriptions", "next_renewal_charge_at")
    op.drop_column("subscriptions", "last_charge_failed_at")
    op.drop_column("subscriptions", "dunning_attempts")
    op.drop_column("subscriptions", "contracted_seat_count")

    op.drop_table("webhook_events")
    op.drop_index(
        "ix_invoices_organization_id_created_at", table_name="invoices"
    )
    op.drop_table("invoices")
    op.drop_table("payment_methods")
