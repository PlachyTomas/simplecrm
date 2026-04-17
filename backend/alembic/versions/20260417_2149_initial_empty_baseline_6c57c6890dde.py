"""initial empty baseline

Revision ID: 6c57c6890dde
Revises:
Create Date: 2026-04-17 21:49:55.931493+00:00

"""

from __future__ import annotations

from collections.abc import Sequence

revision: str = "6c57c6890dde"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Placeholder revision — real tables arrive in Task 1.1."""


def downgrade() -> None:
    """Placeholder revision — no-op."""
