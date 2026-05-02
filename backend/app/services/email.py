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


async def send_email(message: Email) -> None:
    """Dispatch an email. Stub: logs structured fields at INFO level."""
    logger.info(
        "email.send",
        extra={
            "to": message.to,
            "subject": message.subject,
            "body_preview": message.body[:80],
        },
    )
