"""Stub for `companies_at_risk` widget (real implementation in R2/R3/R4)."""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.reports.widgets import CompaniesAtRiskConfig


async def compute_companies_at_risk(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_: date,
    to: date,
    team_id: UUID | None,
    owner_user_id: UUID | None,
    config: CompaniesAtRiskConfig,
) -> dict[str, Any]:
    """STUB — returns zero data. Real implementation lands later."""

    return {"items": [], "threshold_days": config.threshold}
