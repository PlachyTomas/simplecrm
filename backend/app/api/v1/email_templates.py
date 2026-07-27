"""Org-shared email templates (`/api/v1/email-templates`).

Reading is open to every member — a salesperson has to be able to pick a
template when composing. Writing (create/update/delete) is admin-or-manager,
the same gate org-shared pipeline config uses: `require_role(UserRole.manager)`
(admins bypass every role check by construction).

Everything is scoped to the caller's organization, and a row belonging to
another org answers 404, never 403 — the house rule everywhere else: don't
confirm that an id exists outside your tenant.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db import get_db
from app.db.models import EmailTemplate, User, UserRole
from app.schemas.email_template import EmailTemplateIn, EmailTemplateOut, MergeFieldsOut
from app.services.merge_fields import DEAL_MERGE_FIELD_KEYS, MERGE_FIELD_KEYS

router = APIRouter(prefix="/email-templates", tags=["email-templates"])

_DUPLICATE_NAME = "Šablona s tímto názvem už existuje."


async def _get_owned(session: AsyncSession, user: User, template_id: uuid.UUID) -> EmailTemplate:
    row = (
        await session.execute(
            select(EmailTemplate).where(
                EmailTemplate.id == template_id,
                EmailTemplate.organization_id == user.organization_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return row


@router.get("", response_model=list[EmailTemplateOut])
async def list_email_templates(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> list[EmailTemplate]:
    """Every template in the caller's org, alphabetically. Not paginated:
    the list is a picker, and an org with hundreds of templates isn't a
    scenario this feature is for."""
    rows = (
        (
            await session.execute(
                select(EmailTemplate)
                .where(EmailTemplate.organization_id == user.organization_id)
                .order_by(EmailTemplate.name)
            )
        )
        .scalars()
        .all()
    )
    return list(rows)


@router.get("/merge-fields", response_model=MergeFieldsOut)
async def list_merge_fields(
    _user: User = Depends(get_current_user),
) -> MergeFieldsOut:
    """The `{token}` vocabulary the template editor may offer."""
    return MergeFieldsOut(keys=list(MERGE_FIELD_KEYS), deal_keys=list(DEAL_MERGE_FIELD_KEYS))


@router.post("", response_model=EmailTemplateOut, status_code=status.HTTP_201_CREATED)
async def create_email_template(
    payload: EmailTemplateIn,
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> EmailTemplate:
    row = EmailTemplate(
        organization_id=user.organization_id,
        created_by_user_id=user.id,
        name=payload.name,
        subject=payload.subject,
        body=payload.body,
    )
    session.add(row)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_DUPLICATE_NAME) from exc
    await session.refresh(row)
    return row


@router.put("/{template_id}", response_model=EmailTemplateOut)
async def update_email_template(
    template_id: uuid.UUID,
    payload: EmailTemplateIn,
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> EmailTemplate:
    row = await _get_owned(session, user, template_id)
    row.name = payload.name
    row.subject = payload.subject
    row.body = payload.body
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_DUPLICATE_NAME) from exc
    await session.refresh(row)
    return row


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_email_template(
    template_id: uuid.UUID,
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> None:
    row = await _get_owned(session, user, template_id)
    await session.delete(row)
    await session.commit()
