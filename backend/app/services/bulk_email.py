"""Bulk-email service: resolve recipients, render, and send a campaign.

Sending is synchronous (per product decision) but bounded: one authenticated
SMTP connection to the *user's own* mailbox, reused across recipients, capped
at `MAX_RECIPIENTS`. Each addressee's outcome is persisted on an
`EmailCampaignRecipient` so the user can later verify what the mail server
accepted. Successfully-emailed companies optionally get a new pipeline deal
and always get an `email_sent` activity on their timeline.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import smtplib
import ssl
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import cast

from sqlalchemy import Select, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.scoping import scope_by_owner
from app.core.token_crypto import decrypt_token
from app.db.models import (
    Activity,
    ActivityEntityType,
    ActivityType,
    BlockedCompany,
    Company,
    Contact,
    Deal,
    EmailCampaign,
    EmailCampaignRecipient,
    EmailRecipientStatus,
    Organization,
    Pipeline,
    Stage,
    StageType,
    User,
    UserRole,
    UserSmtpSettings,
)
from app.schemas.bulk_email import (
    MAX_RECIPIENTS,
    BulkEmailFilters,
    BulkEmailSendIn,
    RecipientCandidate,
)
from app.schemas.contact import ContactOut
from app.services.email import Email, EmailAttachment, SmtpConfig, _build_mime

logger = logging.getLogger("simplecrm.bulk_email")


class BulkEmailError(Exception):
    """Raised for caller-fixable problems (no verified SMTP, over cap, …).

    The API layer maps this to HTTP 422.
    """


@dataclass(frozen=True)
class BulkAttachment:
    """An uploaded attachment, decoded at the API boundary."""

    filename: str
    content_type: str
    content: bytes


@dataclass
class _SendUnit:
    company_id: uuid.UUID
    company_name: str
    contact_id: uuid.UUID | None
    contact_name: str
    email: str


# ---------------------------------------------------------------------------
# Recipient resolution
# ---------------------------------------------------------------------------


def _default_email(company: Company, contacts: list[Contact]) -> str | None:
    """The address shown as the company's default recipient: the company's
    own email, else its main contact's (explicit pick, else alphabetically
    first). May be None even when other contacts have emails."""
    if company.email:
        return company.email
    if company.main_contact_id is not None:
        for ct in contacts:
            if ct.id == company.main_contact_id:
                return ct.email
    return contacts[0].email if contacts else None


async def _contacts_by_company(
    session: AsyncSession, company_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[Contact]]:
    grouped: dict[uuid.UUID, list[Contact]] = defaultdict(list)
    if not company_ids:
        return grouped
    rows = (
        (
            await session.execute(
                select(Contact)
                .where(Contact.company_id.in_(company_ids))
                .order_by(Contact.company_id, Contact.last_name, Contact.first_name)
            )
        )
        .scalars()
        .all()
    )
    for ct in rows:
        if ct.company_id is not None:
            grouped[ct.company_id].append(ct)
    return grouped


async def _blocked_icos(session: AsyncSession, organization_id: uuid.UUID) -> set[str]:
    return set(
        (
            await session.execute(
                select(BlockedCompany.ico).where(BlockedCompany.organization_id == organization_id)
            )
        )
        .scalars()
        .all()
    )


async def _owned_companies_query(
    session: AsyncSession,
    user: User,
    *,
    filters: BulkEmailFilters | None = None,
    only_ids: list[uuid.UUID] | None = None,
) -> Select[tuple[Company]]:
    """Base query for the candidate set in the caller's scope. Salespeople
    are pinned to their own book; managers/admins target a chosen owner, the
    unowned pool (Nezabrané), or — with no owner filter — their owned
    companies. Optional data filters applied on top."""
    base = select(Company).where(Company.organization_id == user.organization_id)
    if user.role is UserRole.salesperson:
        base = base.where(Company.owner_user_id == user.id)
    elif only_ids is None:
        # Candidate resolution: scope to the chosen owner filter. At send
        # time (only_ids set) the companies are already hand-picked, so we
        # honor that selection within the visibility scope instead of
        # re-imposing an owner filter (which would drop selected Nezabrané).
        if filters is not None and filters.unowned:
            base = base.where(Company.owner_user_id.is_(None))
        elif filters is not None and filters.owner_user_id is not None:
            base = base.where(Company.owner_user_id == filters.owner_user_id)
        else:
            base = base.where(Company.owner_user_id.is_not(None))

    if only_ids is not None:
        base = base.where(Company.id.in_(only_ids))

    if filters is not None:
        if filters.industry:
            base = base.where(Company.industry == filters.industry)
        if filters.city:
            base = base.where(Company.address_city == filters.city)
        if filters.stage_id is not None:
            stage_exists = (
                select(Deal.id)
                .where(Deal.company_id == Company.id, Deal.stage_id == filters.stage_id)
                .exists()
            )
            base = base.where(stage_exists)
        if filters.has_won_deal:
            won_exists = (
                select(Deal.id)
                .join(Stage, Deal.stage_id == Stage.id)
                .where(Deal.company_id == Company.id, Stage.stage_type == StageType.won)
                .exists()
            )
            base = base.where(won_exists)
        if filters.no_order_since_days is not None:
            cutoff = datetime.now(tz=UTC) - timedelta(days=filters.no_order_since_days)
            base = base.where(or_(Company.last_order_at.is_(None), Company.last_order_at < cutoff))

    return await scope_by_owner(base, session=session, user=user, owner_col=Company.owner_user_id)


async def resolve_recipients(
    session: AsyncSession, user: User, filters: BulkEmailFilters
) -> list[RecipientCandidate]:
    org_id = cast(uuid.UUID, user.organization_id)  # guaranteed by require_org_membership
    stmt = await _owned_companies_query(session, user, filters=filters)
    companies = list((await session.execute(stmt.order_by(Company.name))).scalars().all())
    contacts = await _contacts_by_company(session, [c.id for c in companies])
    blocked = await _blocked_icos(session, org_id)

    out: list[RecipientCandidate] = []
    for company in companies:
        cts = contacts.get(company.id, [])
        has_any_email = bool(company.email) or any(c.email for c in cts)
        if company.ico and company.ico in blocked:
            emailable, skip_reason = False, "blocked"
        elif not has_any_email:
            emailable, skip_reason = False, "no_email"
        else:
            emailable, skip_reason = True, None
        out.append(
            RecipientCandidate(
                company_id=company.id,
                company_name=company.name,
                default_email=_default_email(company, cts),
                contacts=[ContactOut.model_validate(c) for c in cts],
                emailable=emailable,
                skip_reason=skip_reason,
            )
        )
    return out


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------


def render_message(
    subject: str,
    body: str,
    *,
    company_name: str,
    contact_name: str,
    sender_name: str,
) -> tuple[str, str]:
    """Substitute the merge fields `{firma}`, `{kontakt}`, `{vlastnik}`."""

    def _sub(text: str) -> str:
        return (
            text.replace("{firma}", company_name)
            .replace("{kontakt}", contact_name)
            .replace("{vlastnik}", sender_name)
        )

    return _sub(subject), _sub(body)


# ---------------------------------------------------------------------------
# Sending
# ---------------------------------------------------------------------------


async def _require_verified_smtp(session: AsyncSession, user: User) -> SmtpConfig:
    row = (
        await session.execute(select(UserSmtpSettings).where(UserSmtpSettings.user_id == user.id))
    ).scalar_one_or_none()
    if row is None or row.verified_at is None:
        raise BulkEmailError("Nejdřív nastavte a ověřte odesílání e-mailů (SMTP) v nastavení.")
    sender = f"{row.from_name} <{row.from_email}>" if row.from_name else row.from_email
    return SmtpConfig(
        host=row.host,
        port=row.port,
        use_ssl=row.use_ssl,
        use_starttls=row.use_starttls,
        username=row.username,
        password=decrypt_token(row.password_encrypted),
        sender=sender,
    )


def _open_smtp(config: SmtpConfig) -> smtplib.SMTP:
    """Open + authenticate one SMTP connection, reused across the batch."""
    context = ssl.create_default_context()
    if config.use_ssl:
        client: smtplib.SMTP = smtplib.SMTP_SSL(
            host=config.host, port=config.port, context=context, timeout=30
        )
    else:
        client = smtplib.SMTP(host=config.host, port=config.port, timeout=30)
        if config.use_starttls:
            client.starttls(context=context)
    if config.username:
        client.login(config.username, config.password)
    return client


def _run_send_loop(
    config: SmtpConfig,
    subject: str,
    body: str,
    sender_name: str,
    units: list[_SendUnit],
    attachments: tuple[EmailAttachment, ...],
) -> list[dict[str, object]]:
    """Blocking send over one reused connection. Returns one result dict per
    unit. Reconnects once on a dropped connection; if the connection can't be
    established at all, every unit is marked failed."""
    results: list[dict[str, object]] = []
    try:
        client: smtplib.SMTP | None = _open_smtp(config)
    except (smtplib.SMTPException, OSError, ssl.SSLError) as exc:
        return [_result(u, EmailRecipientStatus.failed, str(exc)) for u in units]

    for unit in units:
        rendered_subject, rendered_body = render_message(
            subject,
            body,
            company_name=unit.company_name,
            contact_name=unit.contact_name,
            sender_name=sender_name,
        )
        message = Email(
            to=unit.email,
            subject=rendered_subject,
            body=rendered_body,
            attachments=attachments,
        )
        mime = _build_mime(message, sender=config.sender)
        try:
            if client is None:
                client = _open_smtp(config)
            client.send_message(mime)
            results.append(_result(unit, EmailRecipientStatus.sent, None))
        except smtplib.SMTPServerDisconnected:
            # Reconnect once and retry this unit.
            try:
                client = _open_smtp(config)
                client.send_message(mime)
                results.append(_result(unit, EmailRecipientStatus.sent, None))
            except (smtplib.SMTPException, OSError, ssl.SSLError) as exc:
                client = None
                results.append(_result(unit, EmailRecipientStatus.failed, str(exc)))
        except (smtplib.SMTPException, OSError, ssl.SSLError) as exc:
            results.append(_result(unit, EmailRecipientStatus.failed, str(exc)))

    if client is not None:
        with contextlib.suppress(smtplib.SMTPException, OSError):
            client.quit()
    return results


def _result(unit: _SendUnit, status: EmailRecipientStatus, error: str | None) -> dict[str, object]:
    return {
        "company_id": unit.company_id,
        "contact_id": unit.contact_id,
        "email": unit.email,
        "company_name": unit.company_name,
        "status": status,
        "error": error,
        "sent_at": datetime.now(tz=UTC) if status is EmailRecipientStatus.sent else None,
    }


async def _first_open_stage(session: AsyncSession, organization_id: uuid.UUID) -> Stage | None:
    pipeline = (
        await session.execute(
            select(Pipeline).where(
                Pipeline.organization_id == organization_id,
                Pipeline.is_default.is_(True),
            )
        )
    ).scalar_one_or_none()
    if pipeline is None:
        return None
    return (
        await session.execute(
            select(Stage)
            .where(Stage.pipeline_id == pipeline.id, Stage.stage_type == StageType.open)
            .order_by(Stage.position)
            .limit(1)
        )
    ).scalar_one_or_none()


async def send_campaign(
    session: AsyncSession,
    user: User,
    payload: BulkEmailSendIn,
    attachment: BulkAttachment | None,
) -> EmailCampaign:
    org_id = cast(uuid.UUID, user.organization_id)  # guaranteed by require_org_membership
    config = await _require_verified_smtp(session, user)

    # Re-validate every requested company server-side: must be an owned
    # company in the caller's scope/book and not blocked. Each chosen email
    # must actually belong to the company (its own email or a contact's).
    requested_ids = [r.company_id for r in payload.recipients]
    stmt = await _owned_companies_query(session, user, only_ids=requested_ids)
    allowed = {c.id: c for c in (await session.execute(stmt)).scalars().all()}
    contacts = await _contacts_by_company(session, list(allowed.keys()))
    blocked = await _blocked_icos(session, org_id)

    units: list[_SendUnit] = []
    skipped: list[dict[str, object]] = []

    for recip in payload.recipients:
        company = allowed.get(recip.company_id)
        first_email = recip.emails[0]
        if company is None:
            skipped.append(_skip(recip.company_id, "?", first_email, "not_allowed"))
            continue
        if company.ico and company.ico in blocked:
            skipped.append(_skip(company.id, company.name, first_email, "blocked"))
            continue
        cts = contacts.get(company.id, [])
        known: dict[str, Contact | None] = {}
        if company.email:
            known[company.email.lower()] = None
        for ct in cts:
            if ct.email:
                known[ct.email.lower()] = ct
        for email in recip.emails:
            key = str(email).lower()
            if key not in known:
                # Guard against using the feature to mail arbitrary addresses.
                skipped.append(_skip(company.id, company.name, str(email), "invalid_recipient"))
                continue
            contact = known[key]
            units.append(
                _SendUnit(
                    company_id=company.id,
                    company_name=company.name,
                    contact_id=contact.id if contact is not None else recip.contact_id,
                    contact_name=contact.first_name if contact is not None else "",
                    email=str(email),
                )
            )

    if len(units) > MAX_RECIPIENTS:
        raise BulkEmailError(f"Maximálně {MAX_RECIPIENTS} příjemců na jedno odeslání.")

    attachments: tuple[EmailAttachment, ...] = ()
    if attachment is not None:
        attachments = (
            EmailAttachment(
                filename=attachment.filename,
                content_type=attachment.content_type,
                content=attachment.content,
            ),
        )

    sent_results: list[dict[str, object]] = []
    if units:
        sent_results = await asyncio.to_thread(
            _run_send_loop,
            config,
            payload.subject,
            payload.body,
            user.name,
            units,
            attachments,
        )

    all_results = sent_results + skipped
    campaign = EmailCampaign(
        organization_id=org_id,
        created_by_user_id=user.id,
        subject=payload.subject,
        body=payload.body,
        from_email=config.sender,
        attachment_filename=attachment.filename if attachment else None,
        total=len(all_results),
        sent_count=0,
        failed_count=0,
        skipped_count=0,
    )
    for r in all_results:
        status = r["status"]
        if status is EmailRecipientStatus.sent:
            campaign.sent_count += 1
        elif status is EmailRecipientStatus.failed:
            campaign.failed_count += 1
        else:
            campaign.skipped_count += 1
        campaign.recipients.append(
            EmailCampaignRecipient(
                company_id=r["company_id"] if r["company_id"] != "?" else None,
                contact_id=r.get("contact_id"),
                email=r["email"],
                company_name=r["company_name"],
                status=status,
                error=r["error"],
                sent_at=r["sent_at"],
            )
        )
    session.add(campaign)
    await session.flush()

    # Side effects, deduped to one per company that received at least one mail.
    # Sent results always carry a real company UUID (only skips use "?").
    sent_company_ids: set[uuid.UUID] = {
        cast(uuid.UUID, r["company_id"])
        for r in sent_results
        if r["status"] is EmailRecipientStatus.sent
    }
    if sent_company_ids:
        if payload.create_deals:
            await _create_deals(session, user, sent_company_ids, payload, allowed)
        await _log_activities(session, user, sent_company_ids, campaign)

    await session.commit()
    # Re-fetch with recipients eagerly loaded so callers (the /send response
    # and tests) can read them without tripping a lazy load post-commit.
    loaded = (
        await session.execute(
            select(EmailCampaign)
            .where(EmailCampaign.id == campaign.id)
            .options(selectinload(EmailCampaign.recipients))
        )
    ).scalar_one()
    return loaded


def _skip(
    company_id: uuid.UUID | str, company_name: str, email: str, reason: str
) -> dict[str, object]:
    return {
        "company_id": company_id,
        "contact_id": None,
        "email": email,
        "company_name": company_name,
        "status": EmailRecipientStatus.skipped,
        "error": reason,
        "sent_at": None,
    }


async def _create_deals(
    session: AsyncSession,
    user: User,
    company_ids: set[uuid.UUID],
    payload: BulkEmailSendIn,
    companies: dict[uuid.UUID, Company],
) -> None:
    org_id = cast(uuid.UUID, user.organization_id)
    stage = await _first_open_stage(session, org_id)
    if stage is None:
        logger.warning(
            "bulk_email.create_deals.no_stage",
            extra={"organization_id": str(org_id)},
        )
        return
    org = await session.get(Organization, org_id)
    currency = org.currency if org is not None else "CZK"
    name = payload.deal_title or payload.subject
    for company_id in company_ids:
        session.add(
            Deal(
                organization_id=org_id,
                company_id=company_id,
                stage_id=stage.id,
                owner_user_id=user.id,
                name=name,
                value=Decimal("0"),
                currency=currency,
            )
        )


async def _log_activities(
    session: AsyncSession,
    user: User,
    company_ids: set[uuid.UUID],
    campaign: EmailCampaign,
) -> None:
    org_id = cast(uuid.UUID, user.organization_id)
    for company_id in company_ids:
        session.add(
            Activity(
                organization_id=org_id,
                entity_type=ActivityEntityType.company,
                entity_id=company_id,
                user_id=user.id,
                activity_type=ActivityType.email_sent,
                payload={"subject": campaign.subject, "campaign_id": str(campaign.id)},
            )
        )
