"""Stub for `pipeline_value` widget (real implementation in R2)."""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.reports.widgets import PipelineValueConfig


async def compute_pipeline_value(
    session: AsyncSession,
    *,
    organization_id: UUID,
    from_: date,
    to: date,
    team_id: UUID | None,
    owner_user_id: UUID | None,
    config: PipelineValueConfig,
) -> dict[str, Any]:
    """STUB — returns zero data. R2 fills in the real query."""

    return {
        "value": 0,
        "currency": "CZK",
        "sparkline": [],
        "comparison": None,
    }
