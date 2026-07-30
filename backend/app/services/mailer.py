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

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.user_smtp import smtp_config_for
from app.core.i18n import language_for_locale
from app.db.models import (
    ActivityEntityType,
    ActivityType,
    Company,
    Contact,
    Deal,
    Organization,
    SentEmail,
    SentEmailStatus,
    User,
    UserSmtpSettings,
)
from app.schemas.sent_email import SentEmailCreate
from app.services.activity_log import record_activity
from app.services.email import Email, EmailAttachment, send_email_via
from app.services.email_tracking import build_tracked_html, new_tracking_token
from app.services.merge_fields import (
    MergeContext,
    apply_merge_fields,
    apply_signature,
    render_message,
)


class SmtpNotVerifiedError(Exception):
    """Raised when the caller has no verified per-user SMTP configured."""


def _message_id(from_email: str) -> str:
    domain = from_email.rpartition("@")[2] or "simplecrm.cz"
    return f"<{uuid.uuid4().hex}@{domain}>"


async def _merge_context(
    session: AsyncSession,
    *,
    user: User,
    smtp_row: UserSmtpSettings,
    payload: SentEmailCreate,
    deal: Deal | None,
    company: Company | None,
) -> MergeContext:
    """Resolve the merge vocabulary for this one send.

    The contact is looked up from the first `To:` address inside the caller's
    org — the composer addresses people, not contact IDs, so that's the only
    handle we have. No match just leaves `{kontakt}` empty.
    """
    target_company = company
    if target_company is None and deal is not None and deal.company_id is not None:
        target_company = await session.get(Company, deal.company_id)

    contact: Contact | None = None
    if payload.to:
        contact = (
            await session.execute(
                select(Contact)
                .where(
                    Contact.organization_id == user.organization_id,
                    func.lower(Contact.email) == str(payload.to[0]).lower(),
                )
                .limit(1)
            )
        ).scalar_one_or_none()

    org = await session.get(Organization, user.organization_id) if user.organization_id else None
    contact_full_name = (
        " ".join(part for part in (contact.first_name, contact.last_name) if part)
        if contact is not None
        else ""
    )
    return MergeContext(
        company_name=target_company.name if target_company is not None else "",
        contact_name=contact_full_name,
        contact_first_name=contact.first_name if contact is not None else "",
        sender_name=user.name,
        sender_email=smtp_row.from_email,
        deal_name=deal.name if deal is not None else "",
        deal_value=deal.value if deal is not None else None,
        currency=(deal.currency if deal is not None else None)
        or (org.currency if org is not None else "CZK"),
        language=language_for_locale(org.locale if org is not None else None),
    )


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

    # Merge fields + signature resolve before anything else touches the text,
    # so tracking rewrites the *final* body and the recorded `SentEmail.body`
    # is what the recipient actually received.
    context = await _merge_context(
        session, user=user, smtp_row=row, payload=payload, deal=deal, company=company
    )
    subject, body = render_message(payload.subject, payload.body, context)
    if payload.append_signature:
        body = apply_signature(body, apply_merge_fields(row.signature or "", context))

    # Tracking is opt-out per send *and* per organization; the org switch wins
    # (EU/ePrivacy). Without a token the mail stays exactly as it was before
    # tracking existed: plain text only, original URLs, no pixel.
    org = await session.get(Organization, user.organization_id) if user.organization_id else None
    tracking_allowed = org is None or org.email_tracking_enabled
    tracking_token = new_tracking_token() if (payload.track and tracking_allowed) else None
    html_body = build_tracked_html(body, tracking_token) if tracking_token else None

    message = Email(
        to=", ".join(str(addr) for addr in payload.to),
        subject=subject,
        body=body,
        html_body=html_body,
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
        # Explicit id: the activity payload below links to this row, and the
        # column default only fires at flush — after the payload is built.
        id=uuid.uuid4(),
        organization_id=user.organization_id,
        sender_user_id=user.id,
        deal_id=deal.id if deal else None,
        company_id=company_id,
        to_emails=[str(a) for a in payload.to],
        cc_emails=[str(a) for a in payload.cc],
        bcc_emails=[str(a) for a in payload.bcc],
        # The rendered text, not the template — history should show what the
        # recipient got, signature and merged fields included.
        subject=subject,
        body=body,
        attachment_filenames=[a.filename for a in attachments],
        status=status,
        error=error,
        message_id=message_id,
        in_reply_to_message_id=in_reply_to,
        thread_id=thread_id,
        sent_at=sent_at,
        tracking_token=tracking_token,
    )
    session.add(sent)

    if status is SentEmailStatus.sent and company_id is not None:
        # `email_id` lets the timeline link the activity row to the stored
        # mail (the Mail page's detail view). Rows logged before it existed
        # simply render unlinked.
        email_payload: dict[str, Any] = {"subject": subject, "email_id": str(sent.id)}
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
