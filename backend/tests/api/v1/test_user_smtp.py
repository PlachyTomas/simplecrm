"""Integration tests for /api/v1/me/smtp (Task A4).

Endpoint commits escape the rollback fixture, so each test seeds with
UUID-suffixed data and tears down via `owned_cleanup` (deleting the user
cascades to its user_smtp_settings row).
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import Organization, User, UserRole
from app.db.session import AsyncSessionLocal


@pytest.fixture
async def owned_cleanup() -> AsyncIterator[dict[str, list]]:
    tracked: dict[str, list] = {"orgs": [], "emails": []}
    yield tracked
    async with AsyncSessionLocal() as session:
        if tracked["emails"]:
            await session.execute(delete(User).where(User.email.in_(tracked["emails"])))
        if tracked["orgs"]:
            await session.execute(delete(Organization).where(Organization.id.in_(tracked["orgs"])))
        await session.commit()


async def _seed_user(
    session: AsyncSession, owned_cleanup: dict[str, list], role: UserRole = UserRole.salesperson
) -> User:
    org = Organization(name=f"Org-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.commit()
    await session.refresh(org)
    owned_cleanup["orgs"].append(org.id)
    email = f"u-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    user = User(email=email, name="User", role=role, organization_id=org.id)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


def _auth(user: User) -> dict[str, str]:
    token = create_access_token(user.id, user.organization_id, user.role)
    return {"Authorization": f"Bearer {token}"}


def _payload(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "host": "mail.x.cz",
        "port": 465,
        "use_ssl": True,
        "use_starttls": False,
        "username": "u@x.cz",
        "password": "secret",
        "from_email": "u@x.cz",
        "from_name": "Jan Novák",
    }
    base.update(overrides)
    return base


async def test_get_when_unconfigured(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    user = await _seed_user(db_session, owned_cleanup)
    r = await client.get("/api/v1/me/smtp", headers=_auth(user))
    assert r.status_code == 200
    assert r.json() == {"configured": False}


async def test_put_creates_and_get_returns_no_password(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    user = await _seed_user(db_session, owned_cleanup)
    r = await client.put("/api/v1/me/smtp", json=_payload(), headers=_auth(user))
    assert r.status_code == 200, r.text
    body = r.json()
    assert "password" not in body
    assert body["has_password"] is True
    assert body["verified"] is False
    assert body["from_name"] == "Jan Novák"

    g = await client.get("/api/v1/me/smtp", headers=_auth(user))
    assert g.json()["host"] == "mail.x.cz"
    assert "password" not in g.json()


async def test_put_new_requires_password(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    user = await _seed_user(db_session, owned_cleanup)
    r = await client.put("/api/v1/me/smtp", json=_payload(password=None), headers=_auth(user))
    assert r.status_code == 422


async def test_put_update_without_password_keeps_existing(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    user = await _seed_user(db_session, owned_cleanup)
    await client.put("/api/v1/me/smtp", json=_payload(), headers=_auth(user))
    # Update host only, omit password.
    r = await client.put(
        "/api/v1/me/smtp",
        json=_payload(password=None, host="mail.changed.cz"),
        headers=_auth(user),
    )
    assert r.status_code == 200
    assert r.json()["host"] == "mail.changed.cz"
    assert r.json()["has_password"] is True


async def test_test_endpoint_marks_verified(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.api.v1.user_smtp.verify_smtp", lambda cfg: None)
    user = await _seed_user(db_session, owned_cleanup)
    await client.put("/api/v1/me/smtp", json=_payload(), headers=_auth(user))
    r = await client.post("/api/v1/me/smtp/test", headers=_auth(user))
    assert r.status_code == 200
    assert r.json()["ok"] is True
    g = await client.get("/api/v1/me/smtp", headers=_auth(user))
    assert g.json()["verified"] is True


async def test_test_endpoint_reports_failure(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _boom(cfg: object) -> None:
        raise OSError("connection refused")

    monkeypatch.setattr("app.api.v1.user_smtp.verify_smtp", _boom)
    user = await _seed_user(db_session, owned_cleanup)
    await client.put("/api/v1/me/smtp", json=_payload(), headers=_auth(user))
    r = await client.post("/api/v1/me/smtp/test", headers=_auth(user))
    assert r.status_code == 200
    assert r.json()["ok"] is False
    assert "connection refused" in r.json()["error"]
    g = await client.get("/api/v1/me/smtp", headers=_auth(user))
    assert g.json()["verified"] is False


async def test_changing_credentials_clears_verification(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.api.v1.user_smtp.verify_smtp", lambda cfg: None)
    user = await _seed_user(db_session, owned_cleanup)
    await client.put("/api/v1/me/smtp", json=_payload(), headers=_auth(user))
    await client.post("/api/v1/me/smtp/test", headers=_auth(user))
    # Re-save (new password) → verification must reset.
    await client.put("/api/v1/me/smtp", json=_payload(password="new"), headers=_auth(user))
    g = await client.get("/api/v1/me/smtp", headers=_auth(user))
    assert g.json()["verified"] is False


async def test_delete(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    user = await _seed_user(db_session, owned_cleanup)
    await client.put("/api/v1/me/smtp", json=_payload(), headers=_auth(user))
    r = await client.delete("/api/v1/me/smtp", headers=_auth(user))
    assert r.status_code == 204
    g = await client.get("/api/v1/me/smtp", headers=_auth(user))
    assert g.json() == {"configured": False}
