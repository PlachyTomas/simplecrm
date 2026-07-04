"""Tests for the /api/v1/healthz endpoints.

Healthz is unauthenticated by design, so the `permission_denied` test required
by Section 12 of MANAGER_TASK.md is intentionally N/A here. The tests cover
happy paths (process-only probe and DB-ping probe) plus a method-not-allowed
negative case and the DB-unreachable branch via dependency override.
"""

from collections.abc import AsyncIterator

from httpx import AsyncClient
from sqlalchemy.exc import OperationalError

from app.db import get_db
from app.main import app


async def test_healthz_happy_path(client: AsyncClient) -> None:
    response = await client.get("/api/v1/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["content-type"].startswith("application/json")


async def test_responses_carry_security_headers(client: AsyncClient) -> None:
    # Review R5 P3: baseline security headers on every response.
    response = await client.get("/api/v1/healthz")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"


async def test_healthz_method_not_allowed(client: AsyncClient) -> None:
    response = await client.post("/api/v1/healthz")
    assert response.status_code == 405


async def test_healthz_db_happy_path(client: AsyncClient) -> None:
    response = await client.get("/api/v1/healthz/db")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_healthz_db_unreachable_returns_503(client: AsyncClient) -> None:
    async def failing_get_db() -> AsyncIterator[object]:
        class _FailingSession:
            async def execute(self, *_args: object, **_kwargs: object) -> object:
                raise OperationalError("SELECT 1", {}, Exception("boom"))

        yield _FailingSession()

    app.dependency_overrides[get_db] = failing_get_db
    try:
        response = await client.get("/api/v1/healthz/db")
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert response.status_code == 503
    assert response.json() == {"detail": "database unreachable"}
