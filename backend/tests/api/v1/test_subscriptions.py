"""Integration tests for /api/v1/plans/* and the org-scoped subscription
endpoints under /api/v1/organizations/current/subscription/*.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import Organization, Plan, Subscription, User, UserRole
from app.db.session import AsyncSessionLocal


@pytest.fixture
async def owned_emails() -> AsyncIterator[list[str]]:
    tracked: list[str] = []
    yield tracked
    async with AsyncSessionLocal() as session:
        if tracked:
            await session.execute(delete(User).where(User.email.in_(tracked)))
            await session.execute(delete(Organization).where(Organization.name == "Sub Test Org"))
            await session.commit()


async def _seed_org_with_admin(
    session: AsyncSession, owned_emails: list[str]
) -> tuple[Organization, User]:
    org = Organization(name="Sub Test Org")
    session.add(org)
    await session.flush()

    email = f"a-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_emails.append(email)
    admin = User(email=email, name="Admin", role=UserRole.admin, organization_id=org.id)
    session.add(admin)
    await session.flush()

    trial_plan_id = (
        await session.execute(select(Plan.id).where(Plan.code == "trial"))
    ).scalar_one()
    sub = Subscription(
        organization_id=org.id,
        plan_id=trial_plan_id,
        status="trialing",
        started_at=org.created_at,
        current_period_starts_at=org.created_at,
        current_period_ends_at=org.trial_ends_at,
    )
    session.add(sub)
    await session.commit()
    await session.refresh(admin, attribute_names=["organization"])
    return org, admin


# ---------------------------------------------------------------------------
# /plans/public
# ---------------------------------------------------------------------------


async def test_public_plans_no_auth_returns_monthly_and_annual(
    client: AsyncClient,
) -> None:
    response = await client.get("/api/v1/plans/public")
    assert response.status_code == 200
    body = response.json()
    codes = {p["code"] for p in body}
    assert codes == {"monthly", "annual"}
    annual = next(p for p in body if p["code"] == "annual")
    assert annual["monthly_equivalent_minor"] == 9900 * 12
    assert annual["savings_minor"] == 9900 * 12 - 99900


# ---------------------------------------------------------------------------
# /organizations/current/subscription
# ---------------------------------------------------------------------------


async def test_get_current_subscription(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_org_with_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.get(
        "/api/v1/organizations/current/subscription",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "trialing"
    assert body["plan"]["code"] == "trial"
    assert body["access_status"] == "trialing"


async def test_billing_summary_returns_user_count_and_monthly(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_org_with_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.get(
        "/api/v1/organizations/current/billing-summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["user_count"] == 1
    assert body["is_vat_payer"] is False
    # Effective price for trial is 0 → monthly_total 0
    assert body["effective_price_per_user_minor"] == 0


# ---------------------------------------------------------------------------
# Choose-plan
# ---------------------------------------------------------------------------


async def test_choose_plan_admin_marks_pending(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_org_with_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        "/api/v1/organizations/current/subscription/choose-plan",
        headers={"Authorization": f"Bearer {token}"},
        json={"plan_code": "annual"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "pending_activation"
    assert body["plan"]["code"] == "annual"
    assert body["access_status"] == "gated"  # pending denies access


async def test_choose_plan_rejects_invalid_code(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_org_with_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        "/api/v1/organizations/current/subscription/choose-plan",
        headers={"Authorization": f"Bearer {token}"},
        json={"plan_code": "enterprise"},
    )
    # Pydantic Literal validation kicks in before the service is called.
    assert response.status_code == 422


async def test_choose_plan_rejects_non_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org = Organization(name="Sub Test Org")
    db_session.add(org)
    await db_session.flush()
    email = f"sp-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_emails.append(email)
    salesperson = User(email=email, name="Sales", role=UserRole.salesperson, organization_id=org.id)
    db_session.add(salesperson)
    trial_plan_id = (
        await db_session.execute(select(Plan.id).where(Plan.code == "trial"))
    ).scalar_one()
    db_session.add(
        Subscription(
            organization_id=org.id,
            plan_id=trial_plan_id,
            status="trialing",
            started_at=org.created_at,
            current_period_ends_at=org.trial_ends_at,
        )
    )
    await db_session.commit()

    token = create_access_token(salesperson.id, salesperson.organization_id, salesperson.role)
    response = await client.post(
        "/api/v1/organizations/current/subscription/choose-plan",
        headers={"Authorization": f"Bearer {token}"},
        json={"plan_code": "annual"},
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Contact-enterprise
# ---------------------------------------------------------------------------


async def test_contact_enterprise_returns_queued(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_org_with_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        "/api/v1/organizations/current/subscription/contact-enterprise",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "30 sales seats, custom SLA", "expected_users": 30},
    )
    assert response.status_code == 202
    assert response.json()["status"] == "queued"


# ---------------------------------------------------------------------------
# Seat count + change-interval (added with the billing-management work)
# ---------------------------------------------------------------------------


async def test_seat_count_increase_persists(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_org_with_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.put(
        "/api/v1/organizations/current/subscription/seat-count",
        headers={"Authorization": f"Bearer {token}"},
        json={"seat_count": 25},
    )
    assert response.status_code == 200, response.text
    assert response.json()["seat_count"] == 25


async def test_seat_count_decrease_below_active_requires_deactivations(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    """3 active users → request seat_count=2 with no deactivate_user_ids → 422."""
    from app.db.models import User as _User

    org, admin = await _seed_org_with_admin(db_session, owned_emails)
    second_email = f"b-{uuid.uuid4().hex[:8]}@ex.cz"
    third_email = f"c-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_emails.extend([second_email, third_email])
    db_session.add_all(
        [
            _User(
                email=second_email, name="Second", role=UserRole.salesperson, organization_id=org.id
            ),
            _User(
                email=third_email, name="Third", role=UserRole.salesperson, organization_id=org.id
            ),
        ]
    )
    await db_session.commit()
    token = create_access_token(admin.id, admin.organization_id, admin.role)

    # First bump seats to 3 so the org isn't already over-cap.
    bump = await client.put(
        "/api/v1/organizations/current/subscription/seat-count",
        headers={"Authorization": f"Bearer {token}"},
        json={"seat_count": 3},
    )
    assert bump.status_code == 200

    # Now try to drop to 2 without picking who loses access → 422.
    no_picks = await client.put(
        "/api/v1/organizations/current/subscription/seat-count",
        headers={"Authorization": f"Bearer {token}"},
        json={"seat_count": 2},
    )
    assert no_picks.status_code == 422
    assert no_picks.json()["detail"]["code"] == "deactivation_count_mismatch"

    # Pick one user to deactivate → 200; the deactivation is QUEUED.
    # is_active stays True until the rollover service applies the queue.
    second_id = (
        await db_session.execute(select(_User.id).where(_User.email == second_email))
    ).scalar_one()
    ok = await client.put(
        "/api/v1/organizations/current/subscription/seat-count",
        headers={"Authorization": f"Bearer {token}"},
        json={"seat_count": 2, "deactivate_user_ids": [str(second_id)]},
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    # The contracted seat_count stays at 3 this period; the queue carries
    # the target (2) and the picked victim (second).
    assert body["seat_count"] == 3
    assert body["pending_seat_count"] == 2
    assert body["pending_user_deactivations"] == [str(second_id)]
    db_session.expire_all()
    second = (await db_session.execute(select(_User).where(_User.id == second_id))).scalar_one()
    assert second.is_active is True


async def test_seat_count_cancel_clears_pending_queue(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    """Re-PUT with target == current seat_count clears pending fields."""
    from app.db.models import User as _User

    org, admin = await _seed_org_with_admin(db_session, owned_emails)
    other_email = f"b-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_emails.append(other_email)
    db_session.add(
        _User(email=other_email, name="Other", role=UserRole.salesperson, organization_id=org.id)
    )
    await db_session.commit()
    token = create_access_token(admin.id, admin.organization_id, admin.role)

    # Bump to 2, then queue a downsize back to 1.
    await client.put(
        "/api/v1/organizations/current/subscription/seat-count",
        headers={"Authorization": f"Bearer {token}"},
        json={"seat_count": 2},
    )
    other_id = (
        await db_session.execute(select(_User.id).where(_User.email == other_email))
    ).scalar_one()
    await client.put(
        "/api/v1/organizations/current/subscription/seat-count",
        headers={"Authorization": f"Bearer {token}"},
        json={"seat_count": 1, "deactivate_user_ids": [str(other_id)]},
    )

    # Cancel: target == current seat_count (2). Should clear pending fields.
    cancel = await client.put(
        "/api/v1/organizations/current/subscription/seat-count",
        headers={"Authorization": f"Bearer {token}"},
        json={"seat_count": 2},
    )
    assert cancel.status_code == 200, cancel.text
    body = cancel.json()
    assert body["seat_count"] == 2
    assert body["pending_seat_count"] is None
    assert body["pending_user_deactivations"] is None


async def test_seat_count_increase_clears_pending_queue(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    """Raising seats above the queued target drops the queue."""
    from app.db.models import User as _User

    org, admin = await _seed_org_with_admin(db_session, owned_emails)
    other_email = f"b-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_emails.append(other_email)
    db_session.add(
        _User(email=other_email, name="Other", role=UserRole.salesperson, organization_id=org.id)
    )
    await db_session.commit()
    token = create_access_token(admin.id, admin.organization_id, admin.role)

    await client.put(
        "/api/v1/organizations/current/subscription/seat-count",
        headers={"Authorization": f"Bearer {token}"},
        json={"seat_count": 2},
    )
    other_id = (
        await db_session.execute(select(_User.id).where(_User.email == other_email))
    ).scalar_one()
    await client.put(
        "/api/v1/organizations/current/subscription/seat-count",
        headers={"Authorization": f"Bearer {token}"},
        json={"seat_count": 1, "deactivate_user_ids": [str(other_id)]},
    )

    # Now raise to 5 → seat_count immediately becomes 5; queue clears.
    raise_resp = await client.put(
        "/api/v1/organizations/current/subscription/seat-count",
        headers={"Authorization": f"Bearer {token}"},
        json={"seat_count": 5},
    )
    assert raise_resp.status_code == 200
    body = raise_resp.json()
    assert body["seat_count"] == 5
    assert body["pending_seat_count"] is None
    assert body["pending_user_deactivations"] is None


async def test_change_interval_queues_pending_plan(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_org_with_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        "/api/v1/organizations/current/subscription/change-interval",
        headers={"Authorization": f"Bearer {token}"},
        json={"plan_code": "annual"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["pending_plan"]["code"] == "annual"
    # Current plan untouched — only the queued one changes.
    assert body["plan"]["code"] == "trial"


async def test_seat_count_rejects_self_deactivation(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_org_with_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.put(
        "/api/v1/organizations/current/subscription/seat-count",
        headers={"Authorization": f"Bearer {token}"},
        json={"seat_count": 0, "deactivate_user_ids": [str(admin.id)]},
    )
    # seat_count=0 is below ge=1; pydantic rejects with 422 before our checks.
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Seat-cap gate (Finding 1 from 2026-05-03 adversary report)
#
# These cover the post-ComGate seat-count gate: trial bumps stay free,
# within-contract re-raises stay free, but mid-period upgrades on an
# active subscription require routing through /payments/seat-change-init
# (i.e. paying the prorated charge via ComGate).
# ---------------------------------------------------------------------------


async def _promote_to_active(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    seat_count: int,
    contracted_seat_count: int,
) -> None:
    """Test helper: flip a freshly-seeded trialing org to active with
    the given paid baseline, using ORM-style mutation to stay
    compatible with the conftest's outer-transaction fixture."""
    sub = (
        await session.execute(select(Subscription).where(Subscription.organization_id == org_id))
    ).scalar_one()
    sub.status = "active"
    sub.seat_count = seat_count
    sub.contracted_seat_count = contracted_seat_count
    await session.commit()


async def test_seat_count_active_blocked_above_contracted(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    """Repro of adversary-test Finding 1: org admin on an active paid
    subscription tries to bump seat_count well above their contracted
    cap. Must 402 with a redirect_endpoint pointing at the payments
    init flow; seat_count stays unchanged in the DB."""
    org, admin = await _seed_org_with_admin(db_session, owned_emails)
    await _promote_to_active(db_session, org_id=org.id, seat_count=5, contracted_seat_count=5)

    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.put(
        "/api/v1/organizations/current/subscription/seat-count",
        headers={"Authorization": f"Bearer {token}"},
        json={"seat_count": 500},
    )
    assert response.status_code == 402, response.text
    body = response.json()["detail"]
    assert body["code"] == "seat_upgrade_payment_required"
    assert body["contracted_seat_count"] == 5
    assert body["redirect_endpoint"] == "/api/v1/payments/seat-change-init"

    # Confirm the DB is untouched — the spike never landed. Read via a
    # fresh GET (the conftest's outer-transaction fixture doesn't play
    # nicely with raw post-mutation queries on the same session).
    state = await client.get(
        "/api/v1/organizations/current/subscription",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert state.status_code == 200
    state_body = state.json()
    assert state_body["seat_count"] == 5
    assert state_body["contracted_seat_count"] == 5


async def test_seat_count_active_within_contracted_allowed(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    """Active org can raise seat_count back up to (but not above)
    contracted_seat_count without payment — they're un-queueing a
    downsize or staying within their paid baseline."""
    org, admin = await _seed_org_with_admin(db_session, owned_emails)
    await _promote_to_active(db_session, org_id=org.id, seat_count=2, contracted_seat_count=10)

    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.put(
        "/api/v1/organizations/current/subscription/seat-count",
        headers={"Authorization": f"Bearer {token}"},
        json={"seat_count": 10},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["seat_count"] == 10
    assert body["contracted_seat_count"] == 10


async def test_seat_count_trial_bump_lifts_contracted(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    """Trial admin can play the slider freely (per user-stated intent);
    the contracted_seat_count tracks the new high so it's locked in at
    the first activation."""
    _org, admin = await _seed_org_with_admin(db_session, owned_emails)  # status=trialing
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.put(
        "/api/v1/organizations/current/subscription/seat-count",
        headers={"Authorization": f"Bearer {token}"},
        json={"seat_count": 500},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["seat_count"] == 500
    assert body["contracted_seat_count"] == 500


async def _set_plan_and_period(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    plan_code: str,
    period_days_remaining: int,
    is_comp: bool = False,
) -> None:
    """Test helper: switch the org's subscription onto a real paid plan
    with a fixed period-end window. Mirrors the post-activation state
    so cancel/reactivate flows can be exercised."""
    from datetime import UTC, datetime, timedelta

    plan_id = (await session.execute(select(Plan.id).where(Plan.code == plan_code))).scalar_one()
    sub = (
        await session.execute(select(Subscription).where(Subscription.organization_id == org_id))
    ).scalar_one()
    sub.plan_id = plan_id
    sub.status = "active"
    sub.is_comp = is_comp
    sub.current_period_ends_at = datetime.now(tz=UTC) + timedelta(days=period_days_remaining)
    await session.commit()


async def test_self_serve_cancel_keeps_access_through_period(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    """Cancel sets status=canceled but doesn't immediately revoke access —
    the customer keeps using the app through current_period_ends_at."""
    org, admin = await _seed_org_with_admin(db_session, owned_emails)
    await _set_plan_and_period(
        db_session,
        org_id=org.id,
        plan_code="monthly",
        period_days_remaining=20,
    )

    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        "/api/v1/organizations/current/subscription/cancel",
        headers={"Authorization": f"Bearer {token}"},
        json={"reason": "Found a competitor"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    # Status stays 'active' through the period; `canceled_at` carries
    # the cancel intent. The eventual period-rollover job flips status
    # to 'canceled' at current_period_ends_at.
    assert body["status"] == "active"
    assert body["canceled_at"] is not None
    assert body["access_status"] == "active"


async def test_self_serve_cancel_rejects_comp_org(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    """Comp orgs are managed by the founder — self-serve cancel 422s."""
    org, admin = await _seed_org_with_admin(db_session, owned_emails)
    await _set_plan_and_period(
        db_session,
        org_id=org.id,
        plan_code="comp",
        period_days_remaining=30,
        is_comp=True,
    )

    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        "/api/v1/organizations/current/subscription/cancel",
        headers={"Authorization": f"Bearer {token}"},
        json={"reason": None},
    )
    assert response.status_code == 422
    assert "comp" in response.json()["detail"].lower()


async def test_self_serve_reactivate_restores_active(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    """Cancel → reactivate before period ends flips status back to active."""
    org, admin = await _seed_org_with_admin(db_session, owned_emails)
    await _set_plan_and_period(
        db_session,
        org_id=org.id,
        plan_code="monthly",
        period_days_remaining=10,
    )

    token = create_access_token(admin.id, admin.organization_id, admin.role)
    cancel_resp = await client.post(
        "/api/v1/organizations/current/subscription/cancel",
        headers={"Authorization": f"Bearer {token}"},
        json={"reason": "test"},
    )
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["canceled_at"] is not None

    reactivate_resp = await client.post(
        "/api/v1/organizations/current/subscription/reactivate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert reactivate_resp.status_code == 200, reactivate_resp.text
    assert reactivate_resp.json()["status"] == "active"
    assert reactivate_resp.json()["canceled_at"] is None
