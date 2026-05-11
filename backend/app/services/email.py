"""Email notifications.

`send_email` dispatches through stdlib smtplib when the SMTP settings
(`smtp_host` + credentials) are configured; otherwise it logs the
payload — same behavior as before the SMTP integration landed, kept
deliberately so dev/test don't need credentials to pass.

The interface (`build_*_email` + `send_email`) was shaped so the
eventual provider swap is a one-module change. Callers stay unchanged.
"""

from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from dataclasses import dataclass, field
from email.message import EmailMessage
from typing import Literal

from app.core.config import get_settings

logger = logging.getLogger("simplecrm.email")


# Which Zoho send-as identity to use as `From:`. The split lets the
# customer see invoices coming from a billing inbox while system /
# feedback notifications come from the general info inbox — same SMTP
# account, two surfaces.
SenderRole = Literal["invoices", "info"]


@dataclass(frozen=True)
class EmailAttachment:
    """Binary attachment for a transactional email.

    `content_type` is checked at the API boundary; here it's plumbed
    straight onto the MIME part. `filename` is what the recipient sees.
    """

    filename: str
    content_type: str
    content: bytes


@dataclass(frozen=True)
class Email:
    to: str
    subject: str
    body: str
    # Optional Reply-To override. Used by the feedback endpoint so the
    # founder can hit Reply and land on the reporting user's inbox.
    reply_to: str | None = None
    attachments: tuple[EmailAttachment, ...] = field(default_factory=tuple)
    # Picks which Zoho send-as identity supplies the `From:` header.
    # Defaults to "info" since everything except customer-facing
    # invoices should come from info@simplecrm.cz.
    sender_role: SenderRole = "info"


def build_freed_company_email(
    *, owner_email: str, owner_name: str, company_names: list[str]
) -> Email:
    """Compose the "your companies were freed" digest for one owner.

    Kept as a pure function so tests can assert the template without a
    real SMTP transport.
    """
    if not company_names:
        raise ValueError("company_names must not be empty")
    joined = "\n".join(f"• {n}" for n in sorted(company_names))
    subject = (
        f"SimpleCRM: {len(company_names)} firma uvolněna"
        if len(company_names) == 1
        else f"SimpleCRM: {len(company_names)} firem uvolněno"
    )
    body = (
        f"Ahoj {owner_name},\n\n"
        "tyto firmy byly uvolněny zpět do sdíleného poolu, protože u nich "
        "posledních 90 dní neproběhla žádná objednávka:\n\n"
        f"{joined}\n\n"
        "Kdykoli je můžeš znovu převzít v aplikaci SimpleCRM.\n"
    )
    return Email(to=owner_email, subject=subject, body=body)


def build_subscription_pending_email(
    *, org_name: str, plan_display: str, founder_email: str = "podpora@simplecrm.cz"
) -> Email:
    """Founder-facing notification: an org just chose a plan.

    Sent from `BillingService.choose_plan`. The body intentionally tells
    the founder which org+plan to look up so they can match the bank-
    transfer payment when it lands and activate the subscription via the
    super-admin UI.
    """
    subject = f"SimpleCRM: {org_name} si vybral plán {plan_display}"
    body = (
        f"Dobrý den,\n\n"
        f"organizace {org_name} si vybrala plán {plan_display} a čeká "
        "na aktivaci po obdržení platby.\n\n"
        "Po připsání platby aktivujte předplatné v super-admin "
        "rozhraní (/admin → detail organizace → Aktivovat předplatné).\n\n"
        "Detaily najdete v audit logu organizace.\n"
    )
    return Email(to=founder_email, subject=subject, body=body)


def build_verification_email(*, recipient: str, name: str, link: str) -> Email:
    """Compose the verify-your-email message for a new (or linking) user.

    Sent from the email-auth signup and resend flows. Link points at the
    frontend's `/verify-email?token=...` page; valid 24 h.
    """
    subject = "SimpleCRM: ověřte svůj e-mail"
    body = (
        f"Ahoj {name},\n\n"
        "vítejte v SimpleCRM. Pro dokončení registrace prosím potvrďte "
        "svou e-mailovou adresu kliknutím na následující odkaz:\n\n"
        f"{link}\n\n"
        "Odkaz je platný 24 hodin. Pokud jste registraci nezahájili, "
        "tento e-mail prosím ignorujte.\n"
    )
    return Email(to=recipient, subject=subject, body=body)


def build_password_reset_email(*, recipient: str, name: str, link: str) -> Email:
    """Compose the reset-your-password message.

    Sent from the email-auth password-reset flow. Link points at the
    frontend's `/reset-password?token=...` page; valid 1 h.
    """
    subject = "SimpleCRM: obnovení hesla"
    body = (
        f"Ahoj {name},\n\n"
        "obdrželi jsme žádost o obnovení hesla pro váš účet. Nové heslo "
        "můžete nastavit kliknutím na následující odkaz:\n\n"
        f"{link}\n\n"
        "Odkaz je platný 1 hodinu. Pokud jste o reset nežádali, tento "
        "e-mail prosím ignorujte — vaše heslo zůstane beze změny.\n"
    )
    return Email(to=recipient, subject=subject, body=body)


def _build_mime(message: Email, *, sender: str) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = message.to
    msg["Subject"] = message.subject
    if message.reply_to:
        msg["Reply-To"] = message.reply_to
    msg.set_content(message.body)
    for att in message.attachments:
        maintype, _, subtype = att.content_type.partition("/")
        if not maintype or not subtype:
            maintype, subtype = "application", "octet-stream"
        msg.add_attachment(
            att.content,
            maintype=maintype,
            subtype=subtype,
            filename=att.filename,
        )
    return msg


def _resolve_sender(role: SenderRole) -> str:
    """Pick the configured send-as identity for `role`, falling back to
    `smtp_username` when the role-specific override is empty. Returning
    an empty string would land an unsendable message; the fallback keeps
    misconfigured environments at least producing valid envelopes.
    """
    settings = get_settings()
    role_value = settings.smtp_from_invoices if role == "invoices" else settings.smtp_from_info
    return role_value or settings.smtp_username


def _send_via_smtp(message: Email) -> None:
    """Blocking SMTP send. Called via `asyncio.to_thread` so the event
    loop isn't blocked on slow handshakes.
    """
    settings = get_settings()
    sender = _resolve_sender(message.sender_role)
    mime = _build_mime(message, sender=sender)

    context = ssl.create_default_context()
    if settings.smtp_use_ssl:
        with smtplib.SMTP_SSL(
            host=settings.smtp_host,
            port=settings.smtp_port,
            context=context,
            timeout=15,
        ) as client:
            if settings.smtp_username:
                client.login(settings.smtp_username, settings.smtp_password)
            client.send_message(mime)
        return

    with smtplib.SMTP(host=settings.smtp_host, port=settings.smtp_port, timeout=15) as client:
        if settings.smtp_use_starttls:
            client.starttls(context=context)
        if settings.smtp_username:
            client.login(settings.smtp_username, settings.smtp_password)
        client.send_message(mime)


async def send_email(message: Email) -> None:
    """Dispatch an email. Goes through real SMTP when configured; logs
    a structured payload otherwise.

    The log fallback is deliberately preserved so existing tests +
    dev workflows (where SMTP credentials aren't set) keep working —
    the verification-link extraction in `app/services/email_auth.py`
    relies on it.
    """
    settings = get_settings()
    if settings.smtp_host:
        try:
            await asyncio.to_thread(_send_via_smtp, message)
            logger.info(
                "email.send.smtp",
                extra={
                    "to": message.to,
                    "subject": message.subject,
                    "attachments": len(message.attachments),
                },
            )
            return
        except (smtplib.SMTPException, OSError, ssl.SSLError) as exc:
            # Don't let a transient SMTP outage break user-facing actions
            # (e.g. an invite still records correctly even if the email
            # didn't go out). Log loudly so monitoring can pick it up.
            logger.error(
                "email.send.smtp.failed",
                extra={
                    "to": message.to,
                    "subject": message.subject,
                    "error": repr(exc),
                },
            )
            return

    # Pull out the first http(s) URL in the body, if any, so dev can
    # `docker compose logs backend | grep email.send` and copy-paste the
    # link without needing to inspect the body.
    link: str | None = None
    for line in message.body.splitlines():
        stripped = line.strip()
        if stripped.startswith(("http://", "https://")):
            link = stripped
            break

    logger.info(
        "email.send",
        extra={
            "to": message.to,
            "subject": message.subject,
            "body_preview": message.body[:80],
            "link": link,
            "attachments": len(message.attachments),
        },
    )
