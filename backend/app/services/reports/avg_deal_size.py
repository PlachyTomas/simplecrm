"""Stub for `avg_deal_size` widget (real implementation in R2/R3/R4)."""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.reports.widgets import AvgDealSizeConfig


async def compute_avg_deal_size(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_: date,
    to: date,
    team_id: UUID | None,
    owner_user_id: UUID | None,
    config: AvgDealSizeConfig,
) -> dict[str, Any]:
    """STUB — returns zero data. Real implementation lands later."""

    return {"value": 0, "currency": "CZK", "sample_count": 0, "comparison": None}
