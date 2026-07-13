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
from pathlib import Path
from typing import Any, Literal

from jinja2 import Environment, FileSystemLoader

from app.core.config import get_settings
from app.core.i18n import t

logger = logging.getLogger("simplecrm.email")

# app/services/email.py -> app/services -> app/services/email_templates
_EMAIL_TEMPLATES_DIR = Path(__file__).resolve().parent / "email_templates"

_jinja_env = Environment(
    loader=FileSystemLoader(_EMAIL_TEMPLATES_DIR),
    autoescape=False,  # noqa: S701 — plain-text emails, no HTML to escape
    keep_trailing_newline=True,
)


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
    # CC/BCC recipients (used by the single-email composer). Bcc is set as a
    # header and stripped by smtplib's `send_message` before transmission.
    cc: tuple[str, ...] = field(default_factory=tuple)
    bcc: tuple[str, ...] = field(default_factory=tuple)
    # RFC 5322 threading headers for the send-only mail client. `message_id`
    # is the value we stamp; `in_reply_to`/`references` link a follow-up to a
    # previously sent mail.
    message_id: str | None = None
    in_reply_to: str | None = None
    references: str | None = None
    attachments: tuple[EmailAttachment, ...] = field(default_factory=tuple)
    # Picks which Zoho send-as identity supplies the `From:` header.
    # Defaults to "info" since everything except customer-facing
    # invoices should come from info@simplecrm.cz.
    sender_role: SenderRole = "info"


def render_email(name: str, lang: str, /, *, to: str, **ctx: Any) -> Email:
    """Render a per-locale transactional email from its Jinja template.

    `name` picks `app/services/email_templates/<lang>/<name>.txt.j2` for the
    body (plain text; `autoescape=False`, `keep_trailing_newline=True` so the
    template's exact trailing newline survives). The subject comes from
    `t(lang, f"emails.{name}.subject", **ctx)` — `app/locales/<lang>/emails.json`
    — which falls back to cs when a translation is missing and supports
    plural-suffixed subjects (e.g. `freed_company.subject_one/_other`) when
    `ctx` includes `count`. `ctx` is also the Jinja render context, so a
    template variable and a `str.format` subject placeholder can share a name
    (e.g. `organization_name`) without any extra plumbing.

    `name` and `lang` are positional-only so a template's own `name` context
    var (e.g. the recipient's first name, used by several templates) can be
    passed as a `name=` keyword without colliding with the template-selector
    argument.
    """
    subject = t(lang, f"emails.{name}.subject", **ctx)
    body = _jinja_env.get_template(f"{lang}/{name}.txt.j2").render(**ctx)
    return Email(to=to, subject=subject, body=body)


def build_freed_company_email(
    *, owner_email: str, owner_name: str, company_names: list[str], lang: str = "cs"
) -> Email:
    """Compose the "your companies were freed" digest for one owner.

    Kept as a pure function so tests can assert the template without a
    real SMTP transport.
    """
    if not company_names:
        raise ValueError("company_names must not be empty")
    joined = "\n".join(f"• {n}" for n in sorted(company_names))
    return render_email(
        "freed_company",
        lang,
        to=owner_email,
        name=owner_name,
        companies=joined,
        count=len(company_names),
    )


def build_subscription_pending_email(
    *,
    org_name: str,
    plan_display: str,
    founder_email: str = "podpora@simplecrm.cz",
    lang: str = "cs",
) -> Email:
    """Founder-facing notification: an org just chose a plan.

    Sent from `BillingService.choose_plan`. The body intentionally tells
    the founder which org+plan to look up so they can match the bank-
    transfer payment when it lands and activate the subscription via the
    super-admin UI.
    """
    return render_email(
        "subscription_pending",
        lang,
        to=founder_email,
        org_name=org_name,
        plan_display=plan_display,
    )


def build_billing_info_reminder_email(
    *,
    recipient: str,
    name: str | None,
    org_name: str,
    days_remaining: int,
    settings_link: str,
    lang: str = "cs",
) -> Email:
    """Reminder email for an org admin: trial ends soon and the
    Fakturační údaje are still missing.

    Sent by `run_billing_info_reminder_sweep` once per org, ~1 week
    before `trial_ends_at`. Without IČO + address on file the first
    invoice would render with an empty customer block, so we nudge
    the admin to fix it before the trial cliff. A missing `name` falls
    back to a per-language team greeting.
    """
    return render_email(
        "billing_info_reminder",
        lang,
        to=recipient,
        name=name or t(lang, "emails.common.fallback_name"),
        org_name=org_name,
        count=days_remaining,
        days_phrase=t(lang, "emails.billing_info_reminder.days", count=days_remaining),
        settings_link=settings_link,
    )


def build_verification_email(*, recipient: str, name: str, link: str, lang: str = "cs") -> Email:
    """Compose the verify-your-email message for a new (or linking) user.

    Sent from the email-auth signup and resend flows. Link points at the
    frontend's `/verify-email?token=...` page; valid 24 h.
    """
    return render_email("verification", lang, to=recipient, name=name, link=link)


def build_password_reset_email(*, recipient: str, name: str, link: str, lang: str = "cs") -> Email:
    """Compose the reset-your-password message.

    Sent from the email-auth password-reset flow. Link points at the
    frontend's `/reset-password?token=...` page; valid 1 h.
    """
    return render_email("password_reset", lang, to=recipient, name=name, link=link)


def _build_mime(message: Email, *, sender: str) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = message.to
    if message.cc:
        msg["Cc"] = ", ".join(message.cc)
    if message.bcc:
        # smtplib.send_message reads Bcc for the envelope and strips the header.
        msg["Bcc"] = ", ".join(message.bcc)
    msg["Subject"] = message.subject
    if message.reply_to:
        msg["Reply-To"] = message.reply_to
    if message.message_id:
        msg["Message-ID"] = message.message_id
    if message.in_reply_to:
        msg["In-Reply-To"] = message.in_reply_to
    if message.references:
        msg["References"] = message.references
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
