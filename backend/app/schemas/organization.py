from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class OrganizationUpdate(BaseModel):
    """Fields an admin can change on their own organization.

    Every field is optional so that the onboarding form can submit a partial
    update (e.g., IČO + name first, address later) and the settings page can
    patch any subset.
    """

    name: str | None = Field(default=None, min_length=1, max_length=200)
    ico: str | None = Field(default=None, pattern=r"^\d{8}$")
    dic: str | None = Field(default=None, max_length=16)
    address_street: str | None = Field(default=None, max_length=200)
    address_city: str | None = Field(default=None, max_length=120)
    address_zip: str | None = Field(default=None, max_length=12)
    legal_form: str | None = Field(default=None, max_length=120)
    # Distinct legal/billing name (e.g., "Acme s.r.o.") when the org's
    # day-to-day `name` ("Acme team") shouldn't appear on the invoice.
    # Pass an empty string to clear an override and fall back to `name`.
    billing_name: str | None = Field(default=None, max_length=200)
    billing_email: str | None = Field(default=None, max_length=320)
    billing_kind: Literal["business", "individual"] | None = None
    show_leaderboard_to_salespeople: bool | None = None
    # Auto-release window for companies. Bounded to 1..3650 (one day to ten
    # years) — anything wider than ten years would render the auto-release
    # functionally useless.
    ownership_window_days: int | None = Field(default=None, ge=1, le=3650)


class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    ico: str | None = None
    dic: str | None = None
    address_street: str | None = None
    address_city: str | None = None
    address_zip: str | None = None
    legal_form: str | None = None
    billing_name: str | None = None
    billing_email: str | None = None
    billing_kind: Literal["business", "individual"] | None = None
    locale: str
    currency: str
    trial_ends_at: datetime
    stripe_customer_id: str | None = None
    show_leaderboard_to_salespeople: bool
    ownership_window_days: int


SuperAdminActionLiteral = Literal[
    "list_users",
    "view_subscription",
    "view_invoices",
    "view_activity",
    "impersonate",
]


class AdminAccessLogRow(BaseModel):
    """One super-admin action against the caller's org, as shown in
    Settings → Přístup operátora."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    action: SuperAdminActionLiteral
    super_admin_email: str
    target_user_email: str | None
    payload: dict[str, Any]
    created_at: datetime


class AdminAccessLogList(BaseModel):
    items: list[AdminAccessLogRow]
    total: int


class OrganizationEraseIn(BaseModel):
    """GDPR Art. 17 erasure request. `confirmation_name` MUST match the
    organization's current `name` exactly; the route 422s otherwise. UI
    disables the submit button until typed-input matches but the server
    re-checks because UI gates are not authorization."""

    confirmation_name: str = Field(..., min_length=1, max_length=200)


class OrganizationEraseOut(BaseModel):
    organization_id: uuid.UUID
    deleted_at: datetime
