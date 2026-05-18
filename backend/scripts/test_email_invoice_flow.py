"""Soft-launch readiness probe for Zoho SMTP + invoice flow.

Three checks, run in order:
  1. Send a `feedback` notification via `send_email` to podpora@simplecrm.cz.
     Verifies the smtplib transaction succeeds.
  2. Seed a Test Zákazník s.r.o. org + paid Charge, run InvoiceService.
     issue_for_charge → assert PDF lands at var/invoices/.
  3. Call InvoiceMailer.send with override_to=tomasplachy@simplecrm.cz
     so the recipient can confirm the attached PDF + Czech templates.

Idempotent: the test org is created with a deterministic email so a
second run reuses the existing row.

Run with: `uv run python -m scripts.test_email_invoice_flow`
"""

from __future__ import annotations

import asyncio
import logging
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.db.models import (
    BillingSettings,
    Charge,
    Organization,
    Plan,
    Subscription,
)
from app.services.email import Email, send_email
from app.services.invoicing.mailer import InvoiceMailer, InvoiceMailerError
from app.services.invoicing.service import (
    InvoiceIssuerNotConfiguredError,
    InvoiceService,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
log = logging.getLogger("test_email_invoice_flow")

TEST_ORG_NAME = "Test Zákazník s.r.o."
TEST_ORG_ICO = "00000001"
TEST_CUSTOMER_EMAIL = "tomasplachy@simplecrm.cz"  # so you can read what arrives


async def step1_feedback(test_to: str) -> None:
    log.info("=" * 60)
    log.info("STEP 1 — feedback notification → %s", test_to)
    log.info("=" * 60)
    msg = Email(
        to=test_to,
        subject="[SimpleCRM test] feedback notification probe",
        body=(
            "This is an automated soft-launch readiness probe.\n\n"
            "If you received this, info@-sender SMTP delivery is working.\n"
            f"Timestamp: {datetime.now(tz=UTC).isoformat()}\n"
        ),
        sender_role="info",
    )
    await send_email(msg)
    log.info("step 1 OK — smtplib accepted the message")


async def _ensure_billing_settings(session) -> BillingSettings:
    row = (await session.execute(select(BillingSettings))).scalar_one_or_none()
    if row is None:
        row = BillingSettings(id=1)
        session.add(row)
        await session.flush()
    changed = False
    if not row.issuer_name:
        row.issuer_name = "SimpleCRM (test issuer)"
        changed = True
    if not row.issuer_address_street:
        row.issuer_address_street = "Testovací 1"
        changed = True
    if not row.issuer_address_city:
        row.issuer_address_city = "Praha"
        changed = True
    if not row.issuer_address_zip:
        row.issuer_address_zip = "11000"
        changed = True
    if not row.issuer_register_text:
        row.issuer_register_text = "Test issuer — pre-launch probe"
        changed = True
    if not row.seller_ico:
        row.seller_ico = "00000000"
        changed = True
    if not row.seller_iban:
        row.seller_iban = "CZ0000000000000000000000"
        changed = True
    if changed:
        await session.flush()
    return row


async def _ensure_test_org_and_charge(session) -> Charge:
    # Re-use a deterministic name so re-runs don't pollute the DB.
    org = (
        await session.execute(select(Organization).where(Organization.name == TEST_ORG_NAME))
    ).scalar_one_or_none()
    if org is None:
        org = Organization(
            name=TEST_ORG_NAME,
            ico=TEST_ORG_ICO,
            address_street="Zákaznická 1",
            address_city="Brno",
            address_zip="60200",
            billing_email=TEST_CUSTOMER_EMAIL,
            trial_ends_at=datetime.now(tz=UTC) + timedelta(days=30),
        )
        session.add(org)
        await session.flush()

    monthly_plan = (
        await session.execute(select(Plan).where(Plan.code == "monthly"))
    ).scalar_one_or_none()
    if monthly_plan is None:
        raise RuntimeError(
            "monthly plan missing from DB — run alembic migrations / plan seeder first"
        )

    sub = (
        await session.execute(select(Subscription).where(Subscription.organization_id == org.id))
    ).scalar_one_or_none()
    if sub is None:
        now = datetime.now(tz=UTC)
        sub = Subscription(
            organization_id=org.id,
            plan_id=monthly_plan.id,
            status="active",
            started_at=now,
            current_period_starts_at=now,
            current_period_ends_at=now + timedelta(days=30),
            seat_count=1,
            contracted_seat_count=1,
        )
        session.add(sub)
        await session.flush()

    charge = Charge(
        organization_id=org.id,
        kind="initial",
        amount_minor=100,  # 1 CZK
        currency="CZK",
        status="paid",
        seats=1,
        period_starts_at=sub.current_period_starts_at,
        period_ends_at=sub.current_period_ends_at,
        comgate_trans_id=f"test-{uuid.uuid4().hex[:12]}",
        paid_at=datetime.now(tz=UTC),
    )
    session.add(charge)
    await session.flush()
    return charge


async def step2_issue_invoice(session) -> tuple[Path, str]:
    log.info("=" * 60)
    log.info("STEP 2 — issue invoice for a paid 1 CZK test charge")
    log.info("=" * 60)
    await _ensure_billing_settings(session)
    charge = await _ensure_test_org_and_charge(session)
    log.info("seeded test charge id=%s amount=1 CZK", charge.id)

    invoice = await InvoiceService().issue_for_charge(session, charge)
    await session.commit()
    log.info("invoice issued — number=%s status=%s", invoice.number, invoice.status)

    settings = get_settings()
    local_root = Path(settings.invoice_storage_local_root)
    candidates = sorted(local_root.rglob("*.pdf"))
    if not candidates:
        raise RuntimeError(f"no PDF found under {local_root}")
    latest = candidates[-1]
    size = latest.stat().st_size
    log.info("PDF on disk: %s (%d bytes)", latest, size)
    return latest, invoice.number


async def step3_send_invoice(session, *, override_to: str) -> None:
    log.info("=" * 60)
    log.info("STEP 3 — email the invoice PDF → %s (from faktury@)", override_to)
    log.info("=" * 60)
    from app.db.models import Invoice

    invoice = (
        await session.execute(select(Invoice).order_by(Invoice.issued_at.desc()).limit(1))
    ).scalar_one()
    mailer = InvoiceMailer()
    await mailer.send(session, invoice, override_to=override_to)
    await session.commit()
    log.info("step 3 OK — smtplib accepted the invoice attachment")


async def amain() -> int:
    settings = get_settings()
    log.info(
        "SMTP target host=%s port=%d ssl=%s user=%s from_invoices=%s from_info=%s",
        settings.smtp_host,
        settings.smtp_port,
        settings.smtp_use_ssl,
        settings.smtp_username or "(empty — will log instead of send)",
        settings.smtp_from_invoices,
        settings.smtp_from_info,
    )
    if not settings.smtp_username or not settings.smtp_password:
        log.error("SMTP_USERNAME/SMTP_PASSWORD not configured — aborting")
        return 2

    # Step 1 — feedback notification, no DB needed
    feedback_to = settings.feedback_recipient_email
    try:
        await step1_feedback(feedback_to)
    except Exception:
        log.exception("step 1 FAILED")
        return 1

    # Steps 2 + 3 share a session
    engine = create_async_engine(settings.database_url, echo=False, future=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with session_factory() as session:
            try:
                pdf_path, invoice_number = await step2_issue_invoice(session)
            except InvoiceIssuerNotConfiguredError:
                log.exception("step 2 FAILED — issuer fields missing")
                return 1
            except Exception:
                log.exception("step 2 FAILED")
                return 1

            try:
                await step3_send_invoice(session, override_to=TEST_CUSTOMER_EMAIL)
            except InvoiceMailerError:
                log.exception("step 3 FAILED — InvoiceMailer raised")
                return 1
            except Exception:
                log.exception("step 3 FAILED")
                return 1

        log.info("=" * 60)
        log.info("ALL STEPS PASSED")
        log.info("invoice number: %s", invoice_number)
        log.info("pdf path:       %s", pdf_path)
        log.info("sent feedback to:   %s", feedback_to)
        log.info("sent invoice to:    %s", TEST_CUSTOMER_EMAIL)
        log.info("=" * 60)
        return 0
    finally:
        await engine.dispose()


if __name__ == "__main__":
    sys.exit(asyncio.run(amain()))
