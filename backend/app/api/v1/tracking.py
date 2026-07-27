"""Public open/click tracking endpoints (`/api/v1/t/...`).

Hit by the *recipient's* mail client and browser, so this router is
deliberately mounted outside `PROTECTED_DEPS` and carries no auth at all —
same precedent as the ComGate webhook and the Google OAuth callbacks. The
tokens are the only credential: 128 bits of entropy, one per send.

Two guarantees shape the handlers:

  * **The pixel never leaks.** An unknown/expired token still returns the
    GIF with 200. A 404 would let anyone probe which tokens exist, and a
    broken-image icon in the recipient's mail is a support ticket.
  * **The redirect can never be opened.** The target is signed (HMAC over
    token + encoded target); a bad signature, a malformed payload, or a
    non-http(s) scheme is a 400 — we never emit an unverified `Location`.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.db.models import EmailCampaignRecipient, SentEmail
from app.services.email_tracking import (
    TRACKING_PIXEL_CONTENT_TYPE,
    TRACKING_PIXEL_GIF,
    decode_target,
    is_safe_target,
    verify_signature,
)

router = APIRouter(prefix="/t", tags=["tracking"])

# Mail clients and corporate proxies cache aggressively; without this the
# second open of the same mail would never reach us.
_NO_STORE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Pragma": "no-cache",
}


async def _record_event(session: AsyncSession, token: str, *, clicked: bool) -> bool:
    """Stamp the first-event timestamp and bump the counter for `token`.

    Written as a single UPDATE per table (`coalesce` keeps the *first*
    timestamp) so concurrent opens can't lose a count to a read-modify-write
    race. Composer sends and campaign recipients share the token space;
    `sent_emails` is checked first because it's the far more common surface.
    Returns whether a row matched — callers only use it for logging/tests.
    """
    now = datetime.now(tz=UTC)
    models: tuple[type[SentEmail] | type[EmailCampaignRecipient], ...] = (
        SentEmail,
        EmailCampaignRecipient,
    )
    for model in models:
        values: dict[str, Any]
        if clicked:
            values = {
                "clicked_at": func.coalesce(model.clicked_at, now),
                "click_count": model.click_count + 1,
            }
        else:
            values = {
                "opened_at": func.coalesce(model.opened_at, now),
                "open_count": model.open_count + 1,
            }
        result = await session.execute(
            update(model).where(model.tracking_token == token).values(**values).returning(model.id)
        )
        if result.first() is not None:
            await session.commit()
            return True
    return False


@router.get(
    "/o/{token}",
    response_class=Response,
    responses={200: {"content": {TRACKING_PIXEL_CONTENT_TYPE: {}}}},
)
async def track_open(token: str, session: AsyncSession = Depends(get_db)) -> Response:
    """Record an open and return the 1x1 transparent GIF (always 200)."""
    await _record_event(session, token, clicked=False)
    return Response(
        content=TRACKING_PIXEL_GIF,
        media_type=TRACKING_PIXEL_CONTENT_TYPE,
        headers=_NO_STORE_HEADERS,
    )


@router.get("/c/{token}", response_class=RedirectResponse)
async def track_click(
    token: str,
    u: str = Query(..., description="URL-safe base64 of the click target"),
    s: str = Query(..., description="Truncated HMAC over token + '.' + u"),
    session: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Verify the signature, record the click, then 302 to the target."""
    if not verify_signature(token, u, s):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid tracking link")
    target = decode_target(u)
    if target is None or not is_safe_target(target):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid tracking link")
    # Redirect ONLY for a token that belongs to a real send. Without this the
    # endpoint is a general-purpose open redirect on the API origin: the
    # signature alone proves nothing about the token, so anyone able to mint
    # one (i.e. anyone who can send themselves a tracked mail) could point an
    # api.simplecrm.cz link anywhere. Unknown token → 400, same as a bad sig.
    if not await _record_event(session, token, clicked=True):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid tracking link")
    return RedirectResponse(
        url=target,
        status_code=status.HTTP_302_FOUND,
        headers=_NO_STORE_HEADERS,
    )
