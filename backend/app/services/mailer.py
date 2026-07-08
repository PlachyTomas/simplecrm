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
from typing import Any

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
        await session.execute(select(UserSmtpSettings).where(UserSmtpSettings.user_id == user.id))
    ).scalar_one_or_none()
    if row is None or row.verified_at is None:
        raise SmtpNotVerifiedError()

    config = smtp_config_for(row)

    thread_id = reply_parent.thread_id if reply_parent else uuid.uuid4()
    in_reply_to = reply_parent.message_id if reply_parent else None
    message_id = _message_id(row.from_email)

    company_id = deal.company_id if deal else (company.id if company else None)

    # RFC 5322 References: the full chain of Message-IDs already in this thread,
    # oldest first, so the recipient's client threads the follow-up correctly.
    # A parent's single Message-ID alone loses the ancestry on the 2nd+ reply.
    references = in_reply_to
    if reply_parent is not None:
        prior_ids = (
            (
                await session.execute(
                    select(SentEmail.message_id)
                    .where(
                        SentEmail.organization_id == user.organization_id,
                        SentEmail.thread_id == thread_id,
                    )
                    .order_by(SentEmail.created_at.asc())
                )
            )
            .scalars()
            .all()
        )
        chain = [mid for mid in prior_ids if mid]
        if in_reply_to and in_reply_to not in chain:
            chain.append(in_reply_to)
        references = " ".join(chain) if chain else in_reply_to

    message = Email(
        to=", ".join(str(addr) for addr in payload.to),
        subject=payload.subject,
        body=payload.body,
        cc=tuple(str(a) for a in payload.cc),
        bcc=tuple(str(a) for a in payload.bcc),
        message_id=message_id,
        in_reply_to=in_reply_to,
        references=references,
        attachments=tuple(attachments),
    )

    status = SentEmailStatus.sent
    error: str | None = None
    sent_at: datetime | None = datetime.now(tz=UTC)
    unexpected: Exception | None = None
    try:
        await send_email_via(message, config)
    except (smtplib.SMTPException, OSError, ssl.SSLError) as exc:
        # Expected transport failures: record a `failed` row and return it so
        # the composer can surface "odeslání selhalo" (AC-3.4). No re-raise.
        status = SentEmailStatus.failed
        error = str(exc)[:500]
        sent_at = None
    except Exception as exc:
        # Any build/encode error still needs an audit row.
        # MIME/encoding or other unexpected errors must not vanish as a bare
        # 500 with no trace: persist a `failed` row, then re-raise below (after
        # the commit) so genuine bugs still surface instead of being masked.
        status = SentEmailStatus.failed
        error = (str(exc) or type(exc).__name__)[:500]
        sent_at = None
        unexpected = exc

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
        email_payload: dict[str, Any] = {"subject": payload.subject}
        if deal is not None:
            entity_type, entity_id = ActivityEntityType.deal, deal.id
            email_payload["deal_name"] = deal.name
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
            payload=email_payload,
        )

    await session.commit()
    await session.refresh(sent)
    # An unexpected build/send error was captured as a failed row above; surface
    # it now that the audit row is durably committed.
    if unexpected is not None:
        raise unexpected
    return sent
