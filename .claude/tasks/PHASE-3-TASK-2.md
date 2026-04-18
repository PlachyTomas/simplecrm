# Task 3.2 — /companies/lookup-registry endpoint

## Goal
Expose the business-registry lookup as
`GET /api/v1/companies/lookup-registry?country=CZ&number=27082440`. Add a
process-local 24h TTL cache so repeat lookups don't hammer ARES, plus a
per-user rate limit so one org can't burn their quota.

## Design notes
- **Auth**: standard `get_current_user`. Unauth → 401 (consistent with the
  rest of `/companies/*`).
- **Cache**: in-process `dict[(country, number)] → (timestamp, result)`.
  24h TTL. Thread-safe via `asyncio.Lock` because FastAPI runs handlers
  concurrently. Room for Redis in production; MVP stays in-process.
- **Rate limit**: token-bucket per `user.id`, 20 lookups / minute.
  Enough for a user who types in bursts in the Add Company modal but
  stops runaway scripts.
- **Response**: reuse `CompanyRegistryData` as a Pydantic-compatible
  `RegistryLookupResult` schema. 200 on hit, 404 on "not found", 502 on
  upstream failure, 429 on rate limit, 400 on bad country/IČO format.
- **Endpoint path** sits inside the companies router at
  `/api/v1/companies/lookup-registry` per the brief.

## Files in scope
- `app/services/lookup_cache.py` — the small LRU + TTL cache and rate limiter.
- `app/schemas/registry.py` — `RegistryLookupResult` response model.
- `app/api/v1/companies.py` — extend with the new endpoint.
- `tests/api/v1/test_companies.py` — add lookup tests (fake registry via
  `app.dependency_overrides`, exercise all status codes, cache hit).

## Acceptance criteria
1. `GET /companies/lookup-registry?country=CZ&number=27082440` as an
   authenticated user → 200 with parsed fields.
2. Second call with the same args does NOT hit the underlying service
   (verified by a call-counter on the fake).
3. Not-found → 404.
4. Upstream error → 502.
5. Rate limit → 429 after N calls.
6. Missing token → 401; malformed IČO → 400.
7. Backend suite green; `types:check` regenerates.
8. One commit: `feat(api): /companies/lookup-registry with cache + rate limit — Task 3.2`.
