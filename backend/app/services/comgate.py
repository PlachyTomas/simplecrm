"""ComGate v2 REST client.

Pure HTTP transport: no DB writes, no business logic. Callers in
`api/v1/payments` and `services/billing` decide what to do with the
results.

The `_Endpoints` constants below are the ComGate v2.0 REST paths
(`.json`-suffixed), confirmed against apidoc.comgate.cz and ComGate's
own curl/PHP-SDK examples. See `docs/comgate-setup.md` and
`comgate_integration.md` for the setup walkthrough.

Authentication: HTTP Basic, `Authorization: Basic base64(merchant:secret)`
— confirmed empirically by hitting the v2.0 root and reading the 1400
error response.

Webhook verification: ComGate sends **no** HMAC/signature on its push
notification. The documented (and only) way to authenticate a callback
is to re-query the authoritative payment status with our Basic-auth
creds — see `get_payment_status`. The notification body is never
trusted beyond reading the `transId` to know which payment to re-query.
"""

from __future__ import annotations

import base64
import logging
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


class _Endpoints:
    """ComGate v2.0 REST endpoint paths, relative to `comgate_base_url`
    (which already ends in `/v2.0`).

    Recurring and refund take their target transId in the JSON **body**
    (`initRecurringId` / `transId`), not the URL path — see the methods
    below. ComGate has no "cancel recurring" endpoint: recurring is
    merchant-initiated, so stopping our scheduler IS the cancellation.
    """

    create = "/payment.json"
    recurring = "/recurring.json"
    status_query = "/payment/transId/{trans_id}.json"
    refund = "/refund.json"


class ComGateError(Exception):
    """Raised on any ComGate transport / API failure that the caller
    should surface to the customer (or log + retry).

    `code` is ComGate's numeric error code when present; `http_status`
    is the upstream HTTP status. Network failures use 0 / None.
    """

    def __init__(
        self,
        message: str,
        *,
        code: int | None = None,
        http_status: int | None = None,
    ):
        super().__init__(message)
        self.code = code
        self.http_status = http_status


@dataclass(frozen=True)
class CreatedPayment:
    """Result of a successful `create` call."""

    trans_id: str
    redirect_url: str  # ComGate-hosted payment page; redirect the customer here


@dataclass(frozen=True)
class PaymentStatus:
    """Authoritative payment state from a `get_payment_status` re-query.

    `found` distinguishes "ComGate answered, this transId is unknown"
    (spoofed/garbage callback → caller should ACK and ignore) from a
    real payment. `status` is ComGate's verbatim state, upper-cased
    (`PAID`, `CANCELLED`, `PENDING`, `AUTHORIZED`, …). `ref_id` is the
    merchant reference we set at create-time (our Charge UUID).
    """

    trans_id: str
    found: bool
    status: str | None = None
    ref_id: str | None = None
    raw: dict[str, Any] | None = None


@dataclass(frozen=True)
class RecurringChargeResult:
    """Result of a server-initiated recurring charge attempt.

    `accepted` is True iff ComGate took the charge to processing — the
    final paid/failed outcome arrives via webhook.
    """

    trans_id: str
    accepted: bool
    code: int | None = None
    message: str | None = None


def _basic_auth_header(merchant_id: str, secret: str) -> str:
    raw = f"{merchant_id}:{secret}".encode()
    return f"Basic {base64.b64encode(raw).decode()}"


def _require_credentials(settings: Settings) -> None:
    """Surface a clear 503 when billing endpoints are hit without
    ComGate creds populated. Lets the demo-seeded comp org and any
    test fixtures keep booting; only paid-plan flows require this."""
    if not (settings.comgate_merchant_id and settings.comgate_secret):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "billing_not_configured",
                "detail": (
                    "ComGate billing is not configured on this deployment. "
                    "See docs/comgate-setup.md."
                ),
            },
        )


class ComGateClient:
    """Async ComGate API client. Inject via FastAPI Depends so tests can
    swap a mock.

    Caller flow for a customer's first paid plan:
      1. `create_initial_payment(...)` → returns hosted-page URL + transId
      2. Customer enters card on ComGate's page, returns to our return URL
      3. ComGate POSTs to our webhook → handler dispatches to billing
      4. Save the transId on `PaymentMethod` so future charges can replay it

    Recurring flow (renewals + seat upgrades):
      1. `create_recurring_payment(initial_trans_id, amount_minor, label)`
      2. New transId returned; webhook lands with paid|failed status

    Cancel/disable flow (self-serve cancel-membership):
      1. `disable_recurring(initial_trans_id)` — best-effort; failure is
         logged and ignored. The customer still keeps app access through
         `current_period_ends_at` either way.
    """

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._http = http_client  # allows respx mounting in tests

    async def _client(self) -> httpx.AsyncClient:
        if self._http is not None:
            return self._http
        return httpx.AsyncClient(
            base_url=self._settings.comgate_base_url,
            headers={
                "Authorization": _basic_auth_header(
                    self._settings.comgate_merchant_id,
                    self._settings.comgate_secret,
                ),
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            timeout=15.0,
        )

    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        _require_credentials(self._settings)
        client = await self._client()
        try:
            response = await client.post(path, json=payload)
        except httpx.HTTPError as exc:
            raise ComGateError(f"ComGate transport error: {exc}") from exc
        finally:
            if self._http is None:
                await client.aclose()
        return self._unwrap(response)

    async def _get(self, path: str) -> httpx.Response:
        """Raw authenticated GET. Returns the response untouched so the
        caller can classify status codes itself (unlike `_post`, which
        raises on any 4xx). Transport failures still raise ComGateError."""
        _require_credentials(self._settings)
        client = await self._client()
        try:
            response = await client.get(path)
        except httpx.HTTPError as exc:
            raise ComGateError(f"ComGate transport error: {exc}") from exc
        finally:
            if self._http is None:
                await client.aclose()
        return response

    @staticmethod
    def _unwrap(response: httpx.Response) -> dict[str, Any]:
        try:
            body: dict[str, Any] = response.json()
        except ValueError:
            body = {}
        if response.status_code >= 400:
            raise ComGateError(
                str(body.get("message") or response.text or "ComGate error"),
                code=body.get("code"),
                http_status=response.status_code,
            )
        return body

    async def create_initial_payment(
        self,
        *,
        amount_minor: int,
        currency: str,
        ref_id: str,
        label: str,
        email: str,
        country: str = "CZ",
    ) -> CreatedPayment:
        """First-time payment with `initRecurring=true` so the resulting
        transId can be replayed for future charges.

        `ref_id` should be a unique-per-attempt string (e.g. a Charge
        UUID) — appears in the merchant portal for reconciliation.
        """
        payload: dict[str, Any] = {
            "price": amount_minor,
            "curr": currency,
            "label": label,
            "refId": ref_id,
            "email": email,
            "country": country,
            "method": "ALL",
            "initRecurring": True,
            # `test=true` makes the gateway run in sandbox mode regardless
            # of the merchant flag, so a misconfigured prod credential
            # doesn't accidentally bill a real card during dev.
            "test": self._settings.comgate_test_mode,
        }
        body = await self._post(_Endpoints.create, payload)
        try:
            return CreatedPayment(
                trans_id=str(body["transId"]),
                redirect_url=str(body["redirect"]),
            )
        except KeyError as exc:
            raise ComGateError(f"ComGate response missing expected field: {exc}") from exc

    async def create_demo_payment(
        self,
        *,
        amount_minor: int,
        currency: str,
        ref_id: str,
        label: str,
        email: str,
        url_paid: str,
        url_cancelled: str,
        url_pending: str,
        country: str = "CZ",
    ) -> CreatedPayment:
        """Public demo-order payment for the ComGate gateway showcase
        (their review team requires a visible order → gateway flow).

        `test` is **hardcoded True** — never `settings.comgate_test_mode`.
        This endpoint is reachable without auth; in production the
        settings flag is False and inheriting it would let any visitor
        create real chargeable payments. Demo payments must stay
        simulations forever.

        No `initRecurring`, and the per-payment return URLs point at
        the public order-result page instead of the portal-configured
        (auth-gated) billing return.
        """
        payload: dict[str, Any] = {
            "price": amount_minor,
            "curr": currency,
            "label": label,
            "refId": ref_id,
            "email": email,
            "country": country,
            "method": "ALL",
            "test": True,  # hardcoded — see docstring
            "url_paid": url_paid,
            "url_cancelled": url_cancelled,
            "url_pending": url_pending,
        }
        body = await self._post(_Endpoints.create, payload)
        try:
            return CreatedPayment(
                trans_id=str(body["transId"]),
                redirect_url=str(body["redirect"]),
            )
        except KeyError as exc:
            raise ComGateError(f"ComGate response missing expected field: {exc}") from exc

    async def create_recurring_payment(
        self,
        *,
        initial_trans_id: str,
        amount_minor: int,
        currency: str,
        ref_id: str,
        label: str,
    ) -> RecurringChargeResult:
        """Server-initiated charge using a previously-saved transId.

        Outcome arrives via webhook — this method's return value only
        signals whether ComGate accepted the request for processing.

        The initial payment's transId rides in the JSON body as
        `initRecurringId` (ComGate v2.0 REST), not in the URL path.
        """
        body = await self._post(
            _Endpoints.recurring,
            {
                "initRecurringId": initial_trans_id,
                "price": amount_minor,
                "curr": currency,
                "label": label,
                "refId": ref_id,
                "test": self._settings.comgate_test_mode,
            },
        )
        return RecurringChargeResult(
            trans_id=str(body.get("transId") or initial_trans_id),
            accepted=True,
            code=body.get("code"),
            message=body.get("message"),
        )

    async def get_payment_status(self, trans_id: str) -> PaymentStatus:
        """Re-query ComGate for the authoritative state of a payment.

        This is the webhook's verification step: ComGate signs nothing,
        so a callback is only trusted insofar as our own authenticated
        status query confirms it. Returns:

          - `found=True` + status/ref_id on a known transaction;
          - `found=False` when ComGate answers but the transId is
            unknown (spoofed/garbage callback) — caller ACKs and ignores;
          - raises `ComGateError` on transport failure or a 5xx, so the
            caller can return a retryable response and ComGate re-sends.
        """
        path = _Endpoints.status_query.format(trans_id=trans_id)
        response = await self._get(path)
        if response.status_code >= 500:
            raise ComGateError(
                "ComGate status query upstream error",
                http_status=response.status_code,
            )
        try:
            body: dict[str, Any] = response.json()
        except ValueError:
            body = {}
        code = body.get("code")
        # ComGate returns a non-zero `code` (and/or 404) for an unknown
        # transId. Treat that as "answered, but unknown" → ignore, don't
        # make ComGate retry a bogus callback 1000×.
        if response.status_code == 404 or (code not in (None, 0, "0")):
            return PaymentStatus(trans_id=trans_id, found=False, raw=body)
        if response.status_code >= 400:
            raise ComGateError(
                str(body.get("message") or "ComGate status query failed"),
                code=code if isinstance(code, int) else None,
                http_status=response.status_code,
            )
        status_value = str(body.get("status") or "").upper() or None
        return PaymentStatus(
            trans_id=str(body.get("transId") or trans_id),
            found=True,
            status=status_value,
            ref_id=body.get("refId"),
            raw=body,
        )

    async def disable_recurring(self, initial_trans_id: str) -> bool:
        """No-op kept for call-site compatibility.

        ComGate recurring charges are **merchant-initiated** — there is
        no saved-card mandate to revoke and no v2.0 endpoint to cancel
        one. The cancellation that matters is local: once our scheduler
        stops issuing `create_recurring_payment` calls (subscription
        status='canceled'), no further charge ever happens. So this just
        returns True without touching the network; callers
        (`subscription`, `org_erasure`) can keep their best-effort
        `await comgate.disable_recurring(...)` line unchanged.
        """
        return True


# Module-level singleton so FastAPI Depends doesn't rebuild on every
# request. Tests pass their own instance via dependency override.
_default_client: ComGateClient | None = None


def get_comgate_client() -> ComGateClient:
    global _default_client
    if _default_client is None:
        _default_client = ComGateClient()
    return _default_client


def reset_default_client() -> None:
    """Test helper: clear the cached singleton between tests that mutate
    settings. Production code never calls this."""
    global _default_client
    _default_client = None


__all__ = [
    "ComGateClient",
    "ComGateError",
    "CreatedPayment",
    "PaymentStatus",
    "RecurringChargeResult",
    "get_comgate_client",
    "reset_default_client",
]
