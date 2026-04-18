"""Endpoints for the companies resource."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.core.scoping import can_write_row, scope_by_owner
from app.db import get_db
from app.db.models import Company, User, UserRole
from app.schemas.company import CompanyCreate, CompanyOut, CompanyUpdate
from app.schemas.pagination import Page, PaginationParams

router = APIRouter(prefix="/companies", tags=["companies"])


async def _get_scoped(session: AsyncSession, user: User, company_id: uuid.UUID) -> Company:
    base = select(Company).where(
        Company.organization_id == user.organization_id,
        Company.id == company_id,
    )
    scoped = await scope_by_owner(base, session=session, user=user, owner_col=Company.owner_user_id)
    company: Company | None = (await session.execute(scoped)).scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    return company


@router.get("", response_model=Page[CompanyOut])
async def list_companies(
    pagination: PaginationParams = Depends(),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Page[CompanyOut]:
    base = select(Company).where(Company.organization_id == user.organization_id)
    scoped = await scope_by_owner(base, session=session, user=user, owner_col=Company.owner_user_id)
    count_stmt = select(func.count()).select_from(scoped.subquery())
    total = (await session.execute(count_stmt)).scalar_one()

    items_stmt = scoped.order_by(Company.name).limit(pagination.limit).offset(pagination.offset)
    items = (await session.execute(items_stmt)).scalars().all()
    return Page[CompanyOut](
        items=[CompanyOut.model_validate(c) for c in items],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.get("/{company_id}", response_model=CompanyOut)
async def get_company(
    company_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Company:
    return await _get_scoped(session, user, company_id)


@router.post("", response_model=CompanyOut, status_code=status.HTTP_201_CREATED)
async def create_company(
    payload: CompanyCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Company:
    owner_id = payload.owner_user_id
    # Salespeople can only create rows owned by themselves (or unowned).
    if user.role is UserRole.salesperson and owner_id is not None and owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Salesperson can assign ownership only to themselves",
        )
    if owner_id is not None and not await can_write_row(session, user, owner_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot assign ownership outside your visibility scope",
        )

    company = Company(
        organization_id=user.organization_id,
        owner_user_id=owner_id,
        **payload.model_dump(exclude={"owner_user_id"}, exclude_unset=True),
    )
    session.add(company)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Company with this IČO already exists in your organization",
        ) from exc
    await session.refresh(company)
    return company


@router.put("/{company_id}", response_model=CompanyOut)
async def update_company(
    company_id: uuid.UUID,
    payload: CompanyUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Company:
    company = await _get_scoped(session, user, company_id)
    if not await can_write_row(session, user, company.owner_user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot edit companies outside your visibility scope",
        )
    updates = payload.model_dump(exclude_unset=True)
    new_owner = updates.get("owner_user_id", company.owner_user_id)
    if new_owner != company.owner_user_id and not await can_write_row(session, user, new_owner):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot reassign ownership outside your scope",
        )
    for field, value in updates.items():
        setattr(company, field, value)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Company with this IČO already exists in your organization",
        ) from exc
    await session.refresh(company)
    return company


@router.delete("/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company(
    company_id: uuid.UUID,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> None:
    company = await _get_scoped(session, user, company_id)
    await session.delete(company)
    await session.commit()
