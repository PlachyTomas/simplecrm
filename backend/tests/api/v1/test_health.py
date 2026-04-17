"""Tests for the /api/v1/healthz endpoint.

Healthz is unauthenticated by design, so the `permission_denied` test required
by Section 12 of MANAGER_TASK.md is intentionally N/A here. The two remaining
tests exercise the happy path and the most meaningful negative case (wrong
HTTP method).
"""

from httpx import AsyncClient


async def test_healthz_happy_path(client: AsyncClient) -> None:
    response = await client.get("/api/v1/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["content-type"].startswith("application/json")


async def test_healthz_method_not_allowed(client: AsyncClient) -> None:
    response = await client.post("/api/v1/healthz")
    assert response.status_code == 405
