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
from sqlalchemy import Text, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.bulk_email import _ALLOWED_ATTACHMENT_TYPES, _MAX_ATTACHMENT_BYTES
from app.core.deps import get_current_user
from app.core.scoping import scope_by_owner
from app.db import get_db
from app.db.models import Company, Deal, SentEmail, User, UserRole
from app.db.models.enums import ActivityEntityType, ActivityType, EmailDirection
from app.schemas.pagination import Page, PaginationParams
from app.schemas.sent_email import (
    SentEmailCreate,
    SentEmailDetail,
    SentEmailLink,
    SentEmailListItemOut,
    SentEmailOut,
)
from app.services.activity_log import record_activity
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


def _email_list_item(email: SentEmail) -> SentEmailListItemOut:
    """Fill display names from eager-loaded relations (see `_activity_out`)."""
    out = SentEmailListItemOut.model_validate(email)
    out.company_name = email.company.name if email.company else None
    out.deal_name = email.deal.name if email.deal else None
    out.sender_name = email.sender.name if email.sender else None
    return out


@router.get("", response_model=Page[SentEmailListItemOut])
async def list_emails(
    pagination: PaginationParams = Depends(),
    deal_id: uuid.UUID | None = Query(default=None),
    company_id: uuid.UUID | None = Query(default=None),
    search: str | None = Query(
        default=None,
        max_length=120,
        description="Case-insensitive substring over subject, body and addresses.",
    ),
    direction: EmailDirection | None = Query(default=None),
    unmatched: bool = Query(
        default=False, description="Only mail linked to no company AND no deal."
    ),
    mine: bool = Query(
        default=False,
        description=(
            "Only mail this user sent or captured. No-op for salespeople, "
            "whose history is already scoped to their own sends."
        ),
    ),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Page[SentEmailListItemOut]:
    base = _scope_history(select(SentEmail), user)
    if deal_id is not None:
        base = base.where(SentEmail.deal_id == deal_id)
    if company_id is not None:
        base = base.where(SentEmail.company_id == company_id)
    if search is not None and search.strip():
        term = f"%{search.strip()}%"
        # Recipient arrays are JSONB; matching their text rendering is crude
        # but fine for a substring search over e-mail addresses.
        base = base.where(
            or_(
                SentEmail.subject.ilike(term),
                SentEmail.body.ilike(term),
                SentEmail.from_email.ilike(term),
                cast(SentEmail.to_emails, Text).ilike(term),
                cast(SentEmail.cc_emails, Text).ilike(term),
            )
        )
    if direction is not None:
        base = base.where(SentEmail.direction == direction)
    if unmatched:
        base = base.where(SentEmail.company_id.is_(None), SentEmail.deal_id.is_(None))
    if mine:
        base = base.where(SentEmail.sender_user_id == user.id)
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    items = (
        (
            await session.execute(
                # Ordered by the message's own timestamp, falling back to when
                # the row was written. Before Smart BCC the two were minutes
                # apart at worst; a captured mail can be days older than its
                # capture, and the history renders `sent_at`, so sorting on
                # `created_at` would show a timeline out of its own order.
                # `created_at` stays as the tiebreaker to keep paging stable.
                base.options(
                    selectinload(SentEmail.company),
                    selectinload(SentEmail.deal),
                    selectinload(SentEmail.sender),
                )
                .order_by(
                    func.coalesce(SentEmail.sent_at, SentEmail.created_at).desc(),
                    SentEmail.created_at.desc(),
                )
                .limit(pagination.limit)
                .offset(pagination.offset)
            )
        )
        .scalars()
        .all()
    )
    return Page[SentEmailListItemOut](
        items=[_email_list_item(e) for e in items],
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
            _scope_history(select(SentEmail).where(SentEmail.id == email_id), user).options(
                selectinload(SentEmail.company),
                selectinload(SentEmail.deal),
                selectinload(SentEmail.sender),
            )
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
    detail = SentEmailDetail.model_validate(_email_list_item(email).model_dump())
    detail.thread = [SentEmailOut.model_validate(t) for t in thread]
    return detail


@router.post("/{email_id}/link", response_model=SentEmailListItemOut)
async def link_email(
    email_id: uuid.UUID,
    payload: SentEmailLink,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SentEmailListItemOut:
    """File an unmatched captured mail under a company (and optionally a deal).

    Smart BCC stores mail whose correspondent matches no contact with no
    company link — it surfaces only under the Mail page's "Nepřiřazené"
    filter. Linking is the missing verb: it sets the company/deal on the
    row AND writes the email activity the ingest pipeline would have
    written on a match, so the mail appears on the timelines from now on.
    Already-filed mail 409s — re-filing would duplicate timeline entries.
    """
    email = (
        await session.execute(
            _scope_history(select(SentEmail).where(SentEmail.id == email_id), user)
        )
    ).scalar_one_or_none()
    if email is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Email not found")
    if email.company_id is not None or email.deal_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already filed under a company or deal.",
        )

    company = await _visible_company(session, user, payload.company_id)
    deal = None
    if payload.deal_id is not None:
        deal = await _visible_deal(session, user, payload.deal_id)
        if deal.company_id != company.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Deal belongs to a different company.",
            )

    email.company_id = company.id
    email.deal_id = deal.id if deal else None

    # Mirror the ingest pipeline's activity (services/inbound_email.py /
    # services/mailer.py): deal-linked mail lands on the deal's timeline,
    # company-only mail on the company's; `email_id` makes the row clickable.
    activity_payload: dict[str, object] = {"subject": email.subject, "email_id": str(email.id)}
    if email.direction is EmailDirection.inbound and email.from_email:
        activity_payload["from"] = email.from_email
    if deal is not None:
        activity_payload["deal_name"] = deal.name
    record_activity(
        session,
        organization_id=email.organization_id,
        entity_type=ActivityEntityType.deal if deal else ActivityEntityType.company,
        entity_id=deal.id if deal else company.id,
        company_id=company.id,
        user_id=user.id,
        activity_type=(
            ActivityType.email_received
            if email.direction is EmailDirection.inbound
            else ActivityType.email_sent
        ),
        payload=activity_payload,
    )
    await session.commit()
    await session.refresh(email, attribute_names=["company", "deal", "sender"])
    return _email_list_item(email)
