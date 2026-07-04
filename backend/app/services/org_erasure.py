"""GDPR Art. 17 erasure for a customer organization.

Anonymization in place — the `organizations` row stays so the linked
invoices survive the 10-year accounting retention window (§ 31 zák. č.
563/1991 Sb.). Every PII-bearing satellite is hard-deleted; user rows
are anonymized and deactivated so existing JWTs immediately stop
working via the `is_active` check in `get_current_user`.

Kept (with FKs that survive via SET NULL on user/org pointers):
- subscriptions, charges, invoices, invoice_lines, invoice_audit_log,
  super_admin_audit_log

Hard-deleted (PII-heavy, no accounting need):
- contacts, companies, deals, activities, blocked_companies, invitations,
  pipelines (stages cascade), teams, payment_methods, refresh_tokens,
  auth_action_tokens
"""

from __future__ import annotations

import contextlib
import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Activity,
    AuthActionToken,
    BlockedCompany,
    Company,
    Contact,
    Deal,
    EmailCampaign,
    GoogleCalendarConnection,
    Invitation,
    Organization,
    PaymentMethod,
    Pipeline,
    RefreshToken,
    Team,
    User,
    UserSmtpSettings,
)
from app.services import billing
from app.services.comgate import ComGateClient


class ErasureError(Exception):
    """Raised when erasure cannot proceed (already deleted, name mismatch, …)."""


_ANON_USER_NAME = "(smazaný uživatel)"
_ANON_EMAIL_DOMAIN = "simplecrm.invalid"


async def erase_organization(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    confirmation_name: str,
    by_admin_id: uuid.UUID,
    comgate: ComGateClient,
) -> Organization:
    """Anonymize an organization and hard-delete its PII satellites.

    Caller is responsible for the surrounding transaction — this function
    flushes but does not commit, so the route can run a single commit at
    the end (keeps the audit log + erasure atomic).
    """
    org = await session.get(Organization, org_id)
    if org is None:
        raise ErasureError("Organization not found")
    if org.deleted_at is not None:
        raise ErasureError("Organization already deleted")
    if confirmation_name != org.name:
        raise ErasureError("Confirmation name does not match organization name")

    # 1. Cancel any active subscription so the billing scheduler doesn't
    #    re-charge the (now anonymized) org on the next rotation. Best-effort
    #    against ComGate — a brand-new trialing org has no payment method.
    payment_method = (
        await session.execute(select(PaymentMethod).where(PaymentMethod.organization_id == org_id))
    ).scalar_one_or_none()
    if payment_method is not None:
        await comgate.disable_recurring(payment_method.comgate_initial_trans_id)

    # Already-canceled, trialing-without-sub, etc. all raise BillingError —
    # fine to ignore. The scheduler's `is_comp=False` / `status='active'`
    # filter plus the per-user `is_active=False` flip below stop further
    # charges anyway.
    with contextlib.suppress(billing.BillingError):
        await billing.cancel_self_serve(
            session, org_id=org_id, by_admin_id=by_admin_id, reason="organization_erased"
        )

    # 2. Hard-delete PII satellites. Order matters where row-level FKs
    #    cascade (e.g. deals reference companies); SQL CASCADEs cover the
    #    rest, but we delete explicitly so the intent is auditable.
    user_ids = list(
        (await session.execute(select(User.id).where(User.organization_id == org_id)))
        .scalars()
        .all()
    )
    if user_ids:
        await session.execute(delete(RefreshToken).where(RefreshToken.user_id.in_(user_ids)))
        await session.execute(delete(AuthActionToken).where(AuthActionToken.user_id.in_(user_ids)))

    await session.execute(delete(Activity).where(Activity.organization_id == org_id))
    await session.execute(delete(Deal).where(Deal.organization_id == org_id))
    await session.execute(delete(Contact).where(Contact.organization_id == org_id))
    await session.execute(delete(Company).where(Company.organization_id == org_id))
    await session.execute(delete(BlockedCompany).where(BlockedCompany.organization_id == org_id))
    await session.execute(delete(Invitation).where(Invitation.organization_id == org_id))
    await session.execute(delete(Pipeline).where(Pipeline.organization_id == org_id))
    await session.execute(delete(Team).where(Team.organization_id == org_id))
    # PII/credential satellites added after the original erasure list (review
    # R3 P2). These carry the org's contact emails and stored third-party
    # credentials, so they must be hard-deleted too:
    #   - email_campaigns (+ recipients cascade) — recipient email addresses
    #   - google_calendar_connections — encrypted Google OAuth tokens + email
    #   - user_smtp_settings — encrypted SMTP password + host/username
    await session.execute(delete(EmailCampaign).where(EmailCampaign.organization_id == org_id))
    await session.execute(
        delete(GoogleCalendarConnection).where(
            GoogleCalendarConnection.organization_id == org_id
        )
    )
    await session.execute(
        delete(UserSmtpSettings).where(UserSmtpSettings.organization_id == org_id)
    )
    if payment_method is not None:
        await session.execute(delete(PaymentMethod).where(PaymentMethod.organization_id == org_id))

    # 3. Anonymize users in place. Email becomes a per-user noreply address
    #    inside the .invalid TLD (RFC 6761 — guaranteed never deliverable)
    #    so we can keep the unique-email constraint intact.
    users = (
        (await session.execute(select(User).where(User.organization_id == org_id))).scalars().all()
    )
    for u in users:
        u.email = f"deleted-{u.id.hex}@{_ANON_EMAIL_DOMAIN}"
        u.name = _ANON_USER_NAME
        u.avatar_url = None
        u.google_id = None
        u.password_hash = None
        u.is_active = False
        u.can_invite = False
        u.preferences = {}
        u.reports_dashboard_config = {}
        u.email_verified = False
        u.email_verified_at = None
        u.last_login_at = None

    # 4. Anonymize the org row itself. Keep id + created_at so invoices
    #    stay linkable for the accounting window; everything else is wiped.
    short = org.id.hex[:8]
    org.name = f"[Smazaná organizace #{short}]"
    org.ico = None
    org.dic = None
    org.address_street = None
    org.address_city = None
    org.address_zip = None
    org.legal_form = None
    org.billing_name = None
    org.billing_email = None
    org.stripe_customer_id = None
    org.billing_info_reminder_sent_at = None
    org.deleted_at = datetime.now(tz=UTC)

    await session.flush()
    return org
