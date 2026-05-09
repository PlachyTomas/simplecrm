"""ComGate v2 REST client.

Pure HTTP transport: no DB writes, no business logic. Callers in
`api/v1/payments` and `services/billing` decide what to do with the
results.

ComGate's full path catalog lives in the merchant portal (gated behind
their KYC); the constants in `_Endpoints` below match the v2.0 REST
shape but are exposed as overridable so the integration owner can
adjust without code surgery if ComGate's portal documents a different
path. See `docs/comgate-setup.md` for the setup walkthrough.

Authentication: HTTP Basic, `Authorization: Basic base64(merchant:secret)`
— confirmed empirically by hitting the v2.0 root and reading the 1400
error response.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


class _Endpoints:
    """Centralized endpoint paths so the owner can patch without
    hunting through the codebase if ComGate documents different URLs.

    Confirm against the merchant portal under "Pomoc → API protokol"
    before going live.
    """

    create = "/payment"
    recurring = "/payment/{trans_id}/recurring"
    cancel_recurring = "/payment/{trans_id}/cancelRecurring"
    status_query = "/payment/{trans_id}"
    refund = "/payment/{trans_id}/refund"


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
        """
        path = _Endpoints.recurring.format(trans_id=initial_trans_id)
        body = await self._post(
            path,
            {
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

    async def disable_recurring(self, initial_trans_id: str) -> bool:
        """Best-effort revoke of the saved-card authorization on
        ComGate's side. Returns True on success; False if the call
        failed but the caller should still proceed with local cancel.

        We don't raise — local cancel (status='canceled') is what
        actually stops future scheduled charges, and that's owned by
        our scheduler. ComGate-side disable is just hygiene.
        """
        _require_credentials(self._settings)
        path = _Endpoints.cancel_recurring.format(trans_id=initial_trans_id)
        client = await self._client()
        try:
            try:
                response = await client.post(path, json={})
            finally:
                if self._http is None:
                    await client.aclose()
        except httpx.HTTPError as exc:
            logger.warning(
                "ComGate disable_recurring transport failure for %s: %s",
                initial_trans_id,
                exc,
            )
            return False
        if response.status_code >= 400:
            logger.warning(
                "ComGate disable_recurring failed for %s: HTTP %s body=%s",
                initial_trans_id,
                response.status_code,
                response.text[:200],
            )
            return False
        return True

    def verify_webhook_signature(
        self,
        *,
        raw_body: bytes,
        signature_header: str | None,
    ) -> bool:
        """Verify ComGate's HMAC-SHA256 signature on a webhook callback.

        ComGate documents the canonical-string + header name in the
        merchant portal under "Notifikace → Ověření podpisu" — this
        implementation uses the standard `HMAC-SHA256(secret, raw_body)`
        hex digest, which is the v2 default. If your portal documents a
        different signing scheme, override this method via subclass.
        """
        if not signature_header:
            return False
        _require_credentials(self._settings)
        expected = hmac.new(
            self._settings.comgate_secret.encode(),
            raw_body,
            hashlib.sha256,
        ).hexdigest()
        # Constant-time compare; case-insensitive because some portals
        # uppercase the hex.
        return hmac.compare_digest(expected.lower(), signature_header.lower())


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
    "RecurringChargeResult",
    "get_comgate_client",
    "reset_default_client",
]
