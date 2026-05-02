"""Stub for `deals_won` widget (real implementation in R2/R3/R4)."""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.reports.widgets import DealsWonConfig


async def compute_deals_won(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_: date,
    to: date,
    team_id: UUID | None,
    owner_user_id: UUID | None,
    config: DealsWonConfig,
) -> dict[str, Any]:
    """STUB — returns zero data. Real implementation lands later."""

    return {"count": 0, "value": 0, "currency": "CZK", "comparison": None}
