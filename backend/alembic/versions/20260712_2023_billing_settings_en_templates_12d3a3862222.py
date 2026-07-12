"""billing settings en templates

Revision ID: 12d3a3862222
Revises: b936c7a9df14
Create Date: 2026-07-12 20:23:03.008980+00:00

Adds the English counterparts of `invoice_email_subject_template` /
`invoice_email_body_template` (i18n Task 7). `InvoiceMailer` picks these
columns instead of the cs ones when the customer org's locale resolves to
"en" via `language_for_locale`. Server defaults make the existing id=1 row
remain valid post-migration; same `{{ }}` vars as the cs templates.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "12d3a3862222"
down_revision: str | None = "b936c7a9df14"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Default en Jinja2 templates seeded into the singleton row — faithful
# translation of the cs defaults added in 1a5b9f76b1ee, same vars/structure.
_SUBJECT_DEFAULT_EN = "Invoice {{ number }} — SimpleCRM, due {{ due_date }}"
_BODY_DEFAULT_EN = (
    "Hello {{ customer_name }},\n\n"
    "we are sending you invoice **No. {{ number }}** for the period "
    "{{ period_start }} – {{ period_end }}.\n\n"
    "**Total due:** {{ total_display }}\n"
    "**Due date:** {{ due_date }}\n\n"
    "Please send payment by bank transfer:\n\n"
    "- IBAN: {{ issuer_iban }}\n"
    "- Variable symbol: {{ variable_symbol }}\n\n"
    "The easiest way to pay is by scanning the QR code found "
    "directly on the invoice.\n\n"
    "You'll find the invoice PDF attached. To view it in the app, "
    "sign in at simplecrm.cz.\n\n"
    "Best regards,\nSimpleCRM\n"
)


def upgrade() -> None:
    op.add_column(
        "billing_settings",
        sa.Column(
            "invoice_email_subject_template_en",
            sa.String(length=200),
            server_default=_SUBJECT_DEFAULT_EN,
            nullable=False,
        ),
    )
    op.add_column(
        "billing_settings",
        sa.Column(
            "invoice_email_body_template_en",
            sa.Text(),
            server_default=_BODY_DEFAULT_EN,
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("billing_settings", "invoice_email_body_template_en")
    op.drop_column("billing_settings", "invoice_email_subject_template_en")
