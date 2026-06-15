"""ORM model re-exports.

Importing this module ensures every model is registered with `Base.metadata`
so Alembic autogenerate can see them. Always add new models here.
"""

from app.db.models.activity import Activity
from app.db.models.auth_action_token import AuthActionToken
from app.db.models.billing_settings import BillingSettings
from app.db.models.blocked_company import BlockedCompany
from app.db.models.calendar_event import CalendarEvent
from app.db.models.charge import Charge
from app.db.models.company import Company
from app.db.models.contact import Contact
from app.db.models.deal import Deal
from app.db.models.email_campaign import EmailCampaign, EmailCampaignRecipient
from app.db.models.enums import (
    ActivityEntityType,
    ActivityType,
    BlockedCompanyReason,
    EmailRecipientStatus,
    GoogleSyncStatus,
    OwnershipChangeReason,
    Region,
    StageType,
    UserRole,
)
from app.db.models.google_calendar_connection import GoogleCalendarConnection
from app.db.models.invitation import Invitation
from app.db.models.invoice import Invoice
from app.db.models.invoice_audit_log import InvoiceAuditLog
from app.db.models.invoice_counter import InvoiceCounter
from app.db.models.invoice_line import InvoiceLine
from app.db.models.organization import Organization
from app.db.models.ownership_history import OwnershipHistory
from app.db.models.payment_method import PaymentMethod
from app.db.models.pipeline import Pipeline
from app.db.models.plan import Plan
from app.db.models.refresh_token import RefreshToken
from app.db.models.stage import Stage
from app.db.models.subscription import Subscription
from app.db.models.super_admin_audit import SuperAdminAction, SuperAdminAuditLog
from app.db.models.team import Team
from app.db.models.user import User
from app.db.models.user_smtp_settings import UserSmtpSettings
from app.db.models.webhook_event import WebhookEvent

__all__ = [
    "Activity",
    "ActivityEntityType",
    "ActivityType",
    "AuthActionToken",
    "BillingSettings",
    "BlockedCompany",
    "BlockedCompanyReason",
    "CalendarEvent",
    "Charge",
    "Company",
    "Contact",
    "Deal",
    "EmailCampaign",
    "EmailCampaignRecipient",
    "EmailRecipientStatus",
    "GoogleCalendarConnection",
    "GoogleSyncStatus",
    "Invitation",
    "Invoice",
    "InvoiceAuditLog",
    "InvoiceCounter",
    "InvoiceLine",
    "Organization",
    "OwnershipChangeReason",
    "OwnershipHistory",
    "PaymentMethod",
    "Pipeline",
    "Plan",
    "RefreshToken",
    "Region",
    "Stage",
    "StageType",
    "Subscription",
    "SuperAdminAction",
    "SuperAdminAuditLog",
    "Team",
    "User",
    "UserRole",
    "UserSmtpSettings",
    "WebhookEvent",
]
