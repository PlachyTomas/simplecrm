"""ORM model re-exports.

Importing this module ensures every model is registered with `Base.metadata`
so Alembic autogenerate can see them. Always add new models here.
"""

from app.db.models.activity import Activity
from app.db.models.billing_settings import BillingSettings
from app.db.models.company import Company
from app.db.models.contact import Contact
from app.db.models.deal import Deal
from app.db.models.enums import (
    ActivityEntityType,
    ActivityType,
    OwnershipChangeReason,
    Region,
    StageType,
    UserRole,
)
from app.db.models.invitation import Invitation
from app.db.models.invoice import Invoice
from app.db.models.organization import Organization
from app.db.models.ownership_history import OwnershipHistory
from app.db.models.payment_method import PaymentMethod
from app.db.models.pipeline import Pipeline
from app.db.models.plan import Plan
from app.db.models.refresh_token import RefreshToken
from app.db.models.stage import Stage
from app.db.models.subscription import Subscription
from app.db.models.team import Team
from app.db.models.user import User
from app.db.models.webhook_event import WebhookEvent

__all__ = [
    "Activity",
    "ActivityEntityType",
    "ActivityType",
    "BillingSettings",
    "Company",
    "Contact",
    "Deal",
    "Invitation",
    "Invoice",
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
    "Team",
    "User",
    "UserRole",
    "WebhookEvent",
]
