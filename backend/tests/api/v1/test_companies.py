"""Integration tests for /api/v1/companies/*.

Endpoint commits mean the rollback fixture can't isolate data. Each test
seeds with UUID-suffixed names/emails and tears down via `owned_cleanup`.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import Company, Organization, Team, User, UserRole
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


async def _seed_org(
    session: AsyncSession,
    owned_cleanup: dict[str, list],
    *,
    name: str | None = None,
) -> Organization:
    org = Organization(name=name or f"Org-{uuid.uuid4().hex[:6]}")
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
    *,
    team_id: uuid.UUID | None = None,
) -> User:
    email = f"u-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    user = User(
        email=email,
        name="User",
        role=role,
        organization_id=org.id,
        team_id=team_id,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


def _auth(user: User) -> dict[str, str]:
    token = create_access_token(user.id, user.organization_id, user.role)
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# list_companies
# ---------------------------------------------------------------------------


async def test_list_companies_happy_admin_sees_all_in_org(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    db_session.add_all(
        [
            Company(organization_id=org.id, name="Mine", owner_user_id=admin.id),
            Company(organization_id=org.id, name="Sales", owner_user_id=sales.id),
            Company(organization_id=org.id, name="Pool", owner_user_id=None),
        ]
    )
    await db_session.commit()

    response = await client.get("/api/v1/companies", headers=_auth(admin))
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3
    names = {it["name"] for it in body["items"]}
    assert names == {"Mine", "Sales", "Pool"}


async def test_list_companies_permission_salesperson_scoped(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    team = Team(organization_id=org.id, name="T1")
    db_session.add(team)
    await db_session.commit()
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson, team_id=team.id)
    other = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    db_session.add_all(
        [
            Company(organization_id=org.id, name="Mine", owner_user_id=sales.id),
            Company(organization_id=org.id, name="Theirs", owner_user_id=other.id),
            Company(organization_id=org.id, name="Pool"),
        ]
    )
    await db_session.commit()

    response = await client.get("/api/v1/companies", headers=_auth(sales))
    assert response.status_code == 200
    names = {it["name"] for it in response.json()["items"]}
    assert names == {"Mine", "Pool"}


async def test_list_companies_validation_bad_limit(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    response = await client.get("/api/v1/companies?limit=999", headers=_auth(admin))
    assert response.status_code == 422


async def test_list_companies_rejects_missing_token(client: AsyncClient) -> None:
    response = await client.get("/api/v1/companies")
    assert response.status_code == 401


async def test_list_companies_search_filters_by_name_and_ico(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    db_session.add_all(
        [
            Company(organization_id=org.id, name="Alza.cz a.s.", ico="27082440"),
            Company(organization_id=org.id, name="Rohlík.cz", ico="24253820"),
            Company(organization_id=org.id, name="Moje s.r.o.", ico="11111111"),
        ]
    )
    await db_session.commit()

    # Partial name match, case-insensitive.
    by_name = await client.get("/api/v1/companies?search=alza", headers=_auth(admin))
    assert by_name.status_code == 200
    assert {it["name"] for it in by_name.json()["items"]} == {"Alza.cz a.s."}

    # Partial ICO match.
    by_ico = await client.get("/api/v1/companies?search=2425", headers=_auth(admin))
    assert {it["name"] for it in by_ico.json()["items"]} == {"Rohlík.cz"}

    # No match.
    empty = await client.get("/api/v1/companies?search=xyz123", headers=_auth(admin))
    assert empty.json()["total"] == 0


# ---------------------------------------------------------------------------
# get_company
# ---------------------------------------------------------------------------


async def test_get_company_happy(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = Company(organization_id=org.id, name="Target", owner_user_id=admin.id)
    db_session.add(company)
    await db_session.commit()

    response = await client.get(f"/api/v1/companies/{company.id}", headers=_auth(admin))
    assert response.status_code == 200
    assert response.json()["name"] == "Target"


async def test_get_company_cross_org_denied(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    first = await _seed_org(db_session, owned_cleanup, name="First")
    second = await _seed_org(db_session, owned_cleanup, name="Second")
    user_first = await _seed_user(db_session, owned_cleanup, first, UserRole.admin)
    company_second = Company(organization_id=second.id, name="Secret")
    db_session.add(company_second)
    await db_session.commit()

    response = await client.get(f"/api/v1/companies/{company_second.id}", headers=_auth(user_first))
    assert response.status_code == 404


async def test_get_company_missing_returns_404(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    response = await client.get(f"/api/v1/companies/{uuid.uuid4()}", headers=_auth(admin))
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# create_company
# ---------------------------------------------------------------------------


async def test_create_company_happy(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    response = await client.post(
        "/api/v1/companies",
        headers=_auth(admin),
        json={"name": "Alza.cz a.s.", "ico": "27082440"},
    )
    assert response.status_code == 201
    assert response.json()["name"] == "Alza.cz a.s."


async def test_create_company_validation_error(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    response = await client.post(
        "/api/v1/companies",
        headers=_auth(admin),
        json={"name": "", "ico": "abc"},
    )
    assert response.status_code == 422


async def test_create_company_salesperson_cannot_assign_other(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    other = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    response = await client.post(
        "/api/v1/companies",
        headers=_auth(sales),
        json={"name": "Out of scope", "owner_user_id": str(other.id)},
    )
    assert response.status_code == 403


async def test_create_company_duplicate_ico_returns_409(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    db_session.add(Company(organization_id=org.id, name="First", ico="27082440"))
    await db_session.commit()
    response = await client.post(
        "/api/v1/companies",
        headers=_auth(admin),
        json={"name": "Duplicate", "ico": "27082440"},
    )
    assert response.status_code == 409


# ---------------------------------------------------------------------------
# update_company
# ---------------------------------------------------------------------------


async def test_update_company_happy(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = Company(organization_id=org.id, name="Old", owner_user_id=admin.id)
    db_session.add(company)
    await db_session.commit()

    response = await client.put(
        f"/api/v1/companies/{company.id}",
        headers=_auth(admin),
        json={"name": "New", "website": "https://new.cz"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "New"
    assert response.json()["website"] == "https://new.cz"


async def test_update_company_validation_error(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = Company(organization_id=org.id, name="X", owner_user_id=admin.id)
    db_session.add(company)
    await db_session.commit()
    response = await client.put(
        f"/api/v1/companies/{company.id}",
        headers=_auth(admin),
        json={"ico": "not8"},
    )
    assert response.status_code == 422


async def test_update_company_salesperson_cannot_edit_foreign(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    other = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    target = Company(organization_id=org.id, name="Theirs", owner_user_id=other.id)
    db_session.add(target)
    await db_session.commit()
    response = await client.put(
        f"/api/v1/companies/{target.id}",
        headers=_auth(sales),
        json={"name": "Hijack"},
    )
    # Salesperson can't see the row, so 404 (visibility-first).
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# delete_company
# ---------------------------------------------------------------------------


async def test_delete_company_admin_ok(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    company = Company(organization_id=org.id, name="Doomed")
    db_session.add(company)
    await db_session.commit()
    response = await client.delete(f"/api/v1/companies/{company.id}", headers=_auth(admin))
    assert response.status_code == 204


async def test_delete_company_non_admin_forbidden(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    company = Company(organization_id=org.id, name="Safe", owner_user_id=sales.id)
    db_session.add(company)
    await db_session.commit()
    response = await client.delete(f"/api/v1/companies/{company.id}", headers=_auth(sales))
    assert response.status_code == 403


async def test_delete_company_rejects_missing_token(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    company = Company(organization_id=org.id, name="X")
    db_session.add(company)
    await db_session.commit()
    response = await client.delete(f"/api/v1/companies/{company.id}")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# lookup_registry
# ---------------------------------------------------------------------------


class _FakeRegistry:
    """Stand-in `BusinessRegistryRegistry` that records call counts."""

    def __init__(self, result=None, *, fail: str | None = None) -> None:
        self.result = result
        self.fail = fail  # "error" | "value_error" | None
        self.calls = 0

    def resolve(self, country: str):
        if country.upper() != "CZ":
            raise ValueError(f"No registry service for country {country!r}")
        return self

    async def lookup(self, country: str, number: str):
        self.calls += 1
        from app.services.business_registry import BusinessRegistryError

        if self.fail == "error":
            raise BusinessRegistryError("upstream boom")
        if self.fail == "value_error":
            raise ValueError("IČO must be exactly 8 digits")
        return self.result


async def test_lookup_registry_happy_and_caches(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    from app.api.v1.companies import (
        get_registry_cache,
        get_registry_rate_limiter,
    )
    from app.main import app
    from app.schemas.registry import RegistryLookupResult
    from app.services.business_registry import (
        CompanyRegistryData,
        get_business_registry,
    )
    from app.services.lookup_cache import RateLimiter, TtlCache

    org = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)

    fake = _FakeRegistry(
        result=CompanyRegistryData(
            name="Alza.cz a.s.",
            ico="27082440",
            dic="CZ27082440",
            address_city="Praha",
        )
    )
    test_cache: TtlCache[RegistryLookupResult] = TtlCache()
    test_limiter = RateLimiter()

    app.dependency_overrides[get_business_registry] = lambda: fake
    app.dependency_overrides[get_registry_cache] = lambda: test_cache
    app.dependency_overrides[get_registry_rate_limiter] = lambda: test_limiter
    try:
        first = await client.get(
            "/api/v1/companies/lookup-registry?country=CZ&number=27082440",
            headers=_auth(user),
        )
        second = await client.get(
            "/api/v1/companies/lookup-registry?country=CZ&number=27082440",
            headers=_auth(user),
        )
    finally:
        app.dependency_overrides.pop(get_business_registry, None)
        app.dependency_overrides.pop(get_registry_cache, None)
        app.dependency_overrides.pop(get_registry_rate_limiter, None)

    assert first.status_code == 200
    assert first.json()["name"] == "Alza.cz a.s."
    assert first.json()["ico"] == "27082440"
    assert second.status_code == 200
    # Cache hit on second call — service only touched once.
    assert fake.calls == 1


async def test_lookup_registry_not_found_returns_404(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    from app.api.v1.companies import (
        get_registry_cache,
        get_registry_rate_limiter,
    )
    from app.main import app
    from app.schemas.registry import RegistryLookupResult
    from app.services.business_registry import get_business_registry
    from app.services.lookup_cache import RateLimiter, TtlCache

    org = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)

    fake = _FakeRegistry(result=None)
    app.dependency_overrides[get_business_registry] = lambda: fake
    app.dependency_overrides[get_registry_cache] = lambda: TtlCache[RegistryLookupResult]()
    app.dependency_overrides[get_registry_rate_limiter] = lambda: RateLimiter()
    try:
        response = await client.get(
            "/api/v1/companies/lookup-registry?country=CZ&number=99999999",
            headers=_auth(user),
        )
    finally:
        app.dependency_overrides.pop(get_business_registry, None)
        app.dependency_overrides.pop(get_registry_cache, None)
        app.dependency_overrides.pop(get_registry_rate_limiter, None)
    assert response.status_code == 404


async def test_lookup_registry_upstream_error_returns_502(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    from app.api.v1.companies import (
        get_registry_cache,
        get_registry_rate_limiter,
    )
    from app.main import app
    from app.schemas.registry import RegistryLookupResult
    from app.services.business_registry import get_business_registry
    from app.services.lookup_cache import RateLimiter, TtlCache

    org = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)

    fake = _FakeRegistry(fail="error")
    app.dependency_overrides[get_business_registry] = lambda: fake
    app.dependency_overrides[get_registry_cache] = lambda: TtlCache[RegistryLookupResult]()
    app.dependency_overrides[get_registry_rate_limiter] = lambda: RateLimiter()
    try:
        response = await client.get(
            "/api/v1/companies/lookup-registry?country=CZ&number=27082440",
            headers=_auth(user),
        )
    finally:
        app.dependency_overrides.pop(get_business_registry, None)
        app.dependency_overrides.pop(get_registry_cache, None)
        app.dependency_overrides.pop(get_registry_rate_limiter, None)
    assert response.status_code == 502


async def test_lookup_registry_bad_ico_returns_400(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    from app.api.v1.companies import (
        get_registry_cache,
        get_registry_rate_limiter,
    )
    from app.main import app
    from app.schemas.registry import RegistryLookupResult
    from app.services.business_registry import get_business_registry
    from app.services.lookup_cache import RateLimiter, TtlCache

    org = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)

    fake = _FakeRegistry(fail="value_error")
    app.dependency_overrides[get_business_registry] = lambda: fake
    app.dependency_overrides[get_registry_cache] = lambda: TtlCache[RegistryLookupResult]()
    app.dependency_overrides[get_registry_rate_limiter] = lambda: RateLimiter()
    try:
        response = await client.get(
            "/api/v1/companies/lookup-registry?country=CZ&number=ABC",
            headers=_auth(user),
        )
    finally:
        app.dependency_overrides.pop(get_business_registry, None)
        app.dependency_overrides.pop(get_registry_cache, None)
        app.dependency_overrides.pop(get_registry_rate_limiter, None)
    assert response.status_code == 400


async def test_lookup_registry_unknown_country_returns_400(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    from app.api.v1.companies import (
        get_registry_cache,
        get_registry_rate_limiter,
    )
    from app.main import app
    from app.schemas.registry import RegistryLookupResult
    from app.services.business_registry import get_business_registry
    from app.services.lookup_cache import RateLimiter, TtlCache

    org = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)

    fake = _FakeRegistry(result=None)
    app.dependency_overrides[get_business_registry] = lambda: fake
    app.dependency_overrides[get_registry_cache] = lambda: TtlCache[RegistryLookupResult]()
    app.dependency_overrides[get_registry_rate_limiter] = lambda: RateLimiter()
    try:
        response = await client.get(
            "/api/v1/companies/lookup-registry?country=SK&number=12345678",
            headers=_auth(user),
        )
    finally:
        app.dependency_overrides.pop(get_business_registry, None)
        app.dependency_overrides.pop(get_registry_cache, None)
        app.dependency_overrides.pop(get_registry_rate_limiter, None)
    assert response.status_code == 400


async def test_lookup_registry_rate_limit_returns_429(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    from app.api.v1.companies import (
        get_registry_cache,
        get_registry_rate_limiter,
    )
    from app.main import app
    from app.schemas.registry import RegistryLookupResult
    from app.services.business_registry import (
        CompanyRegistryData,
        get_business_registry,
    )
    from app.services.lookup_cache import RateLimiter, TtlCache

    org = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)

    fake = _FakeRegistry(result=CompanyRegistryData(name="Test", ico="27082440"))
    # Tight limiter: one call allowed per test.
    tight_limiter = RateLimiter(max_calls=1, window_seconds=60)
    app.dependency_overrides[get_business_registry] = lambda: fake
    # Fresh cache so the second call actually re-enters rate-limit path.
    cache: TtlCache[RegistryLookupResult] = TtlCache()
    app.dependency_overrides[get_registry_cache] = lambda: cache
    app.dependency_overrides[get_registry_rate_limiter] = lambda: tight_limiter
    try:
        first = await client.get(
            "/api/v1/companies/lookup-registry?country=CZ&number=27082440",
            headers=_auth(user),
        )
        second = await client.get(
            "/api/v1/companies/lookup-registry?country=CZ&number=12345678",
            headers=_auth(user),
        )
    finally:
        app.dependency_overrides.pop(get_business_registry, None)
        app.dependency_overrides.pop(get_registry_cache, None)
        app.dependency_overrides.pop(get_registry_rate_limiter, None)
    assert first.status_code == 200
    assert second.status_code == 429


async def test_lookup_registry_rejects_missing_token(client: AsyncClient) -> None:
    response = await client.get("/api/v1/companies/lookup-registry?country=CZ&number=27082440")
    assert response.status_code == 401


# free + reassign endpoints ------------------------------------------------


async def test_free_company_admin_clears_owner(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    company = Company(organization_id=org.id, name="Owned", owner_user_id=sales.id)
    db_session.add(company)
    await db_session.commit()

    response = await client.post(f"/api/v1/companies/{company.id}/free", headers=_auth(admin))
    assert response.status_code == 200
    assert response.json()["owner_user_id"] is None


async def test_free_company_salesperson_forbidden(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    company = Company(organization_id=org.id, name="Mine", owner_user_id=sales.id)
    db_session.add(company)
    await db_session.commit()

    response = await client.post(f"/api/v1/companies/{company.id}/free", headers=_auth(sales))
    assert response.status_code == 403


async def test_reassign_company_admin_transfers_owner(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    a = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    b = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    company = Company(organization_id=org.id, name="T", owner_user_id=a.id)
    db_session.add(company)
    await db_session.commit()

    response = await client.post(
        f"/api/v1/companies/{company.id}/reassign",
        headers=_auth(admin),
        json={"new_owner_user_id": str(b.id)},
    )
    assert response.status_code == 200
    assert response.json()["owner_user_id"] == str(b.id)


async def test_reassign_company_cross_org_rejected(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    first = await _seed_org(db_session, owned_cleanup)
    second = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, first, UserRole.admin)
    foreign = await _seed_user(db_session, owned_cleanup, second, UserRole.salesperson)
    company = Company(organization_id=first.id, name="T")
    db_session.add(company)
    await db_session.commit()
    response = await client.post(
        f"/api/v1/companies/{company.id}/reassign",
        headers=_auth(admin),
        json={"new_owner_user_id": str(foreign.id)},
    )
    assert response.status_code == 400


# sort + ownership filter ---------------------------------------------------


async def test_list_companies_sort_by_ownership_expires_at_asc(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    from datetime import UTC, datetime, timedelta

    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    now = datetime.now(tz=UTC)
    db_session.add_all(
        [
            Company(
                organization_id=org.id,
                name="ExpiresSoon",
                owner_user_id=admin.id,
                ownership_expires_at=now + timedelta(days=10),
            ),
            Company(
                organization_id=org.id,
                name="ExpiresLater",
                owner_user_id=admin.id,
                ownership_expires_at=now + timedelta(days=300),
            ),
        ]
    )
    await db_session.commit()

    r = await client.get(
        "/api/v1/companies?sort=ownership_expires_at&order=asc",
        headers=_auth(admin),
    )
    assert r.status_code == 200
    names = [it["name"] for it in r.json()["items"]]
    assert names == ["ExpiresSoon", "ExpiresLater"]


async def test_list_companies_ownership_filter_mine(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    team = Team(organization_id=org.id, name="T")
    db_session.add(team)
    await db_session.commit()
    await db_session.refresh(team)
    me = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson, team_id=team.id)
    mate = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson, team_id=team.id)
    db_session.add_all(
        [
            Company(organization_id=org.id, name="Mine", owner_user_id=me.id),
            Company(organization_id=org.id, name="Mate", owner_user_id=mate.id),
            Company(organization_id=org.id, name="Pool", owner_user_id=None),
        ]
    )
    await db_session.commit()

    r = await client.get("/api/v1/companies?ownership=mine", headers=_auth(me))
    assert r.status_code == 200
    assert {it["name"] for it in r.json()["items"]} == {"Mine"}


async def test_list_companies_ownership_filter_mine_and_unowned(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    team = Team(organization_id=org.id, name="T")
    db_session.add(team)
    await db_session.commit()
    await db_session.refresh(team)
    me = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson, team_id=team.id)
    mate = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson, team_id=team.id)
    db_session.add_all(
        [
            Company(organization_id=org.id, name="Mine", owner_user_id=me.id),
            Company(organization_id=org.id, name="Mate", owner_user_id=mate.id),
            Company(organization_id=org.id, name="Pool", owner_user_id=None),
        ]
    )
    await db_session.commit()

    r = await client.get("/api/v1/companies?ownership=mine_and_unowned", headers=_auth(me))
    assert r.status_code == 200
    assert {it["name"] for it in r.json()["items"]} == {"Mine", "Pool"}


async def test_list_companies_ownership_filter_unowned(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    me = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    db_session.add_all(
        [
            Company(organization_id=org.id, name="Mine", owner_user_id=me.id),
            Company(organization_id=org.id, name="Pool", owner_user_id=None),
        ]
    )
    await db_session.commit()

    r = await client.get("/api/v1/companies?ownership=unowned", headers=_auth(me))
    assert r.status_code == 200
    assert {it["name"] for it in r.json()["items"]} == {"Pool"}


async def test_list_companies_rejects_unknown_sort_key(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    r = await client.get("/api/v1/companies?sort=evil_drop_table", headers=_auth(admin))
    assert r.status_code == 400


# max_owned_companies cap --------------------------------------------------


async def test_company_create_respects_owner_cap(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    sales = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    sales.max_owned_companies = 1
    db_session.add(Company(organization_id=org.id, name="Existing", owner_user_id=sales.id))
    await db_session.commit()

    # Admin trying to assign one more company to the capped salesperson — 409.
    resp = await client.post(
        "/api/v1/companies",
        headers=_auth(admin),
        json={"name": "Over the cap", "owner_user_id": str(sales.id)},
    )
    assert resp.status_code == 409, resp.text
    assert "cap" in resp.json()["detail"].lower()

    # Unowned create stays fine.
    pool = await client.post(
        "/api/v1/companies",
        headers=_auth(admin),
        json={"name": "Into pool", "owner_user_id": None},
    )
    assert pool.status_code == 201, pool.text


async def test_company_reassign_respects_owner_cap(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    capped = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    capped.max_owned_companies = 1
    held = Company(organization_id=org.id, name="Held", owner_user_id=capped.id)
    target = Company(organization_id=org.id, name="To move", owner_user_id=None)
    db_session.add_all([held, target])
    await db_session.commit()
    await db_session.refresh(target)

    resp = await client.post(
        f"/api/v1/companies/{target.id}/reassign",
        headers=_auth(admin),
        json={"new_owner_user_id": str(capped.id)},
    )
    assert resp.status_code == 409, resp.text


async def test_user_update_can_set_and_clear_cap(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    target = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)

    # Set the cap.
    r = await client.patch(
        f"/api/v1/users/{target.id}",
        headers=_auth(admin),
        json={"max_owned_companies": 5},
    )
    assert r.status_code == 200, r.text
    assert r.json()["max_owned_companies"] == 5

    # Clear it back to unlimited.
    r = await client.patch(
        f"/api/v1/users/{target.id}",
        headers=_auth(admin),
        json={"max_owned_companies": None},
    )
    assert r.status_code == 200, r.text
    assert r.json()["max_owned_companies"] is None


async def test_user_update_rejects_negative_cap(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    target = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    r = await client.patch(
        f"/api/v1/users/{target.id}",
        headers=_auth(admin),
        json={"max_owned_companies": -1},
    )
    assert r.status_code == 422
