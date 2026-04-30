"""Endpoints for the contacts resource.

Contacts have no `owner_user_id`; they are purely org-scoped. Any member of
the organization can see / edit any contact. Deletion is admin-only to
mirror the companies endpoint.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db import get_db
from app.db.models import Company, Contact, User, UserRole
from app.schemas.contact import ContactCreate, ContactOut, ContactUpdate
from app.schemas.pagination import Page, PaginationParams

router = APIRouter(prefix="/contacts", tags=["contacts"])


async def _get_scoped(session: AsyncSession, user: User, contact_id: uuid.UUID) -> Contact:
    stmt = select(Contact).where(
        Contact.organization_id == user.organization_id,
        Contact.id == contact_id,
    )
    contact: Contact | None = (await session.execute(stmt)).scalar_one_or_none()
    if contact is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")
    return contact


async def _validate_company_in_org(
    session: AsyncSession, user: User, company_id: uuid.UUID | None
) -> None:
    if company_id is None:
        return
    stmt = select(Company.id).where(
        Company.organization_id == user.organization_id,
        Company.id == company_id,
    )
    result = (await session.execute(stmt)).scalar_one_or_none()
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="company_id does not exist in your organization",
        )


@router.get("", response_model=Page[ContactOut])
async def list_contacts(
    pagination: PaginationParams = Depends(),
    company_id: uuid.UUID | None = Query(default=None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Page[ContactOut]:
    base = select(Contact).where(Contact.organization_id == user.organization_id)
    if company_id is not None:
        base = base.where(Contact.company_id == company_id)
    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await session.execute(count_stmt)).scalar_one()

    items_stmt = (
        base.order_by(Contact.last_name, Contact.first_name)
        .limit(pagination.limit)
        .offset(pagination.offset)
    )
    items = (await session.execute(items_stmt)).scalars().all()
    return Page[ContactOut](
        items=[ContactOut.model_validate(c) for c in items],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.get("/{contact_id}", response_model=ContactOut)
async def get_contact(
    contact_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Contact:
    return await _get_scoped(session, user, contact_id)


@router.post("", response_model=ContactOut, status_code=status.HTTP_201_CREATED)
async def create_contact(
    payload: ContactCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Contact:
    await _validate_company_in_org(session, user, payload.company_id)
    contact = Contact(
        organization_id=user.organization_id,
        **payload.model_dump(exclude_unset=True),
    )
    session.add(contact)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Contact with this email already exists in your organization",
        ) from exc
    await session.refresh(contact)
    return contact


@router.put("/{contact_id}", response_model=ContactOut)
async def update_contact(
    contact_id: uuid.UUID,
    payload: ContactUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Contact:
    contact = await _get_scoped(session, user, contact_id)
    updates = payload.model_dump(exclude_unset=True)
    if "company_id" in updates:
        await _validate_company_in_org(session, user, updates["company_id"])
    for field, value in updates.items():
        setattr(contact, field, value)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Contact with this email already exists in your organization",
        ) from exc
    await session.refresh(contact)
    return contact


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    contact_id: uuid.UUID,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> None:
    contact = await _get_scoped(session, user, contact_id)
    await session.delete(contact)
    await session.commit()
