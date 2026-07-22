"""Single-email send + history (`/api/v1/emails`).

A minimal send-only mail client: compose/send from the user's verified SMTP,
list per-deal / per-company sent history, and follow up on a previously sent
mail. No inbox — inbound replies are never captured.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.bulk_email import _ALLOWED_ATTACHMENT_TYPES, _MAX_ATTACHMENT_BYTES
from app.core.deps import get_current_user
from app.core.scoping import scope_by_owner
from app.db import get_db
from app.db.models import Company, Deal, SentEmail, User, UserRole
from app.schemas.pagination import Page, PaginationParams
from app.schemas.sent_email import SentEmailCreate, SentEmailDetail, SentEmailOut
from app.services.email import EmailAttachment
from app.services.mailer import SmtpNotVerifiedError, send_user_email

router = APIRouter(prefix="/emails", tags=["emails"])


async def _visible_deal(session: AsyncSession, user: User, deal_id: uuid.UUID) -> Deal:
    base = select(Deal).where(Deal.organization_id == user.organization_id, Deal.id == deal_id)
    scoped = await scope_by_owner(base, session=session, user=user, owner_col=Deal.owner_user_id)
    deal: Deal | None = (await session.execute(scoped)).scalar_one_or_none()
    if deal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    return deal


async def _visible_company(session: AsyncSession, user: User, company_id: uuid.UUID) -> Company:
    base = select(Company).where(
        Company.organization_id == user.organization_id, Company.id == company_id
    )
    scoped = await scope_by_owner(base, session=session, user=user, owner_col=Company.owner_user_id)
    company: Company | None = (await session.execute(scoped)).scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    return company


def _scope_history(stmt, user: User):  # type: ignore[no-untyped-def]
    """Org-scope sent history; salespeople see only their own sends."""
    stmt = stmt.where(SentEmail.organization_id == user.organization_id)
    if user.role is UserRole.salesperson:
        stmt = stmt.where(SentEmail.sender_user_id == user.id)
    return stmt


@router.post("", response_model=SentEmailOut, status_code=status.HTTP_201_CREATED)
async def send_email_endpoint(
    payload: Annotated[str, Form(...)],
    attachments: Annotated[list[UploadFile] | None, File()] = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SentEmail:
    try:
        data = SentEmailCreate.model_validate_json(payload)
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=exc.errors()
        ) from exc

    reply_parent: SentEmail | None = None
    if data.reply_to_email_id is not None:
        reply_parent = (
            await session.execute(
                _scope_history(
                    select(SentEmail).where(SentEmail.id == data.reply_to_email_id), user
                )
            )
        ).scalar_one_or_none()
        if reply_parent is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Reply target not found"
            )

    # A reply stays anchored to its parent's deal + company. Derive them from
    # the parent when the client omits them; reject an explicit mismatch so a
    # child can't share a thread_id under a different deal/company.
    if reply_parent is not None:
        if data.deal_id is not None and data.deal_id != reply_parent.deal_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Odpověď musí zůstat u stejného obchodu jako původní e-mail.",
            )
        if data.company_id is not None and data.company_id != reply_parent.company_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Odpověď musí zůstat u stejné firmy jako původní e-mail.",
            )
        target_deal_id = reply_parent.deal_id
        target_company_id = reply_parent.company_id
    else:
        target_deal_id = data.deal_id
        target_company_id = data.company_id

    deal = await _visible_deal(session, user, target_deal_id) if target_deal_id else None
    company = (
        await _visible_company(session, user, target_company_id)
        if target_company_id and deal is None
        else None
    )

    email_attachments: list[EmailAttachment] = []
    for upload in attachments or []:
        content = await upload.read()
        if len(content) > _MAX_ATTACHMENT_BYTES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Příloha je příliš velká (max 10 MB).",
            )
        if upload.content_type not in _ALLOWED_ATTACHMENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Nepodporovaný typ přílohy: {upload.content_type}",
            )
        email_attachments.append(
            EmailAttachment(
                filename=upload.filename or "priloha",
                content_type=upload.content_type or "application/octet-stream",
                content=content,
            )
        )

    try:
        return await send_user_email(
            session,
            user=user,
            payload=data,
            attachments=email_attachments,
            deal=deal,
            company=company,
            reply_parent=reply_parent,
        )
    except SmtpNotVerifiedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "smtp_not_verified",
                "message": "Nejprve nastavte a ověřte SMTP v Nastavení → Integrace.",
            },
        ) from exc


@router.get("", response_model=Page[SentEmailOut])
async def list_emails(
    pagination: PaginationParams = Depends(),
    deal_id: uuid.UUID | None = Query(default=None),
    company_id: uuid.UUID | None = Query(default=None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Page[SentEmailOut]:
    base = _scope_history(select(SentEmail), user)
    if deal_id is not None:
        base = base.where(SentEmail.deal_id == deal_id)
    if company_id is not None:
        base = base.where(SentEmail.company_id == company_id)
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    items = (
        (
            await session.execute(
                base.order_by(SentEmail.created_at.desc())
                .limit(pagination.limit)
                .offset(pagination.offset)
            )
        )
        .scalars()
        .all()
    )
    return Page[SentEmailOut](
        items=[SentEmailOut.model_validate(e) for e in items],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.get("/{email_id}", response_model=SentEmailDetail)
async def get_email(
    email_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SentEmailDetail:
    email = (
        await session.execute(
            _scope_history(select(SentEmail).where(SentEmail.id == email_id), user)
        )
    ).scalar_one_or_none()
    if email is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Email not found")
    thread = (
        (
            await session.execute(
                _scope_history(select(SentEmail), user)
                .where(SentEmail.thread_id == email.thread_id)
                .order_by(SentEmail.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    detail = SentEmailDetail.model_validate(email)
    detail.thread = [SentEmailOut.model_validate(t) for t in thread]
    return detail
