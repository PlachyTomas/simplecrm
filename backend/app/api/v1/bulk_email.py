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
from app.db.models import EmailCampaign, EmailCampaignRecipient, User, UserRole
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
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=exc.errors()
        ) from exc

    att: BulkAttachment | None = None
    if attachment is not None:
        content = await attachment.read()
        if len(content) > _MAX_ATTACHMENT_BYTES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Příloha je příliš velká (max 10 MB).",
            )
        if attachment.content_type not in _ALLOWED_ATTACHMENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
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
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    return CampaignOut.model_validate(campaign)


async def _tracking_totals(
    session: AsyncSession, campaign_ids: list[uuid.UUID]
) -> dict[uuid.UUID, tuple[int, int]]:
    """(opened, clicked) recipient counts per campaign, in one grouped query.

    Treat these as indicative, not authoritative (security-delta review R1
    P3): the open pixel is fetched by anyone who holds the tracking token —
    the recipient, their mail client's prefetcher, a corporate scanner — so
    counts can be inflated and image-blocking clients never register at all.
    That is inherent to pixel tracking, not a defect to fix here.

    Kept out of the campaign row itself: opens trickle in for weeks after a
    send, and a denormalized counter would have to be maintained from the
    public (unauthenticated) tracking endpoints.
    """
    if not campaign_ids:
        return {}
    rows = await session.execute(
        select(
            EmailCampaignRecipient.campaign_id,
            func.count().filter(EmailCampaignRecipient.opened_at.is_not(None)),
            func.count().filter(EmailCampaignRecipient.clicked_at.is_not(None)),
        )
        .where(EmailCampaignRecipient.campaign_id.in_(campaign_ids))
        .group_by(EmailCampaignRecipient.campaign_id)
    )
    return {row[0]: (row[1], row[2]) for row in rows.all()}


def _with_tracking(out: CampaignOut, totals: tuple[int, int]) -> CampaignOut:
    """Fill the aggregate engagement fields; rates are fractions of sent_count."""
    opened, clicked = totals
    out.opened_count = opened
    out.clicked_count = clicked
    if out.sent_count:
        out.open_rate = round(opened / out.sent_count, 4)
        out.click_rate = round(clicked / out.sent_count, 4)
    return out


def _campaign_scope(stmt: Select[tuple[EmailCampaign]], user: User) -> Select[tuple[EmailCampaign]]:
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
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
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
    totals = await _tracking_totals(session, [c.id for c in items])
    return Page[CampaignOut](
        items=[
            _with_tracking(CampaignOut.model_validate(c), totals.get(c.id, (0, 0))) for c in items
        ],
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kampaň nebyla nalezena.")
    detail = CampaignDetailOut.model_validate(campaign)
    opened = sum(1 for r in campaign.recipients if r.opened_at is not None)
    clicked = sum(1 for r in campaign.recipients if r.clicked_at is not None)
    _with_tracking(detail, (opened, clicked))
    return detail
