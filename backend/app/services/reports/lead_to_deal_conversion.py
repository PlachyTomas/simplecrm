"""Stub for `lead_to_deal_conversion` widget (real implementation in R2/R3/R4)."""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.reports.widgets import LeadToDealConversionConfig


async def compute_lead_to_deal_conversion(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_: date,
    to: date,
    team_id: UUID | None,
    owner_user_id: UUID | None,
    config: LeadToDealConversionConfig,
) -> dict[str, Any]:
    """STUB — returns zero data. Real implementation lands later."""

    return {"value": None, "converted_count": 0, "total_count": 0, "comparison": None, "breakdown": []}
