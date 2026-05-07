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
    # Contracted seats and any queued change applied at the next period
    # rollover (or trial expiry).
    seat_count: int = 1
    # The seat count last blessed by a successful payment (or, during
    # trial, the value the admin self-set). Drives the seat-cap gate in
    # PUT /subscription/seat-count: increases above this on an active
    # org require routing through ComGate.
    contracted_seat_count: int = 1
    pending_plan: PlanOut | None = None
    pending_seat_count: int | None = None
    # User IDs queued to lose access at next period rollover. Drives the
    # "Deaktivace naplánovaná na DD.MM.RR" pill in Settings → Uživatelé
    # and the "Naplánovaná změna" banner in Settings → Organizace.
    pending_user_deactivations: list[uuid.UUID] | None = None
    # Computed at the API edge:
    effective_price_per_user_minor: int | None = None
    access_status: str
    """One of: trialing | active | grace | gated | comp."""


class ChoosePlanIn(BaseModel):
    plan_code: Literal["monthly", "annual"]


class UpdateSeatCountIn(BaseModel):
    """Body for `PUT /subscription/seat-count`. The admin sends a target
    seat count and, when reducing below the current active-user count, a
    list of users to deactivate. The list length must be exactly
    `(current_active − new_seat_count)`.
    """

    seat_count: int = Field(ge=1, le=500)
    deactivate_user_ids: list[uuid.UUID] = Field(default_factory=list)


class ChangeIntervalIn(BaseModel):
    """Body for `POST /subscription/change-interval`. Stored as
    `Subscription.pending_plan_id`; the existing super-admin Aktivovat
    path applies it on period rollover.
    """

    plan_code: Literal["monthly", "annual"]


class CancelSelfServeIn(BaseModel):
    """Body for `POST /subscription/cancel`. Optional free-form reason
    is stored in the Activity audit row for support follow-up.
    """

    reason: str | None = Field(default=None, max_length=2000)


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


class BillingSettingsPublic(BaseModel):
    """Public-readable subset — backs the marketing pricing page's PriceDisplay
    so unauthenticated visitors see correct DPH copy without exposing IBAN/IČO.
    """

    model_config = ConfigDict(from_attributes=True)

    is_vat_payer: bool
    vat_rate_percent: Decimal
    contact_email: str


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


# ---------------------------------------------------------------------------
# Admin activity timeline (subscription history for the detail drawer)
# ---------------------------------------------------------------------------


class AdminActivityActor(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str


class AdminActivityRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    activity_type: str
    payload: dict
    created_at: datetime
    # Null when the actor user was deleted (the FK is ON DELETE SET NULL).
    actor: AdminActivityActor | None = None


class AdminActivityList(BaseModel):
    items: list[AdminActivityRow]
    total: int


# ---------------------------------------------------------------------------
# Admin org-members + impersonation
# ---------------------------------------------------------------------------


class AdminOrgUserRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    name: str
    role: str
    is_active: bool
    is_super_admin: bool
    last_login_at: datetime | None


class AdminOrgUserList(BaseModel):
    items: list[AdminOrgUserRow]


class ImpersonateOut(BaseModel):
    """Returned by `POST /admin/users/{id}/impersonate`. Carries an access
    token minted for the target user — but no refresh cookie is set, so
    the calling super-admin's own refresh cookie remains intact and a
    page reload restores their session.
    """

    access_token: str
    user_id: uuid.UUID
    email: str
