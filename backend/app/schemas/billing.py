"""Pydantic schemas for the billing surface (plans / subscriptions / settings)."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# Plan
# ---------------------------------------------------------------------------


class PlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    display_name_cs: str
    description_cs: str | None = None
    billing_interval: str
    price_per_user_minor: int | None
    currency: str
    is_public: bool
    is_active: bool
    sort_order: int
    trial_days: int | None = None


class PublicPlanOut(PlanOut):
    """A public-pricing-page entry. Includes derived savings vs monthly so the
    frontend doesn't recompute the math.
    """

    monthly_equivalent_minor: int | None = None
    savings_minor: int | None = None
    savings_percent: float | None = None


# ---------------------------------------------------------------------------
# Subscription
# ---------------------------------------------------------------------------


SubscriptionStatus = Literal[
    "trialing", "pending_activation", "active", "past_due", "canceled"
]


class SubscriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    plan: PlanOut
    status: SubscriptionStatus
    started_at: datetime
    current_period_starts_at: datetime | None
    current_period_ends_at: datetime | None
    canceled_at: datetime | None
    override_price_per_user_minor: int | None
    is_comp: bool
    comp_reason: str | None
    notes: str | None
    # Computed at the API edge:
    effective_price_per_user_minor: int | None = None
    access_status: str
    """One of: trialing | active | grace | gated | comp."""


class ChoosePlanIn(BaseModel):
    plan_code: Literal["monthly", "annual"]


class ContactEnterpriseIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    expected_users: int = Field(ge=1, le=10000)


# ---------------------------------------------------------------------------
# Admin (super-admin only)
# ---------------------------------------------------------------------------


class ActivateSubscriptionIn(BaseModel):
    plan_code: Literal["monthly", "annual", "enterprise"]
    override_price_per_user_minor: int | None = Field(default=None, ge=0)
    period_months: int | None = Field(default=None, ge=1, le=120)


class SetCompIn(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)
    ends_at: datetime | None = None


class SetEnterpriseIn(BaseModel):
    override_price_per_user_minor: int = Field(ge=0)
    period_months: int = Field(ge=1, le=120)
    notes: str | None = Field(default=None, max_length=2000)


class ExtendTrialIn(BaseModel):
    days: int = Field(ge=1, le=365)


class CancelSubscriptionIn(BaseModel):
    effective_at: datetime | None = None


# ---------------------------------------------------------------------------
# Billing summary (the read used by the in-app pricing/settings surface)
# ---------------------------------------------------------------------------


class BillingSummary(BaseModel):
    organization_id: uuid.UUID
    user_count: int
    effective_price_per_user_minor: int | None
    monthly_total_minor: int | None
    monthly_total_with_vat_minor: int | None
    annual_total_minor: int | None
    annual_total_with_vat_minor: int | None
    savings_minor: int | None
    savings_percent: float | None
    is_vat_payer: bool
    vat_rate_percent: Decimal


# ---------------------------------------------------------------------------
# Billing settings (singleton)
# ---------------------------------------------------------------------------


class BillingSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    is_vat_payer: bool
    vat_rate_percent: Decimal
    seller_iban: str | None
    seller_ico: str | None
    contact_email: str
    updated_at: datetime


class BillingSettingsUpdate(BaseModel):
    is_vat_payer: bool | None = None
    vat_rate_percent: Decimal | None = Field(default=None, ge=Decimal("0"), le=Decimal("100"))
    seller_iban: str | None = Field(default=None, max_length=34)
    seller_ico: str | None = Field(default=None, max_length=8)
    contact_email: str | None = Field(default=None, max_length=120)


# ---------------------------------------------------------------------------
# Admin org list
# ---------------------------------------------------------------------------


class AdminOrgRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    plan_code: str
    plan_display: str
    status: SubscriptionStatus
    is_comp: bool
    user_count: int
    trial_ends_at: datetime
    current_period_ends_at: datetime | None
    last_activity_at: datetime | None


class AdminOrgList(BaseModel):
    items: list[AdminOrgRow]
    total: int
