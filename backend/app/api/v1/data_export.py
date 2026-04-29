"""Data-export endpoints intentionally **not** trial-gated.

The brief's expired-trial gate (`<TrialExpiredGate />`) explicitly promises
"Exportovat data" works after the trial ends — users must always be able to
walk away with their own data. This module owns those endpoints and is
mounted in `api/v1/__init__.py` outside `PROTECTED_DEPS`. Auth is still
required (`get_current_user`); only the trial check is skipped.

The URL `/api/v1/reports/export-csv` is preserved for backward compatibility
with the existing OpenAPI types and frontend `buildExportCsvUrl`.
"""

from __future__ import annotations

import csv
import io
from datetime import UTC, date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.scoping import scope_by_owner
from app.db import get_db
from app.db.models import Deal, Stage, User
from app.services.lookup_cache import RateLimiter

router = APIRouter(prefix="/reports", tags=["reports"])

# Per-user throttle on the ungated export. The endpoint deliberately bypasses
# the trial gate so users can always walk away with their data; the limit
# stops an authenticated abuser (or a runaway client) from hammering it.
# 10 calls / 60s is well above any human download cadence.
_export_rate_limiter = RateLimiter(max_calls=10, window_seconds=60.0)


def get_export_rate_limiter() -> RateLimiter:
    return _export_rate_limiter


def _date_window(
    from_date: date | None, to_date: date | None
) -> tuple[date, date, datetime, datetime]:
    """Mirror of `reports._date_window` — kept local so the export module
    isn't coupled to the rest of the reports router."""
    today = datetime.now(tz=UTC).date()
    resolved_to = to_date or today
    resolved_from = from_date or resolved_to.replace(day=1)
    start = datetime.combine(resolved_from, time.min, tzinfo=UTC)
    end = datetime.combine(resolved_to, time.max, tzinfo=UTC)
    return resolved_from, resolved_to, start, end


@router.get("/export-csv")
async def export_deals_csv(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    rate_limiter: RateLimiter = Depends(get_export_rate_limiter),
) -> StreamingResponse:
    """Deals CSV export matching the caller's visibility scope.

    Available even when the org's trial has ended — see module docstring.
    """
    if not await rate_limiter.try_acquire(user.id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many export requests — please wait a moment.",
        )
    resolved_from, resolved_to, start, end = _date_window(from_date, to_date)

    stmt = (
        select(Deal, Stage)
        .join(Stage, Stage.id == Deal.stage_id)
        .where(
            Deal.organization_id == user.organization_id,
            Deal.created_at <= end,
            (Deal.closed_at.is_(None)) | (Deal.closed_at >= start),
        )
    )
    scoped = await scope_by_owner(stmt, session=session, user=user, owner_col=Deal.owner_user_id)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "id",
            "name",
            "stage",
            "stage_type",
            "value",
            "currency",
            "owner_user_id",
            "company_id",
            "expected_close_date",
            "closed_at",
            "lost_reason",
            "created_at",
        ]
    )
    for deal, stage in (await session.execute(scoped)).all():
        writer.writerow(
            [
                str(deal.id),
                deal.name,
                stage.name,
                stage.stage_type.value,
                str(deal.value),
                deal.currency,
                str(deal.owner_user_id) if deal.owner_user_id else "",
                str(deal.company_id),
                deal.expected_close_date.isoformat() if deal.expected_close_date else "",
                deal.closed_at.isoformat() if deal.closed_at else "",
                deal.lost_reason or "",
                deal.created_at.isoformat(),
            ]
        )
    buffer.seek(0)
    filename = f"simplecrm-deals-{resolved_from.isoformat()}_{resolved_to.isoformat()}.csv"
    # UTF-8 BOM so Excel renders Czech diacritics correctly. Brief §4.6.
    payload = "﻿" + buffer.getvalue()
    return StreamingResponse(
        iter([payload]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
