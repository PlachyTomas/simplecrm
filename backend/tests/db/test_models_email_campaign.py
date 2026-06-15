"""Smoke tests for the email campaign models (Task B1)."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Company,
    EmailCampaign,
    EmailCampaignRecipient,
    EmailRecipientStatus,
    Organization,
    User,
    UserRole,
)


async def _seed(db_session: AsyncSession) -> tuple[Organization, User, Company]:
    org = Organization(name="Campaign Test s.r.o.")
    db_session.add(org)
    await db_session.flush()
    user = User(
        email=f"u-{org.id.hex[:8]}@c.cz",
        name="Sales",
        role=UserRole.salesperson,
        organization_id=org.id,
    )
    company = Company(organization_id=org.id, name="ACME", owner_user_id=None)
    db_session.add_all([user, company])
    await db_session.flush()
    return org, user, company


async def test_campaign_with_recipients_roundtrip(db_session: AsyncSession) -> None:
    org, user, company = await _seed(db_session)
    campaign = EmailCampaign(
        organization_id=org.id,
        created_by_user_id=user.id,
        subject="Nová nabídka",
        body="Dobrý den,",
        from_email="sales@firma.cz",
        total=2,
        sent_count=1,
        failed_count=0,
        skipped_count=1,
    )
    campaign.recipients = [
        EmailCampaignRecipient(
            company_id=company.id,
            email="acme@firma.cz",
            company_name="ACME",
            status=EmailRecipientStatus.sent,
        ),
        EmailCampaignRecipient(
            company_id=company.id,
            email="",
            company_name="No Email s.r.o.",
            status=EmailRecipientStatus.skipped,
            error="no_email",
        ),
    ]
    db_session.add(campaign)
    await db_session.flush()
    assert campaign.id is not None
    assert len(campaign.recipients) == 2
    statuses = {r.status for r in campaign.recipients}
    assert statuses == {EmailRecipientStatus.sent, EmailRecipientStatus.skipped}
