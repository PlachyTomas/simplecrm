"""Editable home dashboard — layout persistence.

`GET/PUT/DELETE /api/v1/users/me/home-dashboard`. Mirrors the reports
dashboard-config endpoints (`reports.py`), but open to every role: the
default layout returned by GET is role-aware (see
`services/home_dashboard.py`), so a salesperson and an admin each get a
sensible starter set.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db import get_db
from app.db.models import User
from app.schemas.home_dashboard import HomeDashboardConfig
from app.services.home_dashboard import default_home_dashboard_config

# Prefix + route path compose to `/users/me/home-dashboard`, mounted under
# the `/api/v1` app prefix.
router = APIRouter(prefix="/users/me", tags=["home-dashboard"])


def _serialize_home_dashboard_config(cfg: HomeDashboardConfig) -> dict[str, object]:
    """Return the wire-format dict (camelCase `mobileOrder`) the frontend expects."""

    return cfg.model_dump(by_alias=True, mode="json")


@router.get("/home-dashboard")
async def get_home_dashboard(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Return the user's persisted layout, or the role-aware default.

    Empty `{}` (column-default for new rows) means "first visit — give
    them the role-aware starter set." We don't persist on first read; the
    frontend PUTs once the user makes a modification. `user.organization`
    is eager-loaded by `get_current_user` (joinedload), so no extra query.
    """

    raw = user.home_dashboard_config or {}
    if not raw:
        return _serialize_home_dashboard_config(
            default_home_dashboard_config(user, user.organization)
        )
    # Re-validate persisted JSON on read so a deploy that tightens a widget
    # config doesn't return stale-shaped data. Fall back to defaults rather
    # than blowing up the page; the next PUT overwrites the bad row.
    try:
        cfg = HomeDashboardConfig.model_validate(raw)
    except ValidationError:
        cfg = default_home_dashboard_config(user, user.organization)
    return _serialize_home_dashboard_config(cfg)


@router.put("/home-dashboard")
async def put_home_dashboard(
    payload: HomeDashboardConfig,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Validate and persist the user's layout. Returns the round-tripped value."""

    user.home_dashboard_config = payload.model_dump(by_alias=True, mode="json")
    await session.commit()
    return _serialize_home_dashboard_config(payload)


@router.delete("/home-dashboard", status_code=status.HTTP_204_NO_CONTENT)
async def delete_home_dashboard(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> None:
    """Reset the user's layout to the default. The empty `{}` triggers the
    GET endpoint's role-aware default-layout fallback on the next read."""

    user.home_dashboard_config = {}
    await session.commit()
