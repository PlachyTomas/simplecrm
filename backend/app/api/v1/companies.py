"""Endpoints for the companies resource."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, nulls_last, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.core.scoping import can_write_row, scope_by_owner
from app.db import get_db
from app.db.models import Company, User, UserRole
from app.schemas.company import CompanyCreate, CompanyOut, CompanyUpdate
from app.schemas.pagination import Page, PaginationParams
from app.schemas.registry import RegistryLookupResult
from app.services.business_registry import (
    BusinessRegistryError,
    BusinessRegistryRegistry,
    get_business_registry,
)
from app.services.freeing import free_single_company, reassign_company
from app.services.lookup_cache import RateLimiter, TtlCache


class CompanyReassign(BaseModel):
    new_owner_user_id: uuid.UUID


router = APIRouter(prefix="/companies", tags=["companies"])

# Module-level process-local cache + rate limiter. Swap for Redis once we
# scale past a single API process.
_registry_cache: TtlCache[RegistryLookupResult] = TtlCache()
_registry_rate_limiter = RateLimiter()


def get_registry_cache() -> TtlCache[RegistryLookupResult]:
    return _registry_cache


def get_registry_rate_limiter() -> RateLimiter:
    return _registry_rate_limiter


async def _assert_owner_cap(
    session: AsyncSession,
    new_owner_id: uuid.UUID | None,
    *,
    excluding_company_id: uuid.UUID | None = None,
) -> None:
    """Reject the assignment if `new_owner_id` is already at their cap.

    NULL `new_owner_id` (back to the pool) is always allowed.
    `excluding_company_id` is the row being reassigned — its current
    ownership doesn't count toward the new owner's tally because the
    very next commit moves it.
    """
    if new_owner_id is None:
        return
    target = await session.get(User, new_owner_id)
    if target is None or target.max_owned_companies is None:
        return
    count_stmt = select(func.count()).select_from(Company).where(
        Company.owner_user_id == new_owner_id,
    )
    if excluding_company_id is not None:
        count_stmt = count_stmt.where(Company.id != excluding_company_id)
    current = (await session.execute(count_stmt)).scalar_one()
    if current >= target.max_owned_companies:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Salesperson is at their company cap "
                f"({target.max_owned_companies}); free or reassign one first."
            ),
        )


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


_SORT_COLUMNS = {
    "name": Company.name,
    "ownership_expires_at": Company.ownership_expires_at,
    "last_order_at": Company.last_order_at,
    # "Activity" doesn't have its own column yet — the closest proxy is the
    # row's `updated_at`, which moves on any edit / freeing / reassign.
    "last_activity_at": Company.updated_at,
    "created_at": Company.created_at,
}


@router.get("", response_model=Page[CompanyOut])
async def list_companies(
    pagination: PaginationParams = Depends(),
    search: str | None = Query(
        default=None,
        max_length=120,
        description="Case-insensitive partial match on name or IČO.",
    ),
    sort: str = Query(
        default="name",
        description=(
            "Sort key. One of: name, ownership_expires_at, last_order_at, "
            "last_activity_at, created_at."
        ),
    ),
    order: str = Query(default="asc", pattern="^(asc|desc)$"),
    ownership: str | None = Query(
        default=None,
        description=(
            "Ownership filter: 'mine' (only my own), "
            "'mine_and_unowned' (mine + pool), or 'unowned' (pool only)."
        ),
        pattern="^(mine|mine_and_unowned|unowned)$",
    ),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Page[CompanyOut]:
    if sort not in _SORT_COLUMNS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown sort key: {sort}",
        )

    base = select(Company).where(Company.organization_id == user.organization_id)
    if search:
        pattern = f"%{search.strip()}%"
        base = base.where(Company.name.ilike(pattern) | Company.ico.ilike(pattern))

    if ownership == "mine":
        base = base.where(Company.owner_user_id == user.id)
    elif ownership == "mine_and_unowned":
        base = base.where(
            (Company.owner_user_id == user.id) | (Company.owner_user_id.is_(None))
        )
    elif ownership == "unowned":
        base = base.where(Company.owner_user_id.is_(None))

    scoped = await scope_by_owner(base, session=session, user=user, owner_col=Company.owner_user_id)
    count_stmt = select(func.count()).select_from(scoped.subquery())
    total = (await session.execute(count_stmt)).scalar_one()

    sort_col = _SORT_COLUMNS[sort]
    # The sortable timestamp columns can be NULL (no orders yet, etc.) —
    # always push nulls to the bottom so the salesperson sees real data
    # at the top regardless of asc/desc.
    sort_expr = sort_col.asc() if order == "asc" else sort_col.desc()
    if sort != "name":
        sort_expr = nulls_last(sort_expr)
    # Stable tiebreaker on name keeps pagination deterministic.
    items_stmt = (
        scoped.order_by(sort_expr, Company.name).limit(pagination.limit).offset(pagination.offset)
    )
    items = (await session.execute(items_stmt)).scalars().all()
    return Page[CompanyOut](
        items=[CompanyOut.model_validate(c) for c in items],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.get("/lookup-registry", response_model=RegistryLookupResult)
async def lookup_registry(
    country: str = Query(min_length=2, max_length=2, description="ISO-ish country code"),
    number: str = Query(min_length=1, max_length=32, description="Registration number (e.g. IČO)"),
    user: User = Depends(get_current_user),
    registry: BusinessRegistryRegistry = Depends(get_business_registry),
    cache: TtlCache[RegistryLookupResult] = Depends(get_registry_cache),
    rate_limiter: RateLimiter = Depends(get_registry_rate_limiter),
) -> RegistryLookupResult:
    if not await rate_limiter.try_acquire(user.id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many registry lookups — slow down a moment.",
        )

    key = (country.upper(), number)
    cached = await cache.get(key)
    if cached is not None:
        return cached

    try:
        service = registry.resolve(country)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    try:
        registry_data = await service.lookup(country, number)
    except ValueError as exc:
        # Malformed registration number (e.g. wrong length / non-digit ICO).
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except BusinessRegistryError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Business registry is unavailable, please try again in a minute.",
        ) from exc

    if registry_data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No company found in the {country.upper()} registry for {number}.",
        )

    result = RegistryLookupResult.model_validate(registry_data)
    await cache.set(key, result)
    return result


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
    await _assert_owner_cap(session, owner_id)

    # Compute the ownership-release window from the org's setting. Falls
    # back to the model's column default (365) when the org row is missing
    # — only ever the case for legacy fixtures the test layer seeds
    # directly.
    from datetime import UTC
    from datetime import datetime as _dt
    from datetime import timedelta as _td

    window_days = user.organization.ownership_window_days if user.organization else 365
    company = Company(
        organization_id=user.organization_id,
        owner_user_id=owner_id,
        ownership_expires_at=_dt.now(tz=UTC) + _td(days=window_days),
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
    if new_owner != company.owner_user_id:
        await _assert_owner_cap(session, new_owner, excluding_company_id=company.id)
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


@router.post("/{company_id}/free", response_model=CompanyOut)
async def free_company(
    company_id: uuid.UUID,
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> Company:
    """Admin/manager-initiated release into the shared pool."""
    company = await _get_scoped(session, user, company_id)
    await free_single_company(session, company=company, released_by=user.id)
    await session.refresh(company)
    return company


@router.post("/{company_id}/reassign", response_model=CompanyOut)
async def reassign_company_endpoint(
    company_id: uuid.UUID,
    payload: CompanyReassign,
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> Company:
    """Transfer a company to a specific new owner (admin or manager)."""
    company = await _get_scoped(session, user, company_id)
    # New owner must be in the caller's org.
    target_stmt = select(User.id).where(
        User.organization_id == user.organization_id,
        User.id == payload.new_owner_user_id,
    )
    if (await session.execute(target_stmt)).scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="new_owner_user_id does not exist in your organization",
        )
    await _assert_owner_cap(
        session, payload.new_owner_user_id, excluding_company_id=company.id
    )
    await reassign_company(
        session,
        company=company,
        new_owner_id=payload.new_owner_user_id,
        released_by=user.id,
    )
    await session.refresh(company)
    return company
