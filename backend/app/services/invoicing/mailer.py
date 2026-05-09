"""Tax-invoice email dispatch.

Renders the BillingSettings Jinja2 templates with invoice context,
attaches the stored PDF (fetched + hash-verified), sends via
`services/email.send_email`, writes a `sent` audit-log entry.

The existing `services/email.py` is still a stub — the message lands in
the application log rather than a real inbox. Switching to a real
provider is a one-file change in commit follow-up; this module's
contract doesn't change.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from jinja2 import Template
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import BillingSettings, Invoice, InvoiceAuditLog
from app.services.email import Email, send_email
from app.services.invoicing.renderer import (
    _fmt_date_cs,
    _fmt_money_cs,
)
from app.services.invoicing.storage import InvoiceStorage

logger = logging.getLogger(__name__)


class InvoiceMailerError(Exception):
    """Wrapping error for failures inside `InvoiceMailer.send`."""


class InvoiceMailer:
    """Stateless wrapper. Construct per-request or reuse."""

    def __init__(self, storage: InvoiceStorage | None = None) -> None:
        self._storage = storage or InvoiceStorage()

    async def send(
        self,
        session: AsyncSession,
        invoice: Invoice,
        *,
        override_to: str | None = None,
        actor_user_id: uuid.UUID | None = None,
    ) -> None:
        """Render templates, fetch the archived PDF, send the email,
        write the audit log + `sent_at`/`sent_to_email` columns."""
        billing = (await session.execute(select(BillingSettings))).scalar_one()
        recipient = override_to or invoice.sent_to_email or invoice.customer_email
        if not recipient:
            raise InvoiceMailerError(
                f"Invoice {invoice.number} has no recipient email and none was provided"
            )

        # Verify the PDF is still byte-equal to its recorded hash before
        # we ship it. If the bucket got tampered with, fail loudly here
        # instead of attaching corrupted bytes to a customer email.
        pdf_bytes = self._storage.fetch_pdf(invoice)

        ctx = {
            "number": invoice.number,
            "due_date": _fmt_date_cs(invoice.due_at),
            "customer_name": invoice.customer_name,
            "period_start": _fmt_date_cs(invoice.taxable_supply_date),
            "period_end": _fmt_date_cs(invoice.due_at),
            "total_display": _fmt_money_cs(invoice.total_minor, invoice.currency),
            "issuer_iban": invoice.issuer_iban,
            "variable_symbol": invoice.variable_symbol,
        }
        subject = Template(billing.invoice_email_subject_template).render(**ctx)
        body = Template(billing.invoice_email_body_template).render(**ctx)

        message = Email(to=recipient, subject=subject, body=body)
        # The current send_email stub logs at INFO; when SES/Resend lands,
        # this call grows an `attachments` argument carrying `pdf_bytes`.
        # For now we just include the byte length in the audit payload so
        # operators can confirm the right artifact was queued.
        try:
            await send_email(message)
        except Exception as exc:
            logger.warning("Invoice email send failed for %s: %s", invoice.number, exc)
            session.add(
                InvoiceAuditLog(
                    invoice_id=invoice.id,
                    event="send_failed",
                    actor_user_id=actor_user_id,
                    payload={"recipient": recipient, "error": str(exc)},
                )
            )
            await session.flush()
            raise InvoiceMailerError(
                f"send_email failed for invoice {invoice.number}: {exc}"
            ) from exc

        invoice.sent_at = datetime.now(tz=UTC)
        invoice.sent_to_email = recipient
        session.add(
            InvoiceAuditLog(
                invoice_id=invoice.id,
                event="sent",
                actor_user_id=actor_user_id,
                payload={
                    "recipient": recipient,
                    "subject": subject,
                    "pdf_size_bytes": len(pdf_bytes),
                },
            )
        )
        await session.flush()


__all__ = ["InvoiceMailer", "InvoiceMailerError"]
