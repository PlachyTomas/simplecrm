"""Tests for `services/comgate.ComGateClient`.

HTTP transport is mocked via `httpx.MockTransport` so no respx
dependency is needed. Coverage:

  - Basic-auth header is correctly base64-encoded
  - 503 surfaces (not 500) when credentials are absent
  - Request shape for create_initial_payment + create_recurring_payment
    (incl. the v2.0 `.json` paths + `initRecurringId` in the body)
  - get_payment_status: found / not-found / transient-error mapping
  - Error mapping: 4xx with ComGate's `code` field becomes ComGateError
  - disable_recurring is a no-op (returns True, makes no HTTP call)
"""

from __future__ import annotations

import base64
import json

import httpx
import pytest

from app.core.config import Settings
from app.services.comgate import (
    ComGateClient,
    ComGateError,
    _basic_auth_header,
)


def _settings_with_creds(**overrides) -> Settings:
    """Build a Settings instance with ComGate credentials populated.

    Avoids touching the lru_cache'd `get_settings()` by constructing
    one directly. Tests pass this into ComGateClient explicitly so the
    cache state of the parent process is irrelevant.
    """
    defaults: dict = {
        "comgate_merchant_id": "1234567",
        "comgate_secret": "test-secret",
        "comgate_base_url": "https://payments.comgate.cz/v2.0",
        "comgate_test_mode": True,
        "comgate_return_url": "http://localhost:8000/api/v1/payments/return",
    }
    defaults.update(overrides)
    return Settings(**defaults)  # type: ignore[arg-type]


def _client_with_handler(handler, **settings_overrides) -> ComGateClient:
    """Wire a MockTransport into the ComGate client so requests don't
    hit the network. Returns the client; assertions about requests
    happen via a captured-list closure inside `handler`."""
    settings = _settings_with_creds(**settings_overrides)
    transport = httpx.MockTransport(handler)
    http = httpx.AsyncClient(
        base_url=settings.comgate_base_url,
        headers={
            "Authorization": "Basic "
            + base64.b64encode(
                f"{settings.comgate_merchant_id}:{settings.comgate_secret}".encode()
            ).decode(),
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        transport=transport,
        timeout=5.0,
    )
    return ComGateClient(settings=settings, http_client=http)


# ---------------------------------------------------------------------------
# Auth header + credentials gate
# ---------------------------------------------------------------------------


def test_basic_auth_header_format() -> None:
    expected = "Basic " + base64.b64encode(b"merchant:secret").decode()
    assert _basic_auth_header("merchant", "secret") == expected


async def test_create_initial_payment_503_when_creds_missing() -> None:
    """No merchant_id / secret in env → 503 with billing_not_configured."""
    settings = Settings(
        comgate_merchant_id="",
        comgate_secret="",
    )  # type: ignore[arg-type]
    client = ComGateClient(settings=settings)
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await client.create_initial_payment(
            amount_minor=49500,
            currency="CZK",
            ref_id="x",
            label="test",
            email="a@b.cz",
        )
    assert exc_info.value.status_code == 503
    assert exc_info.value.detail["code"] == "billing_not_configured"


# ---------------------------------------------------------------------------
# Webhook verification via status re-query (ComGate signs nothing)
# ---------------------------------------------------------------------------


async def test_get_payment_status_returns_found_status_and_refid() -> None:
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(
            200,
            json={
                "code": 0,
                "transId": "AB12-CD34",
                "status": "PAID",
                "refId": "charge-uuid-here",
                "price": 9900,
            },
        )

    client = _client_with_handler(handler)
    result = await client.get_payment_status("AB12-CD34")

    assert captured[0].method == "GET"
    # v2.0 REST status path: /payment/transId/{id}.json
    assert captured[0].url.path.endswith("/payment/transId/AB12-CD34.json")
    assert result.found is True
    assert result.status == "PAID"
    assert result.ref_id == "charge-uuid-here"


async def test_get_payment_status_unknown_transid_is_not_found() -> None:
    """ComGate answers but doesn't know the transId (non-zero code) →
    found=False so the webhook ACKs and ignores a spoofed callback."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"code": 1400, "message": "payment not found"})

    client = _client_with_handler(handler)
    result = await client.get_payment_status("BOGUS")
    assert result.found is False
    assert result.status is None


async def test_get_payment_status_404_is_not_found() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={})

    client = _client_with_handler(handler)
    result = await client.get_payment_status("BOGUS")
    assert result.found is False


async def test_get_payment_status_raises_on_5xx() -> None:
    """A transient upstream error must raise so the webhook returns 503
    and ComGate retries — never silently treated as 'not found'."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(502, text="bad gateway")

    client = _client_with_handler(handler)
    with pytest.raises(ComGateError):
        await client.get_payment_status("AB12-CD34")


async def test_get_payment_status_raises_on_transport_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    client = _client_with_handler(handler)
    with pytest.raises(ComGateError):
        await client.get_payment_status("AB12-CD34")


# ---------------------------------------------------------------------------
# Request shape — create_initial_payment
# ---------------------------------------------------------------------------


async def test_create_initial_payment_sends_expected_fields() -> None:
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(
            200,
            json={
                "transId": "AB12-CD34",
                "redirect": "https://payments.comgate.cz/client/instructions/index?id=AB12-CD34",
            },
        )

    client = _client_with_handler(handler)
    result = await client.create_initial_payment(
        amount_minor=49500,
        currency="CZK",
        ref_id="invoice-123",
        label="SimpleCRM monthly – Acme",
        email="admin@acme.cz",
    )

    assert len(captured) == 1
    req = captured[0]
    assert req.method == "POST"
    assert req.url.path.endswith("/payment.json")
    body = json.loads(req.content)
    assert body["price"] == 49500
    assert body["curr"] == "CZK"
    assert body["refId"] == "invoice-123"
    assert body["email"] == "admin@acme.cz"
    assert body["initRecurring"] is True
    assert body["test"] is True  # comgate_test_mode default
    assert result.trans_id == "AB12-CD34"
    assert result.redirect_url.startswith("https://payments.comgate.cz/")


async def test_create_initial_payment_omits_test_flag_in_prod_mode() -> None:
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(200, json={"transId": "X", "redirect": "https://x"})

    client = _client_with_handler(handler, comgate_test_mode=False)
    await client.create_initial_payment(
        amount_minor=99,
        currency="CZK",
        ref_id="r",
        label="l",
        email="a@b.cz",
    )
    body = json.loads(captured[0].content)
    assert body["test"] is False


async def test_create_initial_payment_raises_comgate_error_on_4xx() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            400,
            json={"code": 1400, "message": "Invalid currency"},
        )

    client = _client_with_handler(handler)
    with pytest.raises(ComGateError) as exc_info:
        await client.create_initial_payment(
            amount_minor=1,
            currency="XYZ",
            ref_id="r",
            label="l",
            email="a@b.cz",
        )
    assert exc_info.value.code == 1400
    assert exc_info.value.http_status == 400
    assert "Invalid currency" in str(exc_info.value)


async def test_create_initial_payment_raises_on_missing_response_field() -> None:
    """Defensive: ComGate returning an unexpected response shape shouldn't
    crash with KeyError; surface a ComGateError so the caller's 502 path
    fires cleanly."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"redirect": "https://x"})  # missing transId

    client = _client_with_handler(handler)
    with pytest.raises(ComGateError):
        await client.create_initial_payment(
            amount_minor=1,
            currency="CZK",
            ref_id="r",
            label="l",
            email="a@b.cz",
        )


# ---------------------------------------------------------------------------
# Request shape — create_demo_payment (public gateway showcase)
# ---------------------------------------------------------------------------


async def test_create_demo_payment_forces_test_true_even_in_prod_mode() -> None:
    """REGRESSION GUARD: the demo-order flow is public (no auth). With
    production creds and `comgate_test_mode=False`, an inherited flag
    would let any visitor create real chargeable payments. The demo
    path must hardcode `test=true` no matter what settings say."""
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(200, json={"transId": "DM-1", "redirect": "https://x"})

    client = _client_with_handler(handler, comgate_test_mode=False)
    await client.create_demo_payment(
        amount_minor=9900,
        currency="CZK",
        ref_id="demo-abc",
        label="SimpleCRM demo",
        email="reviewer@comgate.cz",
        url_paid="https://web/objednavka/navrat?status=paid",
        url_cancelled="https://web/objednavka/navrat?status=cancelled",
        url_pending="https://web/objednavka/navrat?status=pending",
    )
    body = json.loads(captured[0].content)
    assert body["test"] is True


async def test_create_demo_payment_sends_expected_fields() -> None:
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(
            200,
            json={
                "transId": "DM12-CD34",
                "redirect": "https://payments.comgate.cz/client/instructions/index?id=DM12-CD34",
            },
        )

    client = _client_with_handler(handler)
    result = await client.create_demo_payment(
        amount_minor=29700,
        currency="CZK",
        ref_id="demo-xyz",
        label="SimpleCRM demo",
        email="a@b.cz",
        url_paid="https://web/objednavka/navrat?status=paid",
        url_cancelled="https://web/objednavka/navrat?status=cancelled",
        url_pending="https://web/objednavka/navrat?status=pending",
    )

    body = json.loads(captured[0].content)
    assert captured[0].url.path.endswith("/payment.json")
    assert body["price"] == 29700
    assert body["refId"] == "demo-xyz"
    assert body["label"] == "SimpleCRM demo"
    assert body["url_paid"].endswith("status=paid")
    assert body["url_cancelled"].endswith("status=cancelled")
    assert body["url_pending"].endswith("status=pending")
    # A demo order must never tokenize the card for recurring charges.
    assert "initRecurring" not in body
    assert result.trans_id == "DM12-CD34"


# ---------------------------------------------------------------------------
# Request shape — create_recurring_payment
# ---------------------------------------------------------------------------


async def test_create_recurring_payment_sends_init_recurring_id_in_body() -> None:
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(200, json={"transId": "NEW-TRANS-ID", "code": 0})

    client = _client_with_handler(handler)
    result = await client.create_recurring_payment(
        initial_trans_id="ORIGINAL-TRANS",
        amount_minor=49500,
        currency="CZK",
        ref_id="invoice-456",
        label="SimpleCRM upgrade",
    )

    assert len(captured) == 1
    req = captured[0]
    # v2.0 REST: dedicated /recurring.json path; the initial transId
    # rides in the JSON body as initRecurringId, NOT in the URL.
    assert req.url.path.endswith("/recurring.json")
    body = json.loads(req.content)
    assert body["initRecurringId"] == "ORIGINAL-TRANS"
    assert body["price"] == 49500
    assert body["refId"] == "invoice-456"
    assert "initRecurring" not in body  # only on the create call
    assert result.trans_id == "NEW-TRANS-ID"
    assert result.accepted is True


# ---------------------------------------------------------------------------
# disable_recurring is a no-op (ComGate recurring is merchant-initiated;
# stopping our scheduler is the real cancellation)
# ---------------------------------------------------------------------------


async def test_disable_recurring_is_noop_and_makes_no_http_call() -> None:
    """There is no ComGate endpoint to revoke a recurring mandate, and
    no need: the scheduler stops issuing charges on local cancel. So
    disable_recurring returns True without ever hitting the network."""
    called: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        called.append(request)
        return httpx.Response(200, json={"code": 0})

    client = _client_with_handler(handler)
    assert await client.disable_recurring("SOME-TRANS") is True
    assert called == []  # never touched the transport
