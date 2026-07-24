"""Endpoints for the contacts resource.

Contacts have no `owner_user_id`; they are purely org-scoped. Any member of
the organization can see / edit any contact. Deletion is allowed for admins
and for the owner of the company the contact is linked to; a company-less
contact can only be deleted by an admin.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db import get_db
from app.db.models import Company, Contact, Deal, Stage, StageType, User, UserRole
from app.schemas.contact import ContactCreate, ContactOut, ContactUpdate
from app.schemas.pagination import Page, PaginationParams

router = APIRouter(prefix="/contacts", tags=["contacts"])


async def _company_names(session: AsyncSession, contacts: list[Contact]) -> dict[uuid.UUID, str]:
    """Resolve `company_id -> Company.name` for a page of contacts in one query.

    Contacts with a NULL `company_id` contribute nothing; the returned map only
    holds ids that resolved to a real company.
    """
    company_ids = {c.company_id for c in contacts if c.company_id is not None}
    if not company_ids:
        return {}
    rows = (
        await session.execute(select(Company.id, Company.name).where(Company.id.in_(company_ids)))
    ).all()
    return {row.id: row.name for row in rows}


async def _company_name_for(session: AsyncSession, company_id: uuid.UUID | None) -> str | None:
    if company_id is None:
        return None
    return (
        await session.execute(select(Company.name).where(Company.id == company_id))
    ).scalar_one_or_none()


def _to_out(contact: Contact, company_name: str | None) -> ContactOut:
    out = ContactOut.model_validate(contact)
    out.company_name = company_name
    return out


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
    has_open_deals: bool | None = Query(
        default=None,
        description=(
            "When true, keep only contacts whose linked company has at least one "
            "deal in an open-type stage. Contacts with no company are excluded. "
            "False/omitted applies no filter."
        ),
    ),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Page[ContactOut]:
    base = select(Contact).where(Contact.organization_id == user.organization_id)
    if company_id is not None:
        base = base.where(Contact.company_id == company_id)
    if has_open_deals:
        # An "open deal" is one still in play: an open-type stage AND not yet
        # closed. Lost deals live in an open-type stage with closed_at set (see
        # pipelines.py / deals.py), so closed_at IS NULL is required to exclude
        # them — matching the pipeline board's own visibility rule.
        open_deal_exists = (
            select(Deal.id)
            .join(Stage, Deal.stage_id == Stage.id)
            .where(
                Deal.company_id == Contact.company_id,
                Stage.stage_type == StageType.open,
                Deal.closed_at.is_(None),
            )
            .exists()
        )
        base = base.where(Contact.company_id.is_not(None), open_deal_exists)
    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await session.execute(count_stmt)).scalar_one()

    items_stmt = (
        base.order_by(Contact.last_name, Contact.first_name)
        .limit(pagination.limit)
        .offset(pagination.offset)
    )
    items = list((await session.execute(items_stmt)).scalars().all())
    names = await _company_names(session, items)
    return Page[ContactOut](
        items=[_to_out(c, names.get(c.company_id) if c.company_id else None) for c in items],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.get("/{contact_id}", response_model=ContactOut)
async def get_contact(
    contact_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ContactOut:
    contact = await _get_scoped(session, user, contact_id)
    return _to_out(contact, await _company_name_for(session, contact.company_id))


@router.post("", response_model=ContactOut, status_code=status.HTTP_201_CREATED)
async def create_contact(
    payload: ContactCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ContactOut:
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
    return _to_out(contact, await _company_name_for(session, contact.company_id))


@router.put("/{contact_id}", response_model=ContactOut)
async def update_contact(
    contact_id: uuid.UUID,
    payload: ContactUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ContactOut:
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
    return _to_out(contact, await _company_name_for(session, contact.company_id))


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    contact_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> None:
    contact = await _get_scoped(session, user, contact_id)
    # Admins may delete any contact. Otherwise the caller must own the company
    # the contact is linked to — a company-less contact is admin-only.
    if user.role is not UserRole.admin:
        owner_id: uuid.UUID | None = None
        if contact.company_id is not None:
            owner_id = (
                await session.execute(
                    select(Company.owner_user_id).where(Company.id == contact.company_id)
                )
            ).scalar_one_or_none()
        if owner_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Only an admin or the owner of the contact's company can delete this contact."
                ),
            )
    await session.delete(contact)
    await session.commit()
