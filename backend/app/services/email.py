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


def build_billing_info_reminder_email(
    *,
    recipient: str,
    name: str,
    org_name: str,
    days_remaining: int,
    settings_link: str,
) -> Email:
    """Reminder email for an org admin: trial ends soon and the
    Fakturační údaje are still missing.

    Sent by `run_billing_info_reminder_sweep` once per org, ~1 week
    before `trial_ends_at`. Without IČO + address on file the first
    invoice would render with an empty customer block, so we nudge
    the admin to fix it before the trial cliff.
    """
    subject = f"SimpleCRM: doplňte fakturační údaje (zkušebka končí za {days_remaining} dní)"
    body = (
        f"Ahoj {name},\n\n"
        f"zkušební verze organizace {org_name} končí za {days_remaining} dní. "
        "Pro vystavení první faktury potřebujeme mít na souboru vaše "
        "fakturační údaje (IČO a sídlo). Doplňte je prosím v nastavení:\n\n"
        f"{settings_link}\n\n"
        "Bez vyplněných údajů by faktura nebyla platným daňovým dokladem.\n"
    )
    return Email(to=recipient, subject=subject, body=body)


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


@dataclass(frozen=True)
class SmtpConfig:
    """An explicit SMTP target. Lets us send through either the global
    transactional account or a per-user mailbox (bulk email) with the same
    transport code. `sender` is the full `From:` header value.
    """

    host: str
    port: int
    use_ssl: bool
    use_starttls: bool
    username: str
    password: str
    sender: str


def _smtp_config_from_settings(sender: str) -> SmtpConfig:
    """Build an `SmtpConfig` from the global transactional settings."""
    settings = get_settings()
    return SmtpConfig(
        host=settings.smtp_host,
        port=settings.smtp_port,
        use_ssl=settings.smtp_use_ssl,
        use_starttls=settings.smtp_use_starttls,
        username=settings.smtp_username,
        password=settings.smtp_password,
        sender=sender,
    )


def _send_via_smtp_config(message: Email, config: SmtpConfig) -> None:
    """Blocking SMTP send of a single message against an explicit config.

    Shared by the global transactional path (`_send_via_smtp`) and the
    per-user `send_email_via`. Called via `asyncio.to_thread` so the event
    loop isn't blocked on slow handshakes.
    """
    mime = _build_mime(message, sender=config.sender)
    context = ssl.create_default_context()
    if config.use_ssl:
        with smtplib.SMTP_SSL(
            host=config.host,
            port=config.port,
            context=context,
            timeout=15,
        ) as client:
            if config.username:
                client.login(config.username, config.password)
            client.send_message(mime)
        return

    with smtplib.SMTP(host=config.host, port=config.port, timeout=15) as client:
        if config.use_starttls:
            client.starttls(context=context)
        if config.username:
            client.login(config.username, config.password)
        client.send_message(mime)


def _send_via_smtp(message: Email) -> None:
    """Blocking SMTP send through the global transactional account.

    Kept as the seam the test suite patches to a no-op; delegates to the
    config-based transport so there's a single SMTP code path.
    """
    config = _smtp_config_from_settings(_resolve_sender(message.sender_role))
    _send_via_smtp_config(message, config)


async def send_email_via(message: Email, config: SmtpConfig) -> None:
    """Send one message through an explicit SMTP config (per-user sends).

    Unlike `send_email`, there is no log-fallback: per-user bulk email is
    only ever attempted once the user's SMTP has been verified, so a
    failure here is a real error the caller records against the recipient.
    """
    await asyncio.to_thread(_send_via_smtp_config, message, config)


def verify_smtp(config: SmtpConfig) -> None:
    """Connect + authenticate to validate credentials, then disconnect.

    Raises `smtplib.SMTPException` / `OSError` / `ssl.SSLError` on failure;
    callers translate that into a user-facing "test failed" message.
    """
    context = ssl.create_default_context()
    if config.use_ssl:
        with smtplib.SMTP_SSL(
            host=config.host,
            port=config.port,
            context=context,
            timeout=15,
        ) as client:
            if config.username:
                client.login(config.username, config.password)
        return

    with smtplib.SMTP(host=config.host, port=config.port, timeout=15) as client:
        if config.use_starttls:
            client.starttls(context=context)
        if config.username:
            client.login(config.username, config.password)


async def send_email(message: Email) -> None:
    """Dispatch an email. Goes through real SMTP when configured; logs
    a structured payload otherwise.

    Credentials gate: SMTP is only attempted when host + username + password
    are *all* set. Until recently we attempted SMTP whenever `smtp_host` was
    truthy, but the default value is `smtp.zoho.eu` — so a deployment that
    forgot to set `SMTP_USERNAME`/`SMTP_PASSWORD` was connecting to Zoho,
    skipping `login()`, and getting silently rejected at `send_message`.
    Symptom: signup emails never arrive. Requiring all three up front falls
    back to the log-link path instead, which keeps dev usable and makes a
    prod misconfig visible (the verification link shows up in the logs).
    """
    settings = get_settings()
    smtp_configured = bool(settings.smtp_host and settings.smtp_username and settings.smtp_password)
    if smtp_configured:
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
            # didn't go out). Log loudly — include the exception class name
            # so monitoring can alert on the failure mode at a glance.
            logger.error(
                "email.send.smtp.failed",
                extra={
                    "to": message.to,
                    "subject": message.subject,
                    "error_type": type(exc).__name__,
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
