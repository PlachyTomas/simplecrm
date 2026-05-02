"""paygate B1: Plan rework + Subscription + BillingSettings + users.is_super_admin

Revision ID: b3a5d27e1c84
Revises: 8a1d4c7e9f02
Create Date: 2026-05-02 07:00:00.000000+00:00

Reworks the `plans` table to support five plan codes (`trial`, `monthly`,
`annual`, `enterprise`, `comp`), creates `subscriptions` and
`billing_settings`, adds `users.is_super_admin`, seeds the new plan rows
and the singleton billing-settings row, and backfills a `trialing`
Subscription for every existing organization.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b3a5d27e1c84"
down_revision: str | None = "8a1d4c7e9f02"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- 1. Plans rework -------------------------------------------------
    # Add new columns alongside the old ones, copy values, then drop old.
    op.add_column("plans", sa.Column("code", sa.String(length=32), nullable=True))
    op.add_column(
        "plans", sa.Column("display_name_cs", sa.String(length=120), nullable=True)
    )
    op.add_column("plans", sa.Column("description_cs", sa.Text(), nullable=True))
    op.add_column(
        "plans", sa.Column("billing_interval", sa.String(length=16), nullable=True)
    )
    op.add_column(
        "plans", sa.Column("price_per_user_minor", sa.Integer(), nullable=True)
    )
    op.add_column(
        "plans",
        sa.Column(
            "is_public",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    op.add_column(
        "plans",
        sa.Column(
            "sort_order",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
    )
    op.add_column("plans", sa.Column("trial_days", sa.Integer(), nullable=True))
    op.add_column(
        "plans",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # Copy what we can from the old columns. The previous seed had two
    # plans named 'team' and 'trial'; map 'team' → 'monthly' since the
    # old price (9900 minor / monthly) lines up.
    op.execute(
        sa.text(
            """
            UPDATE plans
            SET code = CASE
                    WHEN name = 'trial' THEN 'trial'
                    WHEN name = 'team'  THEN 'monthly'
                    ELSE name
                END,
                display_name_cs = name,
                billing_interval = CASE
                    WHEN name = 'trial' THEN 'trial'
                    ELSE interval::text
                END,
                price_per_user_minor = price_minor_units
            """
        )
    )

    # Now `code` is populated for every row; enforce the constraints.
    op.alter_column("plans", "code", nullable=False)
    op.alter_column("plans", "display_name_cs", nullable=False)
    op.alter_column("plans", "billing_interval", nullable=False)
    op.create_unique_constraint("uq_plans_code", "plans", ["code"])
    op.create_index("ix_plans_code", "plans", ["code"])

    # Drop the old enum-typed `interval`, the old `name`, and the old
    # `price_minor_units`. The Postgres enum type is dropped after the
    # column that referenced it.
    op.drop_column("plans", "interval")
    op.drop_column("plans", "name")
    op.drop_column("plans", "price_minor_units")
    op.execute(sa.text("DROP TYPE IF EXISTS plan_interval"))

    # Idempotent re-seed. ON CONFLICT (code) lets us re-run on already-
    # seeded rows safely; new fields (description, sort_order, etc.) are
    # always overwritten with the canonical values.
    op.execute(
        sa.text(
            """
            INSERT INTO plans (
                id, code, display_name_cs, description_cs, billing_interval,
                price_per_user_minor, currency, is_public, is_active,
                sort_order, trial_days, created_at, updated_at
            ) VALUES
                (gen_random_uuid(), 'trial', 'Zkušební verze (30 dní)', NULL,
                 'trial', 0, 'CZK', false, true, 0, 30, now(), now()),
                (gen_random_uuid(), 'monthly', 'Měsíční', NULL,
                 'monthly', 9900, 'CZK', true, true, 1, NULL, now(), now()),
                (gen_random_uuid(), 'annual', 'Roční', NULL,
                 'annual', 99900, 'CZK', true, true, 2, NULL, now(), now()),
                (gen_random_uuid(), 'enterprise', 'Enterprise', NULL,
                 'custom', NULL, 'CZK', false, true, 3, NULL, now(), now()),
                (gen_random_uuid(), 'comp', 'Komplementární', NULL,
                 'free', 0, 'CZK', false, true, 4, NULL, now(), now())
            ON CONFLICT (code) DO UPDATE SET
                display_name_cs = EXCLUDED.display_name_cs,
                description_cs = EXCLUDED.description_cs,
                billing_interval = EXCLUDED.billing_interval,
                price_per_user_minor = EXCLUDED.price_per_user_minor,
                currency = EXCLUDED.currency,
                is_public = EXCLUDED.is_public,
                is_active = EXCLUDED.is_active,
                sort_order = EXCLUDED.sort_order,
                trial_days = EXCLUDED.trial_days,
                updated_at = now()
            """
        )
    )

    # --- 2. Subscriptions ------------------------------------------------
    op.create_table(
        "subscriptions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("plan_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("current_period_starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("override_price_per_user_minor", sa.Integer(), nullable=True),
        sa.Column(
            "is_comp",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column("comp_reason", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_subscriptions_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["plans.id"],
            name=op.f("fk_subscriptions_plan_id_plans"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_subscriptions")),
        sa.UniqueConstraint(
            "organization_id", name=op.f("uq_subscriptions_organization_id")
        ),
    )
    op.create_index(
        "ix_subscriptions_org_status",
        "subscriptions",
        ["organization_id", "status"],
    )
    op.create_index(
        "ix_subscriptions_current_period_ends_at",
        "subscriptions",
        ["current_period_ends_at"],
    )

    # --- 3. Billing settings (singleton) --------------------------------
    op.create_table(
        "billing_settings",
        sa.Column("id", sa.Integer(), autoincrement=False, nullable=False),
        sa.Column(
            "is_vat_payer",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column(
            "vat_rate_percent",
            sa.Numeric(precision=5, scale=2),
            server_default=sa.text("21.00"),
            nullable=False,
        ),
        sa.Column("seller_iban", sa.String(length=34), nullable=True),
        sa.Column("seller_ico", sa.String(length=8), nullable=True),
        sa.Column(
            "contact_email",
            sa.String(length=120),
            server_default=sa.text("'podpora@simplecrm.cz'"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("id = 1", name="ck_billing_settings_singleton"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_billing_settings")),
    )
    op.execute(
        sa.text(
            """
            INSERT INTO billing_settings (id) VALUES (1)
            ON CONFLICT (id) DO NOTHING
            """
        )
    )

    # --- 4. users.is_super_admin ----------------------------------------
    op.add_column(
        "users",
        sa.Column(
            "is_super_admin",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )

    # --- 5. Backfill: every org gets a trialing Subscription ------------
    op.execute(
        sa.text(
            """
            INSERT INTO subscriptions (
                id, organization_id, plan_id, status,
                started_at, current_period_starts_at, current_period_ends_at,
                created_at, updated_at, is_comp
            )
            SELECT
                gen_random_uuid(),
                o.id,
                (SELECT id FROM plans WHERE code = 'trial' LIMIT 1),
                'trialing',
                o.created_at,
                o.created_at,
                o.trial_ends_at,
                now(),
                now(),
                false
            FROM organizations o
            WHERE NOT EXISTS (
                SELECT 1 FROM subscriptions s WHERE s.organization_id = o.id
            )
            """
        )
    )


def downgrade() -> None:
    # Mirror upgrade in reverse.
    op.drop_column("users", "is_super_admin")

    op.drop_table("billing_settings")

    op.drop_index(
        "ix_subscriptions_current_period_ends_at", table_name="subscriptions"
    )
    op.drop_index("ix_subscriptions_org_status", table_name="subscriptions")
    op.drop_table("subscriptions")

    # Restore the legacy plans schema. We add the old columns back, copy
    # values from the new columns, then drop the new columns. We also have
    # to recreate the plan_interval enum.
    plan_interval = sa.Enum("monthly", "annual", name="plan_interval")
    plan_interval.create(op.get_bind(), checkfirst=True)

    op.add_column("plans", sa.Column("name", sa.String(length=64), nullable=True))
    op.add_column("plans", sa.Column("price_minor_units", sa.Integer(), nullable=True))
    op.add_column(
        "plans",
        sa.Column(
            "interval",
            plan_interval,
            nullable=True,
        ),
    )
    op.execute(
        sa.text(
            """
            UPDATE plans
            SET name = CASE WHEN code = 'monthly' THEN 'team' ELSE code END,
                price_minor_units = COALESCE(price_per_user_minor, 0),
                interval = CASE
                    WHEN billing_interval IN ('monthly','annual') THEN billing_interval::plan_interval
                    ELSE 'monthly'::plan_interval
                END
            """
        )
    )
    # Drop plans the old schema didn't know about.
    op.execute(
        sa.text("DELETE FROM plans WHERE code IN ('annual','enterprise','comp')")
    )
    op.alter_column("plans", "name", nullable=False)
    op.alter_column("plans", "price_minor_units", nullable=False)
    op.alter_column("plans", "interval", nullable=False)
    op.create_unique_constraint("uq_plans_name", "plans", ["name"])

    op.drop_index("ix_plans_code", table_name="plans")
    op.drop_constraint("uq_plans_code", "plans", type_="unique")
    op.drop_column("plans", "updated_at")
    op.drop_column("plans", "trial_days")
    op.drop_column("plans", "sort_order")
    op.drop_column("plans", "is_public")
    op.drop_column("plans", "price_per_user_minor")
    op.drop_column("plans", "billing_interval")
    op.drop_column("plans", "description_cs")
    op.drop_column("plans", "display_name_cs")
    op.drop_column("plans", "code")
