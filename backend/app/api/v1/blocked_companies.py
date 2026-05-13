"""Org admin maintenance of the blocked-IČO list.

Admins keep a per-org list of IČO that no salesperson is allowed to
claim. The list lives behind `/admin/blocked-companies/*`; the actual
guard at company-create time is wired into `companies.py::create_company`.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.db import get_db
from app.db.models import BlockedCompany, User, UserRole
from app.schemas.blocked_company import BlockedCompanyCreate, BlockedCompanyOut
from app.schemas.pagination import Page, PaginationParams
from app.services.business_registry import (
    BusinessRegistryError,
    BusinessRegistryRegistry,
    get_business_registry,
)

router = APIRouter(prefix="/admin/blocked-companies", tags=["admin:blocked-companies"])


@router.get("", response_model=Page[BlockedCompanyOut])
async def list_blocked_companies(
    pagination: PaginationParams = Depends(),
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> Page[BlockedCompanyOut]:
    base = select(BlockedCompany).where(BlockedCompany.organization_id == user.organization_id)
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    items_stmt = (
        base.order_by(BlockedCompany.created_at.desc())
        .limit(pagination.limit)
        .offset(pagination.offset)
    )
    items = (await session.execute(items_stmt)).scalars().all()
    return Page[BlockedCompanyOut](
        items=[BlockedCompanyOut.model_validate(b) for b in items],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.post("", response_model=BlockedCompanyOut, status_code=status.HTTP_201_CREATED)
async def create_blocked_company(
    payload: BlockedCompanyCreate,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
    registry: BusinessRegistryRegistry = Depends(get_business_registry),
) -> BlockedCompany:
    # Try to resolve a friendly name from ARES so the admin list shows
    # something readable. Network failure / 404 is non-fatal — the row
    # still goes in with ares_name=None.
    ares_name: str | None = None
    try:
        service = registry.resolve("CZ")
        result = await service.lookup("CZ", payload.ico)
        if result is not None:
            ares_name = result.name
    except (BusinessRegistryError, ValueError):
        ares_name = None

    row = BlockedCompany(
        organization_id=user.organization_id,
        ico=payload.ico,
        reason_category=payload.reason_category,
        note=payload.note,
        ares_name=ares_name,
        created_by=user.id,
    )
    session.add(row)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This IČO is already on your blocked list.",
        ) from exc
    await session.refresh(row)
    return row


@router.delete("/{blocked_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_blocked_company(
    blocked_id: uuid.UUID,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> None:
    stmt = select(BlockedCompany).where(
        BlockedCompany.id == blocked_id,
        BlockedCompany.organization_id == user.organization_id,
    )
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await session.delete(row)
    await session.commit()
