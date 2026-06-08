"""initial-payment-init must 422 when the org's billing details are
incomplete — the server backstop for the mandatory pre-payment form."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select

from app.core.security import create_access_token
from app.db.models import Organization, Plan, Subscription, User, UserRole
from app.db.session import AsyncSessionLocal


@pytest.fixture(autouse=True)
def _comgate_creds(monkeypatch) -> None:
    monkeypatch.setenv("COMGATE_MERCHANT_ID", "1234567")
    monkeypatch.setenv("COMGATE_SECRET", "test-secret")
    from app.core.config import get_settings

    get_settings.cache_clear()
    from app.services import comgate

    comgate.reset_default_client()
    yield
    get_settings.cache_clear()
    comgate.reset_default_client()


async def _admin_id(email: str) -> uuid.UUID:
    async with AsyncSessionLocal() as s:
        return (await s.execute(select(User.id).where(User.email == email))).scalar_one()


async def _seed_trialing_org(*, complete: bool) -> tuple[uuid.UUID, str]:
    async with AsyncSessionLocal() as s:
        org = Organization(
            name="Guard Test Org",
            billing_kind="business" if complete else None,
            ico="27082440" if complete else None,
            address_street="Lidická 1" if complete else None,
            address_city="Brno" if complete else None,
            address_zip="60200" if complete else None,
        )
        s.add(org)
        await s.flush()
        email = f"guard-{uuid.uuid4().hex[:8]}@ex.cz"
        s.add(User(email=email, name="A", role=UserRole.admin, organization_id=org.id))
        monthly = (await s.execute(select(Plan.id).where(Plan.code == "monthly"))).scalar_one()
        s.add(
            Subscription(
                organization_id=org.id,
                plan_id=monthly,
                status="trialing",
                started_at=datetime.now(tz=UTC),
                seat_count=1,
                contracted_seat_count=1,
            )
        )
        await s.commit()
        return org.id, email


async def _cleanup(org_id: uuid.UUID) -> None:
    async with AsyncSessionLocal() as s:
        await s.execute(delete(Organization).where(Organization.id == org_id))
        await s.commit()


async def test_init_payment_422_when_billing_incomplete(client: AsyncClient) -> None:
    org_id, email = await _seed_trialing_org(complete=False)
    try:
        admin_id = await _admin_id(email)
        token = create_access_token(admin_id, org_id, UserRole.admin)
        resp = await client.post(
            "/api/v1/payments/initial-payment-init",
            json={"plan_code": "monthly"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 422, resp.text
        assert resp.json()["detail"]["code"] == "billing_details_required"
    finally:
        await _cleanup(org_id)
