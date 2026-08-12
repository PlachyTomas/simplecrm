"""unaccent extension for diacritic-insensitive search

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-08-12 09:00:00.000000+00:00

Enables Postgres' contrib `unaccent` so every search box can fold diacritics:
typing "brana" finds "Brána" and vice versa. See `app/db/search.py` for the
query helper that uses it.

`CREATE EXTENSION` needs a superuser (or an explicitly granted role). That
holds in every environment we ship: the official `postgres:16-alpine` image
runs migrations as the `POSTGRES_USER` superuser, and the Homebrew dev setup
uses the `simplecrm` superuser. It is a plain DDL statement, so — unlike
`ALTER TYPE ... ADD VALUE` — it runs fine inside Alembic's transaction.

The downgrade drops the extension. That only succeeds once nothing depends on
it, which is exactly right: the queries that call `unaccent()` live in code at
this revision or later, so a downgrade past this point removes them too.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "d5e6f7a8b9c0"
down_revision: str | None = "c4d5e6f7a8b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS unaccent")
