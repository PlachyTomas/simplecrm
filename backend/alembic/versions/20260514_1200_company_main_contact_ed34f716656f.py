"""company main_contact_id

Revision ID: ed34f716656f
Revises: d92c4a51e80b
Create Date: 2026-05-14 12:00:00.000000+00:00

Explicit pick for the "main contact" of a company. The Tabulka (dense
table) view on /app/companies pulls phone/email columns from this
contact. NULL means no explicit choice yet — the API falls back to the
alphabetically-first contact for the company. ON DELETE SET NULL so a
deleted contact doesn't dangle the FK.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "ed34f716656f"
down_revision: str | None = "d92c4a51e80b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "companies",
        sa.Column("main_contact_id", sa.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_companies_main_contact_id_contacts",
        "companies",
        "contacts",
        ["main_contact_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_companies_main_contact_id_contacts", "companies", type_="foreignkey")
    op.drop_column("companies", "main_contact_id")
