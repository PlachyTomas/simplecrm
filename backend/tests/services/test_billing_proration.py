"""Table-driven tests for `services/billing.compute_seat_proration`.

The function turns (current contracted seats, target seats, period
start/end, now) into a minor-unit charge. Edge cases that matter for
correctness:

  - delta ≤ 0 → no charge
  - status not 'active' → no charge (trial bumps are free; renewal-time
    bumps go through the renewal flow, not the upgrade flow)
  - is_comp → no charge
  - period dates missing → no charge (defensive — shouldn't happen)
  - period already ended → no charge
  - period starts after `now` (clock skew) → fraction clamped to 1.0
  - half-period mid-cycle → exactly half the per-seat price × delta
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.db.models import Plan, Subscription
from app.services import billing


def _sub(
    *,
    status: str = "active",
    is_comp: bool = False,
    contracted: int = 5,
    seat_count: int = 5,
    plan_code: str = "monthly",
    price_per_user_minor: int | None = 9900,
    override_minor: int | None = None,
    period_start: datetime | None = None,
    period_end: datetime | None = None,
) -> Subscription:
    """Build a detached Subscription for proration math. The fields the
    function actually reads are status / is_comp / contracted_seat_count
    / current_period_starts_at / current_period_ends_at /
    override_price_per_user_minor / plan.price_per_user_minor."""
    sub = Subscription(
        organization_id=uuid.uuid4(),
        plan_id=uuid.uuid4(),
        status=status,
        started_at=datetime.now(tz=UTC),
    )
    sub.is_comp = is_comp
    sub.contracted_seat_count = contracted
    sub.seat_count = seat_count
    sub.override_price_per_user_minor = override_minor
    sub.current_period_starts_at = period_start
    sub.current_period_ends_at = period_end
    sub.plan = Plan(
        code=plan_code,
        display_name_cs=plan_code,
        billing_interval=plan_code,
        price_per_user_minor=price_per_user_minor,
        currency="CZK",
        is_public=True,
        is_active=True,
        sort_order=0,
    )
    return sub


# ---------------------------------------------------------------------------
# Table-driven: each row is (label, kwargs to _sub, target_seats, expected_charge).
# `now` is passed as the same fixed instant the period dates anchor on.
# ---------------------------------------------------------------------------


_NOW = datetime(2026, 6, 1, 12, 0, tzinfo=UTC)


PRORATION_CASES: list[tuple[str, dict, int, int]] = [
    # Mid-period (half remaining) on a monthly plan: 5 → 50, delta 45,
    # 99 Kč/seat × 0.5 = 49.5 minor units per seat × 45 = 222 750.
    (
        "monthly half-period 5→50",
        {
            "period_start": _NOW - timedelta(days=15),
            "period_end": _NOW + timedelta(days=15),
        },
        50,
        222750,
    ),
    # Full period remaining: full price.
    (
        "monthly full-period 5→6",
        {
            "period_start": _NOW,
            "period_end": _NOW + timedelta(days=30),
        },
        6,
        9900,
    ),
    # No-op (target equals current contracted).
    ("no-op", {"period_start": _NOW, "period_end": _NOW + timedelta(days=30)}, 5, 0),
    # Decrease (caller should never hit this path, but the function
    # defensively returns 0).
    (
        "decrease 5→3",
        {"period_start": _NOW, "period_end": _NOW + timedelta(days=30)},
        3,
        0,
    ),
    # Comp org: never charged regardless of target.
    (
        "comp 5→500",
        {
            "is_comp": True,
            "period_start": _NOW,
            "period_end": _NOW + timedelta(days=30),
        },
        500,
        0,
    ),
    # Trial: charge always 0; the upgrade flow only fires for active.
    (
        "trial 5→500",
        {
            "status": "trialing",
            "period_start": _NOW,
            "period_end": _NOW + timedelta(days=30),
        },
        500,
        0,
    ),
    # Period ended: defensive zero (the renewal flow handles next period).
    (
        "period ended",
        {
            "period_start": _NOW - timedelta(days=30),
            "period_end": _NOW - timedelta(days=1),
        },
        50,
        0,
    ),
    # Period dates missing: defensive zero.
    ("no period dates", {}, 50, 0),
    # Override price beats plan price.
    (
        "override price 5→6 full period",
        {
            "override_minor": 7500,
            "period_start": _NOW,
            "period_end": _NOW + timedelta(days=30),
        },
        6,
        7500,
    ),
    # Annual full-period 5→6: 99 900 × 1 seat × 1.0 fraction = 99 900.
    (
        "annual full-period 5→6",
        {
            "plan_code": "annual",
            "price_per_user_minor": 99900,
            "period_start": _NOW,
            "period_end": _NOW + timedelta(days=360),
        },
        6,
        99900,
    ),
    # Annual quarter-remaining 5→10: delta 5, 99 900 × 5 × 0.25 = 124 875.
    (
        "annual quarter-remaining 5→10",
        {
            "plan_code": "annual",
            "price_per_user_minor": 99900,
            "period_start": _NOW - timedelta(days=270),
            "period_end": _NOW + timedelta(days=90),
        },
        10,
        124875,
    ),
    # Almost-zero remaining (1 hour left of a 30-day period). 9900 × 1
    # × (1/720) ≈ 13.75 → rounds to 14 minor.
    (
        "monthly 1-hour remaining 5→6",
        {
            "period_start": _NOW - timedelta(days=30) + timedelta(hours=1),
            "period_end": _NOW + timedelta(hours=1),
        },
        6,
        14,
    ),
    # Plan with a NULL price (e.g. enterprise without override) — defensive 0.
    (
        "plan with NULL price",
        {
            "price_per_user_minor": None,
            "period_start": _NOW,
            "period_end": _NOW + timedelta(days=30),
        },
        50,
        0,
    ),
    # Clock skew: now is BEFORE period_start (shouldn't happen but be
    # safe). days_remaining > period_seconds → fraction clamped to 1.0.
    (
        "clock skew now before period_start",
        {
            "period_start": _NOW + timedelta(hours=1),
            "period_end": _NOW + timedelta(days=30, hours=1),
        },
        6,
        9900,  # full price (clamped fraction = 1.0)
    ),
]


@pytest.mark.parametrize(
    "label,sub_kwargs,target,expected",
    PRORATION_CASES,
    ids=[c[0] for c in PRORATION_CASES],
)
def test_compute_seat_proration(
    label: str, sub_kwargs: dict, target: int, expected: int
) -> None:
    sub = _sub(**sub_kwargs)
    actual = billing.compute_seat_proration(sub, new_seat_count=target, now=_NOW)
    assert actual == expected, (
        f"{label}: expected {expected} minor, got {actual}"
    )
