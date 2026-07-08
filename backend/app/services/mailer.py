"""Single-email send service (send-only mail client).

Sends one user-composed email through the sender's own verified SMTP, records
a :class:`SentEmail` row (success or failure), and — on success — logs an
`email_sent` activity on the deal/company so it surfaces on the timeline.

There is no inbox: "replying" composes a follow-up to a mail *we* sent,
inheriting its `thread_id` and linking via In-Reply-To/References.
"""

from __future__ import annotations

import smtplib
import ssl
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.user_smtp import smtp_config_for
from app.db.models import (
    ActivityEntityType,
    ActivityType,
    Company,
    Deal,
    SentEmail,
    SentEmailStatus,
    User,
    UserSmtpSettings,
)
from app.schemas.sent_email import SentEmailCreate
from app.services.activity_log import record_activity
from app.services.email import Email, EmailAttachment, send_email_via


class SmtpNotVerifiedError(Exception):
    """Raised when the caller has no verified per-user SMTP configured."""


def _message_id(from_email: str) -> str:
    domain = from_email.rpartition("@")[2] or "simplecrm.cz"
    return f"<{uuid.uuid4().hex}@{domain}>"


async def send_user_email(
    session: AsyncSession,
    *,
    user: User,
    payload: SentEmailCreate,
    attachments: list[EmailAttachment],
    deal: Deal | None,
    company: Company | None,
    reply_parent: SentEmail | None,
) -> SentEmail:
    """Send one email from ``user``'s verified SMTP and record the outcome.

    Raises :class:`SmtpNotVerifiedError` (→ 409 at the API) when the sender has
    no verified SMTP. A transport failure does NOT raise: it's captured on the
    returned row (``status=failed``, ``error=…``).
    """
    row = (
        await session.execute(
            select(UserSmtpSettings).where(UserSmtpSettings.user_id == user.id)
        )
    ).scalar_one_or_none()
    if row is None or row.verified_at is None:
        raise SmtpNotVerifiedError()

    config = smtp_config_for(row)

    thread_id = reply_parent.thread_id if reply_parent else uuid.uuid4()
    in_reply_to = reply_parent.message_id if reply_parent else None
    message_id = _message_id(row.from_email)

    company_id = deal.company_id if deal else (company.id if company else None)

    message = Email(
        to=", ".join(str(addr) for addr in payload.to),
        subject=payload.subject,
        body=payload.body,
        cc=tuple(str(a) for a in payload.cc),
        bcc=tuple(str(a) for a in payload.bcc),
        message_id=message_id,
        in_reply_to=in_reply_to,
        references=in_reply_to,
        attachments=tuple(attachments),
    )

    status = SentEmailStatus.sent
    error: str | None = None
    sent_at: datetime | None = datetime.now(tz=UTC)
    try:
        await send_email_via(message, config)
    except (smtplib.SMTPException, OSError, ssl.SSLError) as exc:
        status = SentEmailStatus.failed
        error = str(exc)[:500]
        sent_at = None

    sent = SentEmail(
        organization_id=user.organization_id,
        sender_user_id=user.id,
        deal_id=deal.id if deal else None,
        company_id=company_id,
        to_emails=[str(a) for a in payload.to],
        cc_emails=[str(a) for a in payload.cc],
        bcc_emails=[str(a) for a in payload.bcc],
        subject=payload.subject,
        body=payload.body,
        attachment_filenames=[a.filename for a in attachments],
        status=status,
        error=error,
        message_id=message_id,
        in_reply_to_message_id=in_reply_to,
        thread_id=thread_id,
        sent_at=sent_at,
    )
    session.add(sent)

    if status is SentEmailStatus.sent and company_id is not None:
        if deal is not None:
            entity_type, entity_id = ActivityEntityType.deal, deal.id
        else:
            entity_type, entity_id = ActivityEntityType.company, company_id
        record_activity(
            session,
            organization_id=user.organization_id,  # type: ignore[arg-type]
            entity_type=entity_type,
            entity_id=entity_id,
            company_id=company_id,
            user_id=user.id,
            activity_type=ActivityType.email_sent,
            payload={"subject": payload.subject},
        )

    await session.commit()
    await session.refresh(sent)
    return sent
