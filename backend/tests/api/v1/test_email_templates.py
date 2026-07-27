"""Integration tests for /api/v1/email-templates (feature F2).

Endpoint commits escape the rollback fixture, so each test seeds
UUID-suffixed data and tears down via `owned_cleanup` (deleting the org
cascades to its users and templates).
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import EmailTemplate, Organization, User, UserRole
from app.db.session import AsyncSessionLocal
from app.services.merge_fields import DEAL_MERGE_FIELD_KEYS, MERGE_FIELD_KEYS


@pytest.fixture
async def owned_cleanup() -> AsyncIterator[dict[str, list]]:
    tracked: dict[str, list] = {"orgs": [], "emails": []}
    yield tracked
    async with AsyncSessionLocal() as session:
        if tracked["orgs"]:
            await session.execute(
                delete(EmailTemplate).where(EmailTemplate.organization_id.in_(tracked["orgs"]))
            )
        if tracked["emails"]:
            await session.execute(delete(User).where(User.email.in_(tracked["emails"])))
        if tracked["orgs"]:
            await session.execute(delete(Organization).where(Organization.id.in_(tracked["orgs"])))
        await session.commit()


async def _seed_org(session: AsyncSession, owned_cleanup: dict[str, list]) -> Organization:
    org = Organization(name=f"Org-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.commit()
    await session.refresh(org)
    owned_cleanup["orgs"].append(org.id)
    return org


async def _seed_user(
    session: AsyncSession,
    owned_cleanup: dict[str, list],
    org: Organization,
    role: UserRole,
) -> User:
    email = f"u-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    user = User(email=email, name="User", role=role, organization_id=org.id)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


def _auth(user: User) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {create_access_token(user.id, user.organization_id, user.role)}"
    }


def _payload(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "name": f"Šablona {uuid.uuid4().hex[:6]}",
        "subject": "Nová nabídka pro {firma}",
        "body": "Dobrý den {kontakt},\n\nposílám nabídku.",
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


async def test_create_list_update_delete_roundtrip(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)

    created = await client.post(
        "/api/v1/email-templates", json=_payload(name="Úvodní oslovení"), headers=_auth(admin)
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["name"] == "Úvodní oslovení"
    assert body["subject"] == "Nová nabídka pro {firma}"
    assert body["created_by_user_id"] == str(admin.id)

    listed = await client.get("/api/v1/email-templates", headers=_auth(admin))
    assert listed.status_code == 200
    assert [t["id"] for t in listed.json()] == [body["id"]]

    updated = await client.put(
        f"/api/v1/email-templates/{body['id']}",
        json=_payload(name="Úvodní oslovení", subject="Jiný předmět", body="Jiné tělo"),
        headers=_auth(admin),
    )
    assert updated.status_code == 200
    assert updated.json()["subject"] == "Jiný předmět"

    deleted = await client.delete(f"/api/v1/email-templates/{body['id']}", headers=_auth(admin))
    assert deleted.status_code == 204
    assert (await client.get("/api/v1/email-templates", headers=_auth(admin))).json() == []


async def test_list_is_ordered_by_name(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    for name in ("Cenová nabídka", "Ahoj", "Připomínka"):
        r = await client.post(
            "/api/v1/email-templates", json=_payload(name=name), headers=_auth(admin)
        )
        assert r.status_code == 201, r.text

    names = [
        t["name"]
        for t in (await client.get("/api/v1/email-templates", headers=_auth(admin))).json()
    ]
    assert names == sorted(names)
    assert names[0] == "Ahoj"


async def test_duplicate_name_in_same_org_is_409(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    first = await client.post(
        "/api/v1/email-templates", json=_payload(name="Stejná"), headers=_auth(admin)
    )
    assert first.status_code == 201
    again = await client.post(
        "/api/v1/email-templates", json=_payload(name="Stejná"), headers=_auth(admin)
    )
    assert again.status_code == 409


async def test_merge_fields_endpoint_lists_the_vocabulary(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    r = await client.get("/api/v1/email-templates/merge-fields", headers=_auth(sales))
    assert r.status_code == 200
    assert r.json()["keys"] == list(MERGE_FIELD_KEYS)
    # The originals must stay in the advertised list.
    assert {"firma", "kontakt", "vlastnik"} <= set(r.json()["keys"])
    # Deal-only tokens are flagged so a dealless surface (the bulk-email
    # wizard) can hide them instead of promising an empty substitution.
    assert r.json()["deal_keys"] == list(DEAL_MERGE_FIELD_KEYS)
    assert set(DEAL_MERGE_FIELD_KEYS) < set(MERGE_FIELD_KEYS)


# ---------------------------------------------------------------------------
# Organization isolation
# ---------------------------------------------------------------------------


async def test_another_orgs_template_is_invisible_and_404_not_403(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org_a = await _seed_org(db_session, owned_cleanup)
    admin_a = await _seed_user(db_session, owned_cleanup, org_a, UserRole.admin)
    org_b = await _seed_org(db_session, owned_cleanup)
    admin_b = await _seed_user(db_session, owned_cleanup, org_b, UserRole.admin)

    created = await client.post("/api/v1/email-templates", json=_payload(), headers=_auth(admin_a))
    template_id = created.json()["id"]

    # B can't see it…
    assert (await client.get("/api/v1/email-templates", headers=_auth(admin_b))).json() == []
    # …and can't reach it by id. 404, not 403 — never confirm a foreign id exists.
    assert (
        await client.put(
            f"/api/v1/email-templates/{template_id}", json=_payload(), headers=_auth(admin_b)
        )
    ).status_code == 404
    assert (
        await client.delete(f"/api/v1/email-templates/{template_id}", headers=_auth(admin_b))
    ).status_code == 404
    # A still has it.
    assert len((await client.get("/api/v1/email-templates", headers=_auth(admin_a))).json()) == 1


async def test_same_name_allowed_in_different_orgs(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org_a = await _seed_org(db_session, owned_cleanup)
    admin_a = await _seed_user(db_session, owned_cleanup, org_a, UserRole.admin)
    org_b = await _seed_org(db_session, owned_cleanup)
    admin_b = await _seed_user(db_session, owned_cleanup, org_b, UserRole.admin)

    a = await client.post(
        "/api/v1/email-templates", json=_payload(name="Sdílený název"), headers=_auth(admin_a)
    )
    b = await client.post(
        "/api/v1/email-templates", json=_payload(name="Sdílený název"), headers=_auth(admin_b)
    )
    assert a.status_code == 201
    assert b.status_code == 201


# ---------------------------------------------------------------------------
# Role gating — any member reads, admin/manager writes
# ---------------------------------------------------------------------------


async def test_salesperson_can_read_but_not_write(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)

    created = await client.post("/api/v1/email-templates", json=_payload(), headers=_auth(admin))
    template_id = created.json()["id"]

    # Reads: allowed — a salesperson has to be able to pick a template.
    listed = await client.get("/api/v1/email-templates", headers=_auth(sales))
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    # Writes: forbidden.
    assert (
        await client.post("/api/v1/email-templates", json=_payload(), headers=_auth(sales))
    ).status_code == 403
    assert (
        await client.put(
            f"/api/v1/email-templates/{template_id}", json=_payload(), headers=_auth(sales)
        )
    ).status_code == 403
    assert (
        await client.delete(f"/api/v1/email-templates/{template_id}", headers=_auth(sales))
    ).status_code == 403


async def test_manager_may_write(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    manager = await _seed_user(db_session, owned_cleanup, org, UserRole.manager)

    created = await client.post("/api/v1/email-templates", json=_payload(), headers=_auth(manager))
    assert created.status_code == 201, created.text
    template_id = created.json()["id"]
    assert (
        await client.put(
            f"/api/v1/email-templates/{template_id}",
            json=_payload(subject="Upraveno"),
            headers=_auth(manager),
        )
    ).status_code == 200
    assert (
        await client.delete(f"/api/v1/email-templates/{template_id}", headers=_auth(manager))
    ).status_code == 204
