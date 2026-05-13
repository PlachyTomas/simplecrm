"""blocked_companies table

Revision ID: d92c4a51e80b
Revises: a814b0ce67f3
Create Date: 2026-05-13 14:00:00.000000+00:00

Per-org list of IČO that admin marks as off-limits for any salesperson
on the team. `POST /companies` rejects with 409 when the IČO is in the
caller's org's list; admins keep the list via /admin/blocked-companies.

A `reason_category` enum keeps the dropdown stable across orgs; the
free-form `note` column carries the specifics ("zákazník u konkurence
od 2024-Q1" etc.).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d92c4a51e80b"
down_revision: str | None = "a814b0ce67f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_REASON_VALUES = ("competitor", "do_not_contact", "bankrupt", "legal_issue", "other")


def upgrade() -> None:
    reason_enum = sa.Enum(*_REASON_VALUES, name="blocked_company_reason")
    op.create_table(
        "blocked_companies",
        sa.Column(
            "id",
            sa.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "organization_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("ico", sa.String(length=8), nullable=False),
        sa.Column("reason_category", reason_enum, nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("ares_name", sa.String(length=200), nullable=True),
        sa.Column(
            "created_by",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("organization_id", "ico", name="uq_blocked_companies_org_ico"),
    )
    op.create_index(
        "ix_blocked_companies_organization_id",
        "blocked_companies",
        ["organization_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_blocked_companies_organization_id", table_name="blocked_companies")
    op.drop_table("blocked_companies")
    sa.Enum(name="blocked_company_reason").drop(op.get_bind(), checkfirst=True)
