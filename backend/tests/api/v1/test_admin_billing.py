"""Integration tests for /api/v1/admin/* (super-admin surface)."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import (
    BillingSettings,
    Organization,
    Plan,
    Subscription,
    SuperAdminAction,
    SuperAdminAuditLog,
    User,
    UserRole,
)
from app.db.session import AsyncSessionLocal

# Mirrors the model/migration server_default for the en invoice-email
# templates (i18n Task 7) — used to reset the singleton row after a test
# edits it, so other tests in this suite stay order-independent.
_DEFAULT_SUBJECT_TEMPLATE_EN = "Invoice {{ number }} — SimpleCRM, due {{ due_date }}"
_DEFAULT_BODY_TEMPLATE_EN = (
    "Hello {{ customer_name }},\n\n"
    "we are sending you invoice **No. {{ number }}** for the period "
    "{{ period_start }} – {{ period_end }}.\n\n"
    "**Total due:** {{ total_display }}\n"
    "**Due date:** {{ due_date }}\n\n"
    "Please send payment by bank transfer:\n\n"
    "- IBAN: {{ issuer_iban }}\n"
    "- Variable symbol: {{ variable_symbol }}\n\n"
    "The easiest way to pay is by scanning the QR code found "
    "directly on the invoice.\n\n"
    "You'll find the invoice PDF attached. To view it in the app, "
    "sign in at simplecrm.cz.\n\n"
    "Best regards,\nSimpleCRM\n"
)


@pytest.fixture
async def owned_emails() -> AsyncIterator[list[str]]:
    tracked: list[str] = []
    yield tracked
    async with AsyncSessionLocal() as session:
        if tracked:
            await session.execute(delete(User).where(User.email.in_(tracked)))
            await session.execute(delete(Organization).where(Organization.name == "Admin Test Org"))
            # Reset fields a test may have mutated back to their defaults —
            # BillingSettings is a shared singleton across the whole suite.
            settings = (await session.execute(select(BillingSettings))).scalar_one()
            settings.is_vat_payer = False
            settings.invoice_email_subject_template_en = _DEFAULT_SUBJECT_TEMPLATE_EN
            settings.invoice_email_body_template_en = _DEFAULT_BODY_TEMPLATE_EN
            await session.commit()


async def _seed_org_with_super_admin(
    session: AsyncSession, owned_emails: list[str], *, super_admin: bool = True
) -> tuple[Organization, User]:
    org = Organization(name="Admin Test Org")
    session.add(org)
    await session.flush()

    email = f"sa-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_emails.append(email)
    user = User(
        email=email,
        name="Super",
        role=UserRole.admin,
        organization_id=org.id,
        is_super_admin=super_admin,
    )
    session.add(user)
    trial_plan_id = (
        await session.execute(select(Plan.id).where(Plan.code == "trial"))
    ).scalar_one()
    sub = Subscription(
        organization_id=org.id,
        plan_id=trial_plan_id,
        status="trialing",
        started_at=org.created_at,
        current_period_ends_at=org.trial_ends_at,
    )
    session.add(sub)
    await session.commit()
    return org, user


# ---------------------------------------------------------------------------
# /admin/organizations
# ---------------------------------------------------------------------------


async def test_list_orgs_super_admin_sees_paginated(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.get(
        "/api/v1/admin/organizations?q=Admin Test Org",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    found = next(item for item in body["items"] if item["name"] == "Admin Test Org")
    assert found["plan_code"] == "trial"
    assert found["status"] == "trialing"


async def test_list_orgs_rejects_non_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, user = await _seed_org_with_super_admin(db_session, owned_emails, super_admin=False)
    token = create_access_token(user.id, user.organization_id, user.role)
    response = await client.get(
        "/api/v1/admin/organizations",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Subscription mutations
# ---------------------------------------------------------------------------


async def test_activate_subscription_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        f"/api/v1/admin/organizations/{org.id}/subscription/activate",
        headers={"Authorization": f"Bearer {token}"},
        json={"plan_code": "monthly"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "active"
    assert body["plan"]["code"] == "monthly"


async def test_activate_enterprise_requires_override_returns_422(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        f"/api/v1/admin/organizations/{org.id}/subscription/activate",
        headers={"Authorization": f"Bearer {token}"},
        json={"plan_code": "enterprise", "period_months": 12},
    )
    assert response.status_code == 422


async def test_set_comp_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        f"/api/v1/admin/organizations/{org.id}/subscription/set-comp",
        headers={"Authorization": f"Bearer {token}"},
        json={"reason": "podcast partnership"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["is_comp"] is True
    assert body["plan"]["code"] == "comp"
    assert body["access_status"] == "comp"


async def test_set_enterprise_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        f"/api/v1/admin/organizations/{org.id}/subscription/set-enterprise",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "override_price_per_user_minor": 49900,
            "period_months": 12,
            "notes": "negotiated",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["plan"]["code"] == "enterprise"
    assert body["effective_price_per_user_minor"] == 49900


async def test_extend_trial_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        f"/api/v1/admin/organizations/{org.id}/subscription/extend-trial",
        headers={"Authorization": f"Bearer {token}"},
        json={"days": 14},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "trialing"


async def test_cancel_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        f"/api/v1/admin/organizations/{org.id}/subscription/cancel",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "canceled"
    assert body["access_status"] == "gated"


async def test_set_comp_rejects_non_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails, super_admin=False)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        f"/api/v1/admin/organizations/{org.id}/subscription/set-comp",
        headers={"Authorization": f"Bearer {token}"},
        json={"reason": "free for friends"},
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# /admin/billing-settings
# ---------------------------------------------------------------------------


async def test_get_billing_settings_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.get(
        "/api/v1/admin/billing-settings",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["is_vat_payer"] is False
    assert body["contact_email"] == "podpora@simplecrm.cz"


async def test_put_billing_settings_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.put(
        "/api/v1/admin/billing-settings",
        headers={"Authorization": f"Bearer {token}"},
        json={"is_vat_payer": True, "seller_iban": "CZ6508000000192000145399"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["is_vat_payer"] is True
    assert body["seller_iban"] == "CZ6508000000192000145399"


async def test_put_billing_settings_rejects_non_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_org_with_super_admin(db_session, owned_emails, super_admin=False)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.put(
        "/api/v1/admin/billing-settings",
        headers={"Authorization": f"Bearer {token}"},
        json={"is_vat_payer": True},
    )
    assert response.status_code == 403


async def test_billing_settings_exposes_issuer_snapshot_fields(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    """The GET endpoint surfaces the new issuer fields so the admin UI can
    populate the edit form. Resets the singleton to known values up-front
    so this test is order-independent against the shared dev DB."""
    _org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    # Reset to known empty defaults — BillingSettings is a singleton that
    # other tests in this suite mutate, so we can't rely on the seeded
    # `server_default = ''` surviving a previous run.
    reset = await client.put(
        "/api/v1/admin/billing-settings",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "issuer_name": "",
            "issuer_address_street": "",
            "issuer_address_city": "",
            "issuer_address_zip": "",
            "issuer_register_text": "",
            "issuer_account_domestic": None,
            "default_payment_term_days": 14,
        },
    )
    assert reset.status_code == 200, reset.text

    response = await client.get(
        "/api/v1/admin/billing-settings",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    # The new fields appear on the wire and round-trip through the schema:
    assert body["issuer_name"] == ""
    assert body["issuer_address_street"] == ""
    assert body["issuer_address_city"] == ""
    assert body["issuer_address_zip"] == ""
    assert body["issuer_register_text"] == ""
    assert body["issuer_account_domestic"] is None
    assert body["default_payment_term_days"] == 14
    # Templates aren't reset by the PUT above — assert the migration's
    # server_default seeded sensible Czech defaults that include the
    # core Jinja variables we'll later interpolate.
    assert body["invoice_email_subject_template"].startswith("Faktura č.")
    assert "Variabilní symbol" in body["invoice_email_body_template"]
    # English counterparts (i18n Task 7) round-trip too, with their own
    # faithful-translation server_default.
    assert body["invoice_email_subject_template_en"].startswith("Invoice ")
    assert "Variable symbol" in body["invoice_email_body_template_en"]


async def test_put_billing_settings_persists_en_template_fields(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    """The two `_en` template fields are exposed on PUT alongside the cs
    ones, and the next GET returns the edited value unchanged."""
    _org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.put(
        "/api/v1/admin/billing-settings",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "invoice_email_subject_template_en": "Invoice {{ number }} is ready",
            "invoice_email_body_template_en": "Hi {{ customer_name }}, thanks!",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["invoice_email_subject_template_en"] == "Invoice {{ number }} is ready"
    assert body["invoice_email_body_template_en"] == "Hi {{ customer_name }}, thanks!"
    # cs templates untouched by this PUT.
    assert body["invoice_email_subject_template"].startswith("Faktura č.")

    get_response = await client.get(
        "/api/v1/admin/billing-settings",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert get_response.status_code == 200
    get_body = get_response.json()
    assert get_body["invoice_email_subject_template_en"] == "Invoice {{ number }} is ready"
    assert get_body["invoice_email_body_template_en"] == "Hi {{ customer_name }}, thanks!"


async def test_put_billing_settings_persists_issuer_fields(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    """Partial PUT updates: the founder fills in their issuer details once
    via the super-admin UI, and the next GET returns them unchanged."""
    _org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.put(
        "/api/v1/admin/billing-settings",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "issuer_name": "Tomáš Plachý",
            "issuer_address_street": "Vinohradská 184",
            "issuer_address_city": "Praha 3",
            "issuer_address_zip": "130 00",
            "issuer_register_text": (
                "Zapsán v živnostenském rejstříku, vedeném Úřadem městské části Praha 3"
            ),
            "issuer_account_domestic": "123456789/0100",
            "default_payment_term_days": 21,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["issuer_name"] == "Tomáš Plachý"
    assert body["issuer_address_street"] == "Vinohradská 184"
    assert body["issuer_address_city"] == "Praha 3"
    assert body["issuer_address_zip"] == "130 00"
    assert "živnostenském rejstříku" in body["issuer_register_text"]
    assert body["issuer_account_domestic"] == "123456789/0100"
    assert body["default_payment_term_days"] == 21
    # Untouched-by-this-PUT fields remain at defaults
    assert body["invoice_email_subject_template"].startswith("Faktura č.")


# ---------------------------------------------------------------------------
# /admin/organizations/:id/activity
# ---------------------------------------------------------------------------


async def test_org_activity_super_admin_returns_subscription_rows(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    # Generate at least one subscription Activity row by exercising a
    # mutation. set-comp writes an Activity row per BillingService.
    set_comp = await client.post(
        f"/api/v1/admin/organizations/{org.id}/subscription/set-comp",
        headers={"Authorization": f"Bearer {token}"},
        json={"reason": "free for the test"},
    )
    assert set_comp.status_code == 200

    response = await client.get(
        f"/api/v1/admin/organizations/{org.id}/activity",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    assert len(body["items"]) >= 1
    row = body["items"][0]
    assert "activity_type" in row
    assert "payload" in row
    assert "created_at" in row
    assert row["actor"] is not None
    assert row["actor"]["id"] == str(admin.id)


async def test_org_activity_rejects_non_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, user = await _seed_org_with_super_admin(db_session, owned_emails, super_admin=False)
    token = create_access_token(user.id, user.organization_id, user.role)
    response = await client.get(
        f"/api/v1/admin/organizations/{org.id}/activity",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


async def test_org_activity_respects_pagination(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    # Two writes → two activity rows.
    for days in (10, 20):
        await client.post(
            f"/api/v1/admin/organizations/{org.id}/subscription/extend-trial",
            headers={"Authorization": f"Bearer {token}"},
            json={"days": days},
        )
    response = await client.get(
        f"/api/v1/admin/organizations/{org.id}/activity?limit=1&offset=0",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 2
    assert len(body["items"]) == 1


async def test_activate_applies_queued_user_deactivations(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    """Queued downsize from PUT /seat-count gets applied at activation:
    queued users flip is_active=False, seat_count drops to pending_seat_count,
    pending fields clear."""
    from sqlalchemy import select as _select

    from app.db.models import Subscription
    from app.db.models import User as _User

    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    # Capture ids before any expire_all() calls; accessing org.id from a
    # sync context after expiration triggers a MissingGreenlet.
    org_id = org.id
    extra_email = f"x-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_emails.append(extra_email)
    db_session.add(
        _User(
            email=extra_email,
            name="Extra",
            role=UserRole.salesperson,
            organization_id=org_id,
        )
    )
    await db_session.commit()
    extra_id = (
        await db_session.execute(_select(_User.id).where(_User.email == extra_email))
    ).scalar_one()

    token = create_access_token(admin.id, admin.organization_id, admin.role)

    # Bump to 2 then queue a downsize back to 1 with extra as the victim.
    await client.put(
        "/api/v1/organizations/current/subscription/seat-count",
        headers={"Authorization": f"Bearer {token}"},
        json={"seat_count": 2},
    )
    await client.put(
        "/api/v1/organizations/current/subscription/seat-count",
        headers={"Authorization": f"Bearer {token}"},
        json={"seat_count": 1, "deactivate_user_ids": [str(extra_id)]},
    )

    # Sanity: extra is still active, queue is set.
    db_session.expire_all()
    extra = (await db_session.execute(_select(_User).where(_User.id == extra_id))).scalar_one()
    assert extra.is_active is True

    # Activate the subscription (super-admin path).
    activate = await client.post(
        f"/api/v1/admin/organizations/{org_id}/subscription/activate",
        headers={"Authorization": f"Bearer {token}"},
        json={"plan_code": "monthly"},
    )
    assert activate.status_code == 200, activate.text
    body = activate.json()
    assert body["seat_count"] == 1
    assert body["pending_seat_count"] is None
    assert body["pending_user_deactivations"] is None

    db_session.expire_all()
    extra_after = (
        await db_session.execute(_select(_User).where(_User.id == extra_id))
    ).scalar_one()
    assert extra_after.is_active is False

    # Sanity check the Subscription row itself reflects the same.
    sub = (
        await db_session.execute(
            _select(Subscription).where(Subscription.organization_id == org_id)
        )
    ).scalar_one()
    assert sub.seat_count == 1
    assert sub.pending_seat_count is None
    assert sub.pending_user_deactivations is None


# ---------------------------------------------------------------------------
# Impersonation
# ---------------------------------------------------------------------------


async def _add_member(
    session: AsyncSession,
    org: Organization,
    owned_emails: list[str],
    *,
    is_super_admin: bool = False,
    is_active: bool = True,
    role: UserRole = UserRole.salesperson,
) -> User:
    email = f"member-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_emails.append(email)
    user = User(
        email=email,
        name="Member",
        role=role,
        organization_id=org.id,
        is_super_admin=is_super_admin,
        is_active=is_active,
    )
    session.add(user)
    await session.commit()
    return user


async def test_list_org_users_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    member = await _add_member(db_session, org, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.get(
        f"/api/v1/admin/organizations/{org.id}/users",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    emails = [u["email"] for u in response.json()["items"]]
    assert admin.email in emails
    assert member.email in emails


async def test_list_org_users_rejects_non_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, user = await _seed_org_with_super_admin(db_session, owned_emails, super_admin=False)
    token = create_access_token(user.id, user.organization_id, user.role)
    response = await client.get(
        f"/api/v1/admin/organizations/{org.id}/users",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


async def test_impersonate_super_admin_mints_token_for_target(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    from app.core.security import decode_token

    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    member = await _add_member(db_session, org, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        f"/api/v1/admin/users/{member.id}/impersonate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["user_id"] == str(member.id)
    assert body["email"] == member.email
    # Token decodes to the target user, not the calling super-admin.
    payload = decode_token(body["access_token"])
    assert payload["sub"] == str(member.id)
    # No refresh cookie is set — super-admin keeps their own session.
    assert "set-cookie" not in {h.lower() for h in response.headers}


async def test_impersonate_rejects_non_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, user = await _seed_org_with_super_admin(db_session, owned_emails, super_admin=False)
    member = await _add_member(db_session, org, owned_emails)
    token = create_access_token(user.id, user.organization_id, user.role)
    response = await client.post(
        f"/api/v1/admin/users/{member.id}/impersonate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


async def test_impersonate_refuses_other_super_admin(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    other_admin = await _add_member(db_session, org, owned_emails, is_super_admin=True)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        f"/api/v1/admin/users/{other_admin.id}/impersonate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


async def test_impersonate_inactive_user_returns_422(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    inactive = await _add_member(db_session, org, owned_emails, is_active=False)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        f"/api/v1/admin/users/{inactive.id}/impersonate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 422


async def test_impersonate_unknown_user_returns_404(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    _org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    response = await client.post(
        f"/api/v1/admin/users/{uuid.uuid4()}/impersonate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Super-admin audit log persistence
# ---------------------------------------------------------------------------


async def _audit_rows(session: AsyncSession, org_id: uuid.UUID) -> list[SuperAdminAuditLog]:
    return list(
        (
            await session.execute(
                select(SuperAdminAuditLog)
                .where(SuperAdminAuditLog.target_organization_id == org_id)
                .order_by(SuperAdminAuditLog.created_at)
            )
        )
        .scalars()
        .all()
    )


async def test_audit_logged_on_impersonate(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    member = await _add_member(db_session, org, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    resp = await client.post(
        f"/api/v1/admin/users/{member.id}/impersonate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200

    rows = await _audit_rows(db_session, org.id)
    impersonations = [r for r in rows if r.action is SuperAdminAction.impersonate]
    assert len(impersonations) == 1
    row = impersonations[0]
    assert row.super_admin_user_id == admin.id
    assert row.super_admin_email == admin.email
    assert row.target_user_id == member.id
    assert row.target_user_email == member.email
    assert row.payload == {"target_role": member.role.value}


async def test_audit_logged_on_list_users_view_invoices_activity_subscription(
    client: AsyncClient, db_session: AsyncSession, owned_emails: list[str]
) -> None:
    org, admin = await _seed_org_with_super_admin(db_session, owned_emails)
    token = create_access_token(admin.id, admin.organization_id, admin.role)
    headers = {"Authorization": f"Bearer {token}"}

    assert (
        await client.get(f"/api/v1/admin/organizations/{org.id}/users", headers=headers)
    ).status_code == 200
    assert (
        await client.get(f"/api/v1/admin/organizations/{org.id}/invoices", headers=headers)
    ).status_code == 200
    assert (
        await client.get(f"/api/v1/admin/organizations/{org.id}/activity", headers=headers)
    ).status_code == 200
    assert (
        await client.get(f"/api/v1/admin/organizations/{org.id}", headers=headers)
    ).status_code == 200

    rows = await _audit_rows(db_session, org.id)
    actions = sorted(r.action for r in rows)
    assert SuperAdminAction.list_users in actions
    assert SuperAdminAction.view_invoices in actions
    assert SuperAdminAction.view_activity in actions
    assert SuperAdminAction.view_subscription in actions
