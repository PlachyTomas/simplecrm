"""Request/response schemas for the customer-facing /payments endpoints.

Distinct from `schemas/billing.py` which holds the Subscription view
shapes. This module is dedicated to the ComGate-backed payment flow:
init endpoints (return a redirect URL), invoice list, return URL.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


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
    `window.location` to. `invoice_id` lets the frontend poll for
    completion if it doesn't want to wait for the return-URL.
    """

    redirect_url: str
    invoice_id: uuid.UUID
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
    final outcome lands via webhook. `invoice_id` lets the frontend
    poll `GET /payments/invoices/{id}` for the terminal state.
    """

    status: Literal["accepted"]
    invoice_id: uuid.UUID
    amount_minor: int
    currency: str


class InvoiceOut(BaseModel):
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


class InvoiceList(BaseModel):
    items: list[InvoiceOut]
    total: int
