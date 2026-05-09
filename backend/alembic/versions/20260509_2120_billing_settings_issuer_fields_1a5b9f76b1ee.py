"""billing settings issuer fields

Revision ID: 1a5b9f76b1ee
Revises: 165882b6092b
Create Date: 2026-05-09 21:20:00.000000+00:00

Extends the seller-side `billing_settings` singleton with the fields
that get copied into each tax-invoice's frozen issuer snapshot at
issuance (commit #5 of INVOICES_TASK.md). Server defaults make the
existing id=1 row remain valid post-migration without manual UPDATE;
the founder fills in the address/name/register text via the super-admin
UI before the first invoice is issued.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "1a5b9f76b1ee"
down_revision: str | None = "165882b6092b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Default Jinja2 templates seeded into the singleton row. Defined here as
# Python literals (sa.literal_column would lose the newlines).
_SUBJECT_DEFAULT = "Faktura č. {{ number }} — SimpleCRM, splatnost {{ due_date }}"
_BODY_DEFAULT = (
    "Dobrý den, {{ customer_name }},\n\n"
    "posíláme Vám fakturu **č. {{ number }}** za období "
    "{{ period_start }} – {{ period_end }}.\n\n"
    "**Celkem k úhradě:** {{ total_display }}\n"
    "**Splatnost:** {{ due_date }}\n\n"
    "Platbu prosím zašlete převodem:\n\n"
    "- IBAN: {{ issuer_iban }}\n"
    "- Variabilní symbol: {{ variable_symbol }}\n\n"
    "Nejjednodušší je zaplatit naskenováním QR kódu, který najdete "
    "přímo na faktuře.\n\n"
    "Fakturu v PDF najdete v příloze. Pro zobrazení v aplikaci se "
    "přihlaste na simplecrm.cz.\n\n"
    "S přátelským pozdravem,\nSimpleCRM\n"
)


def upgrade() -> None:
    op.add_column(
        "billing_settings",
        sa.Column(
            "issuer_name",
            sa.String(length=200),
            server_default="",
            nullable=False,
        ),
    )
    op.add_column(
        "billing_settings",
        sa.Column(
            "issuer_address_street",
            sa.String(length=200),
            server_default="",
            nullable=False,
        ),
    )
    op.add_column(
        "billing_settings",
        sa.Column(
            "issuer_address_city",
            sa.String(length=100),
            server_default="",
            nullable=False,
        ),
    )
    op.add_column(
        "billing_settings",
        sa.Column(
            "issuer_address_zip",
            sa.String(length=10),
            server_default="",
            nullable=False,
        ),
    )
    op.add_column(
        "billing_settings",
        sa.Column(
            "issuer_register_text",
            sa.Text(),
            server_default="",
            nullable=False,
        ),
    )
    op.add_column(
        "billing_settings",
        sa.Column(
            "issuer_account_domestic",
            sa.String(length=32),
            nullable=True,
        ),
    )
    op.add_column(
        "billing_settings",
        sa.Column(
            "default_payment_term_days",
            sa.Integer(),
            server_default="14",
            nullable=False,
        ),
    )
    op.add_column(
        "billing_settings",
        sa.Column(
            "invoice_email_subject_template",
            sa.String(length=200),
            server_default=_SUBJECT_DEFAULT,
            nullable=False,
        ),
    )
    op.add_column(
        "billing_settings",
        sa.Column(
            "invoice_email_body_template",
            sa.Text(),
            server_default=_BODY_DEFAULT,
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("billing_settings", "invoice_email_body_template")
    op.drop_column("billing_settings", "invoice_email_subject_template")
    op.drop_column("billing_settings", "default_payment_term_days")
    op.drop_column("billing_settings", "issuer_account_domestic")
    op.drop_column("billing_settings", "issuer_register_text")
    op.drop_column("billing_settings", "issuer_address_zip")
    op.drop_column("billing_settings", "issuer_address_city")
    op.drop_column("billing_settings", "issuer_address_street")
    op.drop_column("billing_settings", "issuer_name")
