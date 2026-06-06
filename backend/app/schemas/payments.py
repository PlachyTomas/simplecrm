"""Request/response schemas for the customer-facing /payments endpoints.

Distinct from `schemas/billing.py` which holds the Subscription view
shapes. This module is dedicated to the ComGate-backed payment flow:
init endpoints (return a redirect URL), charge list, return URL.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class InitialPaymentInitIn(BaseModel):
    """Body for `POST /payments/initial-payment-init`.

    The customer is choosing their first paid plan; backend computes
    `seat_count * effective_price` and hands them a ComGate hosted-page
    redirect URL.
    """

    plan_code: Literal["monthly", "annual"]


class PaymentInitOut(BaseModel):
    """Response for any `*-init` endpoint that creates a ComGate payment.

    `redirect_url` is the ComGate hosted-page URL the frontend should
    `window.location` to. `charge_id` lets the frontend poll for
    completion if it doesn't want to wait for the return-URL.
    """

    redirect_url: str
    charge_id: uuid.UUID
    amount_minor: int
    currency: str


class DemoOrderIn(BaseModel):
    """Body for `POST /payments/demo-order` (public, unauthenticated).

    Powers the /objednavka gateway showcase that ComGate's review team
    requires. Seats are capped low — this flow never touches billing
    state, so there is no reason to allow large amounts.
    """

    plan_code: Literal["monthly", "annual"]
    seats: int = Field(ge=1, le=25)
    email: EmailStr


class DemoOrderOut(BaseModel):
    """Response for `POST /payments/demo-order`.

    No `charge_id` — demo orders create no DB rows; the frontend just
    redirects to ComGate's hosted page.
    """

    redirect_url: str
    amount_minor: int
    currency: str


class SeatChangeInitIn(BaseModel):
    """Body for `POST /payments/seat-change-init`.

    `seat_count` is the target number of seats. When the target is
    above the current `contracted_seat_count` AND status is 'active',
    the endpoint kicks off a prorated ComGate charge. All other
    transitions (decreases, trial bumps, no-ops) are handled by
    `PUT /subscription/seat-count` directly without this endpoint.
    """

    seat_count: int = Field(ge=1, le=500)


class SeatChangeInitOut(BaseModel):
    """Response for `POST /payments/seat-change-init`.

    `status='accepted'`: ComGate took the charge for processing; the
    final outcome lands via webhook. `charge_id` lets the frontend
    poll `GET /payments/invoices/{id}` for the terminal state.
    """

    status: Literal["accepted"]
    charge_id: uuid.UUID
    amount_minor: int
    currency: str


class ChargeOut(BaseModel):
    """Serialized ComGate charge attempt (renamed from `InvoiceOut`).

    The Czech-law tax-invoice schema is `InvoiceOut` in the `invoicing`
    schema module — distinct concept, distinct shape.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: Literal["initial", "renewal", "seat_upgrade"]
    amount_minor: int
    currency: str
    status: Literal["pending", "paid", "failed", "refunded"]
    seats: int | None = None
    period_starts_at: datetime | None = None
    period_ends_at: datetime | None = None
    failure_reason: str | None = None
    created_at: datetime
    paid_at: datetime | None = None


class ChargeList(BaseModel):
    items: list[ChargeOut]
    total: int
