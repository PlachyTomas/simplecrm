"""invoicing foundation

Revision ID: 165882b6092b
Revises: f0b01efb64c6
Create Date: 2026-05-09 20:30:00.000000+00:00

Lays the data-model foundation for Czech-law-compliant tax invoices.
Two parts:

1. Rename the existing ``invoices`` table → ``charges`` (the model is
   actually a ComGate charge-attempt log, not a legal invoice). Constraint
   and index names that contain ``invoices`` get renamed to ``charges``
   to free up the bare names for the new tables.

2. Create the new tax-invoice tables: ``invoices``, ``invoice_lines``,
   ``invoice_counters``, ``invoice_audit_log``. Add Postgres triggers
   enforcing per-row immutability after issuance and append-only
   semantics on the audit log.

No data is touched. Tax-invoice tables come up empty; they're populated
by the orchestrator that lands in commit #5.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "165882b6092b"
down_revision: str | None = "f0b01efb64c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# --------------------------------------------------------------------------- #
# Trigger SQL — verbatim. Kept as module-level constants so upgrade and
# downgrade can both reference them.
# --------------------------------------------------------------------------- #


_FN_INVOICE_IMMUTABLE = """
CREATE OR REPLACE FUNCTION tg_invoice_immutable_after_issue() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF NEW.year IS DISTINCT FROM OLD.year
      OR NEW.sequence_in_year IS DISTINCT FROM OLD.sequence_in_year
      OR NEW.number IS DISTINCT FROM OLD.number
      OR NEW.variable_symbol IS DISTINCT FROM OLD.variable_symbol
      OR NEW.kind IS DISTINCT FROM OLD.kind
      OR NEW.related_invoice_id IS DISTINCT FROM OLD.related_invoice_id
      OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
      OR NEW.taxable_supply_date IS DISTINCT FROM OLD.taxable_supply_date
      OR NEW.due_at IS DISTINCT FROM OLD.due_at
      OR NEW.issuer_name IS DISTINCT FROM OLD.issuer_name
      OR NEW.issuer_address IS DISTINCT FROM OLD.issuer_address
      OR NEW.issuer_ico IS DISTINCT FROM OLD.issuer_ico
      OR NEW.issuer_dic IS DISTINCT FROM OLD.issuer_dic
      OR NEW.issuer_iban IS DISTINCT FROM OLD.issuer_iban
      OR NEW.issuer_account_domestic IS DISTINCT FROM OLD.issuer_account_domestic
      OR NEW.issuer_register_text IS DISTINCT FROM OLD.issuer_register_text
      OR NEW.issuer_is_vat_payer IS DISTINCT FROM OLD.issuer_is_vat_payer
      OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
      OR NEW.customer_address IS DISTINCT FROM OLD.customer_address
      OR NEW.customer_ico IS DISTINCT FROM OLD.customer_ico
      OR NEW.customer_dic IS DISTINCT FROM OLD.customer_dic
      OR NEW.subtotal_minor IS DISTINCT FROM OLD.subtotal_minor
      OR NEW.vat_amount_minor IS DISTINCT FROM OLD.vat_amount_minor
      OR NEW.total_minor IS DISTINCT FROM OLD.total_minor
      OR NEW.vat_rate_percent IS DISTINCT FROM OLD.vat_rate_percent
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR (OLD.pdf_sha256 IS NOT NULL AND NEW.pdf_sha256 IS DISTINCT FROM OLD.pdf_sha256)
      OR (OLD.pdf_object_key IS NOT NULL AND NEW.pdf_object_key IS DISTINCT FROM OLD.pdf_object_key)
      OR (OLD.isdoc_sha256 IS NOT NULL AND NEW.isdoc_sha256 IS DISTINCT FROM OLD.isdoc_sha256)
      OR (OLD.isdoc_object_key IS NOT NULL AND NEW.isdoc_object_key IS DISTINCT FROM OLD.isdoc_object_key)
    THEN
      RAISE EXCEPTION 'Invoice % is immutable after issuance', OLD.number USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

_FN_INVOICE_LINE_IMMUTABLE = """
CREATE OR REPLACE FUNCTION tg_invoice_line_immutable_after_issue() RETURNS trigger AS $$
DECLARE _status text;
BEGIN
  SELECT status INTO _status FROM invoices WHERE id = OLD.invoice_id;
  IF _status IS NOT NULL AND _status <> 'draft' THEN
    RAISE EXCEPTION 'Invoice line is immutable after parent issuance' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

_FN_AUDIT_APPEND_ONLY = """
CREATE OR REPLACE FUNCTION tg_invoice_audit_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'invoice_audit_log is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
"""


def upgrade() -> None:
    # --- Step 1: rename existing `invoices` table → `charges` and rename ---
    # the constraint/index names so the bare ``invoices`` identifiers are
    # free for the new table.
    op.rename_table("invoices", "charges")
    op.execute("ALTER TABLE charges RENAME CONSTRAINT pk_invoices TO pk_charges")
    op.execute(
        "ALTER TABLE charges RENAME CONSTRAINT uq_invoices_comgate_trans_id "
        "TO uq_charges_comgate_trans_id"
    )
    op.execute(
        "ALTER TABLE charges RENAME CONSTRAINT fk_invoices_organization_id_organizations "
        "TO fk_charges_organization_id_organizations"
    )
    op.execute(
        "ALTER INDEX ix_invoices_organization_id_created_at "
        "RENAME TO ix_charges_organization_id_created_at"
    )

    # --- Step 2: create the new tax-invoice tables ---
    op.create_table(
        "invoices",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("subscription_id", sa.UUID(), nullable=True),
        sa.Column("charge_id", sa.UUID(), nullable=True),
        sa.Column("number", sa.String(length=16), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("sequence_in_year", sa.Integer(), nullable=False),
        sa.Column("variable_symbol", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("kind", sa.String(length=16), server_default="invoice", nullable=False),
        sa.Column("related_invoice_id", sa.UUID(), nullable=True),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("taxable_supply_date", sa.Date(), nullable=False),
        sa.Column("due_at", sa.Date(), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("issuer_name", sa.String(length=200), nullable=False),
        sa.Column("issuer_address", sa.Text(), nullable=False),
        sa.Column("issuer_ico", sa.String(length=8), nullable=False),
        sa.Column("issuer_dic", sa.String(length=16), nullable=True),
        sa.Column("issuer_iban", sa.String(length=34), nullable=False),
        sa.Column("issuer_account_domestic", sa.String(length=32), nullable=True),
        sa.Column("issuer_register_text", sa.Text(), nullable=False),
        sa.Column("issuer_is_vat_payer", sa.Boolean(), nullable=False),
        sa.Column("customer_name", sa.String(length=200), nullable=False),
        sa.Column("customer_address", sa.Text(), nullable=False),
        sa.Column("customer_ico", sa.String(length=8), nullable=True),
        sa.Column("customer_dic", sa.String(length=16), nullable=True),
        sa.Column("customer_email", sa.String(length=120), nullable=True),
        sa.Column("currency", sa.String(length=3), server_default="CZK", nullable=False),
        sa.Column("subtotal_minor", sa.Integer(), nullable=False),
        sa.Column("vat_amount_minor", sa.Integer(), server_default="0", nullable=False),
        sa.Column("total_minor", sa.Integer(), nullable=False),
        sa.Column(
            "vat_rate_percent",
            sa.Numeric(precision=5, scale=2),
            server_default="0.00",
            nullable=False,
        ),
        sa.Column("pdf_object_key", sa.String(length=300), nullable=True),
        sa.Column("pdf_sha256", sa.String(length=64), nullable=True),
        sa.Column("pdf_size_bytes", sa.Integer(), nullable=True),
        sa.Column("isdoc_object_key", sa.String(length=300), nullable=True),
        sa.Column("isdoc_sha256", sa.String(length=64), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "payment_method",
            sa.String(length=32),
            server_default="bank_transfer",
            nullable=False,
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_to_email", sa.String(length=120), nullable=True),
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
            name=op.f("fk_invoices_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["subscription_id"],
            ["subscriptions.id"],
            name=op.f("fk_invoices_subscription_id_subscriptions"),
        ),
        sa.ForeignKeyConstraint(
            ["charge_id"],
            ["charges.id"],
            name=op.f("fk_invoices_charge_id_charges"),
        ),
        sa.ForeignKeyConstraint(
            ["related_invoice_id"],
            ["invoices.id"],
            name=op.f("fk_invoices_related_invoice_id_invoices"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_invoices")),
        sa.UniqueConstraint("number", name=op.f("uq_invoices_number")),
        sa.UniqueConstraint("year", "sequence_in_year", name="uq_invoices_year_seq"),
    )
    op.create_index("ix_invoices_organization_id", "invoices", ["organization_id"], unique=False)
    op.create_index("ix_invoices_subscription_id", "invoices", ["subscription_id"], unique=False)
    op.create_index("ix_invoices_charge_id", "invoices", ["charge_id"], unique=False)
    op.create_index("ix_invoices_number", "invoices", ["number"], unique=False)
    op.create_index("ix_invoices_year", "invoices", ["year"], unique=False)
    op.create_index("ix_invoices_status", "invoices", ["status"], unique=False)
    op.create_index(
        "ix_invoices_org_issued",
        "invoices",
        ["organization_id", "issued_at"],
        unique=False,
    )
    op.create_index("ix_invoices_year_status", "invoices", ["year", "status"], unique=False)

    op.create_table(
        "invoice_lines",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("invoice_id", sa.UUID(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("quantity", sa.Numeric(precision=10, scale=3), nullable=False),
        sa.Column("unit_label", sa.String(length=32), nullable=True),
        sa.Column("unit_price_minor", sa.Integer(), nullable=False),
        sa.Column(
            "vat_rate_percent",
            sa.Numeric(precision=5, scale=2),
            server_default="0.00",
            nullable=False,
        ),
        sa.Column("line_subtotal_minor", sa.Integer(), nullable=False),
        sa.Column("line_vat_minor", sa.Integer(), server_default="0", nullable=False),
        sa.Column("line_total_minor", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["invoice_id"],
            ["invoices.id"],
            name=op.f("fk_invoice_lines_invoice_id_invoices"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_invoice_lines")),
    )
    op.create_index(
        "ix_invoice_lines_invoice_id",
        "invoice_lines",
        ["invoice_id"],
        unique=False,
    )

    op.create_table(
        "invoice_counters",
        sa.Column("year", sa.Integer(), autoincrement=False, nullable=False),
        sa.Column("last_sequence", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("year", name=op.f("pk_invoice_counters")),
    )

    op.create_table(
        "invoice_audit_log",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("invoice_id", sa.UUID(), nullable=True),
        sa.Column("event", sa.String(length=64), nullable=False),
        sa.Column("actor_user_id", sa.UUID(), nullable=True),
        sa.Column(
            "payload",
            sa.dialects.postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["invoice_id"],
            ["invoices.id"],
            name=op.f("fk_invoice_audit_log_invoice_id_invoices"),
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
            name=op.f("fk_invoice_audit_log_actor_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_invoice_audit_log")),
    )
    op.create_index(
        "ix_invoice_audit_log_invoice_id",
        "invoice_audit_log",
        ["invoice_id"],
        unique=False,
    )
    op.create_index(
        "ix_invoice_audit_log_event",
        "invoice_audit_log",
        ["event"],
        unique=False,
    )
    op.create_index(
        "ix_invoice_audit_log_created_at",
        "invoice_audit_log",
        ["created_at"],
        unique=False,
    )

    # --- Step 3: triggers ---
    op.execute(_FN_INVOICE_IMMUTABLE)
    op.execute(
        "CREATE TRIGGER trg_invoice_immutable BEFORE UPDATE ON invoices "
        "FOR EACH ROW EXECUTE FUNCTION tg_invoice_immutable_after_issue();"
    )

    op.execute(_FN_INVOICE_LINE_IMMUTABLE)
    op.execute(
        "CREATE TRIGGER trg_invoice_line_immutable BEFORE UPDATE ON invoice_lines "
        "FOR EACH ROW EXECUTE FUNCTION tg_invoice_line_immutable_after_issue();"
    )

    op.execute(_FN_AUDIT_APPEND_ONLY)
    op.execute(
        "CREATE TRIGGER trg_invoice_audit_log_no_update BEFORE UPDATE "
        "ON invoice_audit_log FOR EACH ROW "
        "EXECUTE FUNCTION tg_invoice_audit_log_append_only();"
    )
    op.execute(
        "CREATE TRIGGER trg_invoice_audit_log_no_delete BEFORE DELETE "
        "ON invoice_audit_log FOR EACH ROW "
        "EXECUTE FUNCTION tg_invoice_audit_log_append_only();"
    )


def downgrade() -> None:
    # Drop triggers + functions in reverse order
    op.execute("DROP TRIGGER IF EXISTS trg_invoice_audit_log_no_delete ON invoice_audit_log")
    op.execute("DROP TRIGGER IF EXISTS trg_invoice_audit_log_no_update ON invoice_audit_log")
    op.execute("DROP FUNCTION IF EXISTS tg_invoice_audit_log_append_only()")

    op.execute("DROP TRIGGER IF EXISTS trg_invoice_line_immutable ON invoice_lines")
    op.execute("DROP FUNCTION IF EXISTS tg_invoice_line_immutable_after_issue()")

    op.execute("DROP TRIGGER IF EXISTS trg_invoice_immutable ON invoices")
    op.execute("DROP FUNCTION IF EXISTS tg_invoice_immutable_after_issue()")

    # Drop new tables
    op.drop_index("ix_invoice_audit_log_created_at", table_name="invoice_audit_log")
    op.drop_index("ix_invoice_audit_log_event", table_name="invoice_audit_log")
    op.drop_index("ix_invoice_audit_log_invoice_id", table_name="invoice_audit_log")
    op.drop_table("invoice_audit_log")

    op.drop_table("invoice_counters")

    op.drop_index("ix_invoice_lines_invoice_id", table_name="invoice_lines")
    op.drop_table("invoice_lines")

    op.drop_index("ix_invoices_year_status", table_name="invoices")
    op.drop_index("ix_invoices_org_issued", table_name="invoices")
    op.drop_index("ix_invoices_status", table_name="invoices")
    op.drop_index("ix_invoices_year", table_name="invoices")
    op.drop_index("ix_invoices_number", table_name="invoices")
    op.drop_index("ix_invoices_charge_id", table_name="invoices")
    op.drop_index("ix_invoices_subscription_id", table_name="invoices")
    op.drop_index("ix_invoices_organization_id", table_name="invoices")
    op.drop_table("invoices")

    # Restore the renamed names on the charges table, then rename it back
    op.execute(
        "ALTER INDEX ix_charges_organization_id_created_at "
        "RENAME TO ix_invoices_organization_id_created_at"
    )
    op.execute(
        "ALTER TABLE charges RENAME CONSTRAINT fk_charges_organization_id_organizations "
        "TO fk_invoices_organization_id_organizations"
    )
    op.execute(
        "ALTER TABLE charges RENAME CONSTRAINT uq_charges_comgate_trans_id "
        "TO uq_invoices_comgate_trans_id"
    )
    op.execute("ALTER TABLE charges RENAME CONSTRAINT pk_charges TO pk_invoices")
    op.rename_table("charges", "invoices")
