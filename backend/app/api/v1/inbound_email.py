"""Smart BCC endpoints — the public capture hook plus the user's own address.

Two routers live here because they have opposite auth models:

  * ``router`` — ``POST /api/v1/inbound-email``. Mounted **outside**
    ``PROTECTED_DEPS``: the caller is an MTA-side worker (Cloudflare Email
    Routing), which carries no session and no org context. Same precedent as
    the ComGate webhook and the open/click tracking pixels. The
    ``X-Inbound-Secret`` header is the only credential, compared in constant
    time against ``settings.inbound_shared_secret``.
  * ``me_router`` — ``/api/v1/me/inbound-address``. Ordinary authenticated,
    org-gated surface where the user reads (or rotates) their magic address.

Accepted request shapes for the capture hook, in preference order:

  1. the raw RFC 5322 bytes as the request body with
     ``Content-Type: message/rfc822`` — byte-exact and what the worker in
     docs/inbound-email-setup.md sends (``body: message.raw``, zero encoding);
  2. JSON ``{"raw_mime": "..."}`` where the string is base64 (a plain-text
     message is accepted as a fallback, which keeps ``curl`` smoke tests easy).

Everything that is not an auth failure or an over-size body answers 2xx: a
4xx/5xx would make the mail server retry or bounce over a routing decision we
already made deliberately.
"""

from __future__ import annotations

import base64
import binascii
import hmac
import json
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import get_current_user
from app.db import get_db
from app.db.models import User
from app.schemas.inbound_email import (
    InboundAddressOut,
    InboundEmailIn,
    InboundEmailResult,
    InboundOutcome,
)
from app.services.inbound_email import inbound_address_for, inbound_local_part
from app.services.inbound_email import record_inbound_message as _record
from app.services.lookup_cache import RateLimiter

router = APIRouter(tags=["inbound-email"])
me_router = APIRouter(prefix="/me/inbound-address", tags=["inbound-email"])

# 12 bytes -> 24-char lowercase hex token. Still 96 bits (guessing is
# hopeless) and still typable, but deliberately NOT `token_urlsafe`: an
# address that reaches us has been through `getaddresses` + lower-casing in
# `services.inbound_email`, so a token carrying upper-case characters could
# never be matched back to its user. Minting from a case-flat alphabet keeps
# the address the user copies out of Settings identical to the one we can
# recognise, whatever the MTA chain does to its case on the way in.
_TOKEN_BYTES = 12

# Dev-only stand-in for an unset `INBOUND_SHARED_SECRET`. Neither the docker
# dev stack nor host mode sets one, so without this every dev/demo POST — the
# smoke test in docs/inbound-email-setup.md included — answers 401 and the
# feature cannot be exercised locally at all. Outside dev this is unreachable:
# `Settings._require_inbound_shared_secret` refuses to boot with an empty
# secret, so a deployment can never fall back to a value that is in the repo.
# Same trade-off (and same shape) as `_DEFAULT_JWT_SECRET` in core.config.
_DEV_FALLBACK_SECRET = "dev-inbound-secret"  # noqa: S105

# Outcome -> HTTP status. All 2xx (see the module docstring); the distinction
# only exists so the worker's logs are readable.
# Back-pressure for the public capture hook (security-delta review R1 P3).
# The shared secret is the real gate, so this is not an anti-abuse control
# against the internet — it bounds the damage from a compromised or looping
# forwarding worker, which would otherwise be free to hammer us (each request
# costs a full MIME parse). Sized well above the busiest plausible mail volume
# for one deployment so ordinary bursts never trip it.
_INBOUND_RATE_LIMITER = RateLimiter(max_calls=600, window_seconds=60)


def get_inbound_rate_limiter() -> RateLimiter:
    """FastAPI dependency — overridable in tests."""
    return _INBOUND_RATE_LIMITER


_STATUS_BY_OUTCOME = {
    InboundOutcome.matched: status.HTTP_201_CREATED,
    InboundOutcome.unmatched: status.HTTP_201_CREATED,
    InboundOutcome.duplicate: status.HTTP_200_OK,
    InboundOutcome.no_token: status.HTTP_202_ACCEPTED,
    InboundOutcome.no_org: status.HTTP_202_ACCEPTED,
}


def _require_secret(provided: str | None) -> None:
    """Constant-time check of the shared secret.

    An unconfigured secret still rejects everything outside dev — and outside
    dev `Settings` refuses to boot without one, so that branch is unreachable
    in a real deployment. In dev an unset secret falls back to
    `_DEV_FALLBACK_SECRET` so the endpoint is exercisable locally.
    """
    settings = get_settings()
    expected = settings.inbound_shared_secret.strip()
    if not expected and settings.app_env == "dev":
        expected = _DEV_FALLBACK_SECRET
    # Compare bytes, not str: compare_digest raises TypeError on non-ASCII, and
    # Starlette latin-1-decodes raw header bytes, so any byte >= 0x80 in the
    # header would turn an unauthenticated request into a 500 (and a stack
    # trace) instead of a clean 401.
    if (
        not expected
        or provided is None
        or not hmac.compare_digest(provided.encode("utf-8", "replace"), expected.encode("utf-8"))
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid inbound secret",
        )


async def _read_raw_message(request: Request) -> bytes:
    """Pull the raw MIME out of the request, enforcing the size cap first.

    `Content-Length` is checked before anything is read, then the body is
    consumed chunk by chunk and abandoned the moment it crosses the cap — the
    Cloudflare worker streams `message.raw` with no declared length, so the
    header check alone would be no protection at all.
    """
    settings = get_settings()
    max_bytes = settings.inbound_max_bytes
    too_large = HTTPException(
        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
        detail="Message too large",
    )
    declared = request.headers.get("content-length")
    if declared is not None:
        try:
            oversized = int(declared) > max_bytes
        except ValueError:
            oversized = False  # Unparseable header — the streaming check covers us.
        if oversized:
            raise too_large

    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > max_bytes:
            raise too_large
        chunks.append(chunk)
    body = b"".join(chunks)
    if not body:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Empty request body",
        )

    if not request.headers.get("content-type", "").lower().startswith("application/json"):
        return body

    try:
        payload = InboundEmailIn.model_validate(json.loads(body))
    except (json.JSONDecodeError, ValidationError, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail='Expected JSON body {"raw_mime": "<base64 or raw message>"}',
        ) from exc
    return _decode_raw_mime(payload.raw_mime)


def _decode_raw_mime(value: str) -> bytes:
    """base64 first, plain text as the fallback.

    A real RFC 5322 message is never valid strict base64 (a header line's
    colon alone disqualifies it), so `validate=True` disambiguates the two
    shapes reliably without a flag on the request.
    """
    compact = "".join(value.split())
    if compact:
        try:
            return base64.b64decode(compact, validate=True)
        except (binascii.Error, ValueError):
            pass
    return value.encode("utf-8", errors="replace")


@router.post(
    "/inbound-email",
    response_model=InboundEmailResult,
    status_code=status.HTTP_201_CREATED,
    summary="Capture a BCC'd email (public, shared-secret auth)",
)
async def receive_inbound_email(
    request: Request,
    response: Response,
    x_inbound_secret: Annotated[str | None, Header()] = None,
    session: AsyncSession = Depends(get_db),
    rate_limiter: RateLimiter = Depends(get_inbound_rate_limiter),
) -> InboundEmailResult:
    _require_secret(x_inbound_secret)
    # Keyed by client IP: the forwarding worker is a small, stable set of
    # egress addresses. 429 (not a 2xx) so a looping worker is told to slow
    # down and the message is retried rather than silently dropped.
    client_ip = request.client.host if request.client else "unknown"
    if not await rate_limiter.try_acquire(f"inbound:{client_ip}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many inbound messages; retry shortly.",
        )
    raw = await _read_raw_message(request)
    result = await _record(session, raw=raw)
    response.status_code = _STATUS_BY_OUTCOME[result.outcome]
    return InboundEmailResult(
        outcome=result.outcome,
        email_id=result.email.id if result.email is not None else None,
        company_id=result.company.id if result.company is not None else None,
        deal_id=result.deal.id if result.deal is not None else None,
        contact_id=result.contact.id if result.contact is not None else None,
    )


def _mint_token() -> str:
    """A fresh inbound token — see `_TOKEN_BYTES` for why it is case-flat."""
    return secrets.token_hex(_TOKEN_BYTES)


async def _ensure_token(session: AsyncSession, user: User) -> str:
    """Mint the user's token on first read (lazily, so no backfill is needed)."""
    if not user.inbound_token:
        user.inbound_token = _mint_token()
        await session.commit()
        await session.refresh(user)
    return user.inbound_token or ""


def _address_out(token: str) -> InboundAddressOut:
    return InboundAddressOut(
        address=inbound_address_for(token), local_part=inbound_local_part(token)
    )


@me_router.get("", response_model=InboundAddressOut)
async def get_inbound_address(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> InboundAddressOut:
    return _address_out(await _ensure_token(session, user))


@me_router.post("/rotate", response_model=InboundAddressOut)
async def rotate_inbound_address(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> InboundAddressOut:
    """Issue a fresh token; anything BCC'd to the old address stops being filed."""
    user.inbound_token = _mint_token()
    await session.commit()
    await session.refresh(user)
    return _address_out(user.inbound_token or "")
