"""Tax-invoice email dispatch.

Renders the BillingSettings Jinja2 templates with invoice context,
attaches the stored PDF (fetched + hash-verified), sends via
`services/email.send_email`, writes a `sent` audit-log entry.

When SMTP credentials are configured the email actually goes out from
`SMTP_FROM_INVOICES` (faktury@simplecrm.cz by default); otherwise the
underlying `send_email` falls back to a structured log.
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import UTC, datetime

from jinja2 import Template
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import BillingSettings, Invoice, InvoiceAuditLog
from app.services.email import Email, EmailAttachment, send_email
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

        # Slugify the invoice number for the attachment filename so a
        # customer's mail client doesn't choke on the raw `2026/00042`
        # form; the original number stays inside the PDF + audit log.
        safe_number = re.sub(r"[^A-Za-z0-9_.-]+", "-", invoice.number).strip("-") or "invoice"
        attachment = EmailAttachment(
            filename=f"faktura-{safe_number}.pdf",
            content_type="application/pdf",
            content=pdf_bytes,
        )
        message = Email(
            to=recipient,
            subject=subject,
            body=body,
            attachments=(attachment,),
            sender_role="invoices",
        )
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
