"""Tests for `services/comgate.ComGateClient`.

HTTP transport is mocked via `httpx.MockTransport` so no respx
dependency is needed. Coverage:

  - Basic-auth header is correctly base64-encoded
  - 503 surfaces (not 500) when credentials are absent
  - HMAC-SHA256 webhook signature verification (positive/negative/case)
  - Request shape for create_initial_payment + create_recurring_payment
  - Error mapping: 4xx with ComGate's `code` field becomes ComGateError
  - disable_recurring is best-effort (returns False, doesn't raise)
"""

from __future__ import annotations

import base64
import hashlib
import hmac
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
# Webhook signature verification
# ---------------------------------------------------------------------------


def test_verify_webhook_signature_accepts_correct_hmac() -> None:
    settings = _settings_with_creds()
    client = ComGateClient(settings=settings)
    raw = b'{"transId":"AB12-CD34","status":"PAID"}'
    expected = hmac.new(settings.comgate_secret.encode(), raw, hashlib.sha256).hexdigest()
    assert client.verify_webhook_signature(raw_body=raw, signature_header=expected) is True


def test_verify_webhook_signature_rejects_wrong_hmac() -> None:
    settings = _settings_with_creds()
    client = ComGateClient(settings=settings)
    raw = b'{"transId":"AB12-CD34","status":"PAID"}'
    assert client.verify_webhook_signature(raw_body=raw, signature_header="0" * 64) is False


def test_verify_webhook_signature_rejects_missing_header() -> None:
    settings = _settings_with_creds()
    client = ComGateClient(settings=settings)
    assert client.verify_webhook_signature(raw_body=b"x", signature_header=None) is False
    assert client.verify_webhook_signature(raw_body=b"x", signature_header="") is False


def test_verify_webhook_signature_case_insensitive() -> None:
    """Some merchant portals upper-case the hex; tolerate both."""
    settings = _settings_with_creds()
    client = ComGateClient(settings=settings)
    raw = b'{"transId":"X","status":"PAID"}'
    expected = hmac.new(settings.comgate_secret.encode(), raw, hashlib.sha256).hexdigest()
    assert client.verify_webhook_signature(raw_body=raw, signature_header=expected.upper()) is True


def test_verify_webhook_signature_rejects_when_body_tampered() -> None:
    """Critical: a flipped byte in the body must invalidate the signature."""
    settings = _settings_with_creds()
    client = ComGateClient(settings=settings)
    original = b'{"transId":"X","status":"PAID","price":9900}'
    tampered = b'{"transId":"X","status":"PAID","price":1}'
    sig = hmac.new(settings.comgate_secret.encode(), original, hashlib.sha256).hexdigest()
    assert client.verify_webhook_signature(raw_body=tampered, signature_header=sig) is False


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
    assert req.url.path.endswith("/payment")
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
    assert captured[0].url.path.endswith("/payment")
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


async def test_create_recurring_payment_uses_initial_trans_id_in_path() -> None:
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
    assert req.url.path.endswith("/payment/ORIGINAL-TRANS/recurring")
    body = json.loads(req.content)
    assert body["price"] == 49500
    assert body["refId"] == "invoice-456"
    assert "initRecurring" not in body  # only on the create call
    assert result.trans_id == "NEW-TRANS-ID"
    assert result.accepted is True


# ---------------------------------------------------------------------------
# disable_recurring is best-effort
# ---------------------------------------------------------------------------


async def test_disable_recurring_returns_true_on_success() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"code": 0})

    client = _client_with_handler(handler)
    assert await client.disable_recurring("SOME-TRANS") is True


async def test_disable_recurring_returns_false_on_4xx_without_raising() -> None:
    """Self-serve cancel must never abort because ComGate had a hiccup —
    the local cancel is what actually stops further charges."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"code": 1400, "message": "Not found"})

    client = _client_with_handler(handler)
    assert await client.disable_recurring("MISSING-TRANS") is False


async def test_disable_recurring_returns_false_on_transport_error() -> None:
    """Network failure shouldn't propagate as an exception."""

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    client = _client_with_handler(handler)
    assert await client.disable_recurring("SOME-TRANS") is False
