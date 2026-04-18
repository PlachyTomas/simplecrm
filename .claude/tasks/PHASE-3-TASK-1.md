# Task 3.1 — BusinessRegistryService + CzechAresService

## Goal
Pluggable business-registry lookup. The interface is `lookup(country_code,
registration_number) → CompanyRegistryData | None`; the first implementation
hits ARES for Czech IČOs. Slovak (ORSR), German (Handelsregister) and Polish
(KRS) implementations can slot in later without touching callers.

## Design notes
- **Protocol** lives in `app/services/business_registry.py`. A `CompanyRegistryData`
  dataclass holds name, ICO, DIC, address fields, legal_form, registered_on.
  Every field that the registry might omit is optional.
- `CzechAresService` uses `httpx.AsyncClient` against
  `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/{ico}`.
- 404 from ARES → return `None` (caller renders "not found").
- Any other HTTP error → raise `BusinessRegistryError` so the endpoint layer
  can surface a 502.
- IČO validation: 8 digits. The Czech IČO checksum (ISO 7064 mod 11) is
  computed for early-reject; the service layer does the length check, the
  endpoint layer does format checks.
- `BusinessRegistryRegistry` (in the same module) resolves a country code to
  an implementation. The FastAPI dependency returns this registry so tests
  can override it.

## Files in scope
- `app/services/business_registry.py` — Protocol, dataclass, error type,
  registry/resolver, `CzechAresService`, `get_business_registry` dependency.
- `backend/pyproject.toml` — no new deps (httpx already present).
- `tests/services/test_ares_client.py` — unit tests with mocked httpx responses.

## Acceptance criteria
1. `CzechAresService.lookup("CZ", "27082440")` with a mocked 200 response
   returns a `CompanyRegistryData` with name/DIC/address populated.
2. Mocked 404 returns `None`.
3. Mocked 500 raises `BusinessRegistryError`.
4. Non-digit / wrong-length IČO raises `ValueError`.
5. Registry resolver picks `CzechAresService` for `"CZ"`; unknown country
   raises `ValueError`.
6. Backend suite + ruff + format + mypy all green.
7. One commit: `feat(ares): BusinessRegistryService + CzechAresService — Task 3.1`.

## Non-goals
- In-memory caching (Task 3.2).
- Rate limiting (Task 3.2).
- Endpoint wiring (Task 3.2).
- UI (Task 3.3).
