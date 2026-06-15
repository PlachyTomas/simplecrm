"""Endpoints for bulk email campaigns (`/api/v1/companies/bulk-email`)."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user
from app.db import get_db
from app.db.models import EmailCampaign, User, UserRole
from app.schemas.bulk_email import (
    BulkEmailFilters,
    BulkEmailSendIn,
    CampaignDetailOut,
    CampaignOut,
    RecipientCandidate,
)
from app.schemas.pagination import Page, PaginationParams
from app.services.bulk_email import (
    BulkAttachment,
    BulkEmailError,
    resolve_recipients,
    send_campaign,
)

router = APIRouter(prefix="/companies/bulk-email", tags=["bulk-email"])

# Allowlisted attachment types + a 10 MB cap. Keeps a stray huge upload from
# being buffered into memory and a campaign from carrying executables.
_ALLOWED_ATTACHMENT_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/gif",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
}
_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024


@router.post("/recipients", response_model=list[RecipientCandidate])
async def list_recipients(
    filters: BulkEmailFilters,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> list[RecipientCandidate]:
    return await resolve_recipients(session, user, filters)


@router.post("/send", response_model=CampaignOut)
async def send(
    payload: Annotated[str, Form(...)],
    attachment: Annotated[UploadFile | None, File()] = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> CampaignOut:
    try:
        data = BulkEmailSendIn.model_validate_json(payload)
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.errors()
        ) from exc

    att: BulkAttachment | None = None
    if attachment is not None:
        content = await attachment.read()
        if len(content) > _MAX_ATTACHMENT_BYTES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Příloha je příliš velká (max 10 MB).",
            )
        if attachment.content_type not in _ALLOWED_ATTACHMENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Nepodporovaný typ přílohy: {attachment.content_type}",
            )
        att = BulkAttachment(
            filename=attachment.filename or "priloha",
            content_type=attachment.content_type,
            content=content,
        )

    try:
        campaign = await send_campaign(session, user, data, att)
    except BulkEmailError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    return CampaignOut.model_validate(campaign)


def _campaign_scope(
    stmt: Select[tuple[EmailCampaign]], user: User
) -> Select[tuple[EmailCampaign]]:
    """Scope campaigns: everyone sees their org; salespeople see only their
    own sends, managers/admins see the whole org's history."""
    stmt = stmt.where(EmailCampaign.organization_id == user.organization_id)
    if user.role is UserRole.salesperson:
        stmt = stmt.where(EmailCampaign.created_by_user_id == user.id)
    return stmt


@router.get("/campaigns", response_model=Page[CampaignOut])
async def list_campaigns(
    pagination: PaginationParams = Depends(),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Page[CampaignOut]:
    base = _campaign_scope(select(EmailCampaign), user)
    total = (
        await session.execute(select(func.count()).select_from(base.subquery()))
    ).scalar_one()
    items = list(
        (
            await session.execute(
                base.order_by(EmailCampaign.created_at.desc())
                .limit(pagination.limit)
                .offset(pagination.offset)
            )
        )
        .scalars()
        .all()
    )
    return Page[CampaignOut](
        items=[CampaignOut.model_validate(c) for c in items],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.get("/campaigns/{campaign_id}", response_model=CampaignDetailOut)
async def get_campaign(
    campaign_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> CampaignDetailOut:
    stmt = _campaign_scope(
        select(EmailCampaign).where(EmailCampaign.id == campaign_id), user
    ).options(selectinload(EmailCampaign.recipients))
    campaign = (await session.execute(stmt)).scalar_one_or_none()
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Kampaň nebyla nalezena."
        )
    return CampaignDetailOut.model_validate(campaign)
