"""Email notifications.

MVP ships a stub backend that logs messages instead of sending real
SMTP. The interface (`build_freed_company_email` + `send_email`) is
shaped so the eventual switch to a real provider (Mailgun, Resend,
Hetzner SMTP) is a one-module change — callers stay unchanged.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger("simplecrm.email")


@dataclass(frozen=True)
class Email:
    to: str
    subject: str
    body: str


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


async def send_email(message: Email) -> None:
    """Dispatch an email. Stub: logs structured fields at INFO level.

    Until a real provider is wired up, dev/test extracts the verification
    or reset link from the structured logs (`extra.link` if present, else
    parse out of `extra.body`).
    """
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
        },
    )
