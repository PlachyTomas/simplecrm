"""Open + click tracking for outbound mail.

Every tracked send gets a random `tracking_token` (persisted on the
`sent_emails` row for composer sends, on the `email_campaign_recipients`
row for bulk campaigns). The token addresses two **public**, unauthenticated
endpoints (`app/api/v1/tracking.py`):

  * `GET /api/v1/t/o/{token}` — a 1x1 transparent GIF embedded in the HTML
    part; fetching it records the open.
  * `GET /api/v1/t/c/{token}?u=<b64 target>&s=<sig>` — a link wrapper that
    records the click and 302s onward.

The click target rides in the query string, so it MUST be signed: without a
signature the endpoint would be an open redirect for anyone who can craft a
URL. `s` is an HMAC-SHA256 over `token + "." + u` keyed with the app's
`jwt_secret`, truncated to 32 hex chars — plenty against forgery, short
enough to keep the link readable.

The plain-text part of every mail keeps the *original*, un-rewritten URLs:
tracking is a best-effort HTML-only affair, and a text-only reader should
never be handed a redirector link.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import html
import re
import secrets
from urllib.parse import urlparse

from app.core.config import get_settings

# A 42-byte 1x1 fully-transparent GIF87a/89a. Hardcoded so the pixel needs no
# asset file on disk and no image library at request time.
TRACKING_PIXEL_GIF = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff"
    b"!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00"
    b"\x02\x01D\x00;"
)
TRACKING_PIXEL_CONTENT_TYPE = "image/gif"

# 16 bytes of entropy -> 22-char urlsafe token. Unguessable, and short enough
# that the wrapped links stay reasonable.
_TOKEN_BYTES = 16
# Truncated HMAC. 32 hex chars = 128 bits.
_SIGNATURE_LENGTH = 32

# Deliberately permissive on the URL body but stops at whitespace and the
# characters that would break out of an HTML attribute.
_URL_RE = re.compile(r"https?://[^\s<>\"']+")
# Sentence punctuation that regularly trails a URL in prose and is almost
# never part of it.
_TRAILING_PUNCTUATION = ".,;:!?)]}>\"'"

_ALLOWED_SCHEMES = ("http", "https")


def new_tracking_token() -> str:
    """A fresh per-send tracking token."""
    return secrets.token_urlsafe(_TOKEN_BYTES)


def encode_target(url: str) -> str:
    """URL-safe base64 of the click target, padding stripped (`=` in a query
    string is legal but noisy, and `decode_target` restores it)."""
    return base64.urlsafe_b64encode(url.encode("utf-8")).decode("ascii").rstrip("=")


def decode_target(encoded: str) -> str | None:
    """Inverse of `encode_target`. Returns None for anything that isn't valid
    base64 of valid UTF-8 — the caller answers with a 400, never a redirect."""
    padded = encoded + "=" * (-len(encoded) % 4)
    try:
        raw = base64.urlsafe_b64decode(padded.encode("ascii"))
    except (binascii.Error, ValueError):
        return None
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return None


def _signing_key() -> bytes:
    """Key for tracking-link signatures, derived from — never equal to — the JWT
    secret. `verify_signature` is an unauthenticated oracle over attacker-chosen
    input; running it on the same key that signs access tokens would put that key
    one truncation-widening away from an auth problem. Domain separation is free.
    """
    return hmac.new(
        get_settings().jwt_secret.encode("utf-8"),
        b"simplecrm/email-tracking/v1",
        hashlib.sha256,
    ).digest()


def sign_target(token: str, encoded_target: str) -> str:
    """HMAC-SHA256(derived key, "<token>.<encoded_target>"), truncated hex.

    Binding the signature to the token as well as the target means a
    signature harvested from one mail can't be replayed onto another.
    """
    payload = f"{token}.{encoded_target}".encode()
    return hmac.new(_signing_key(), payload, hashlib.sha256).hexdigest()[:_SIGNATURE_LENGTH]


def verify_signature(token: str, encoded_target: str, signature: str) -> bool:
    # compare_digest raises TypeError on non-ASCII str, and this runs on an
    # unauthenticated endpoint reachable by anything on the internet (mail
    # scanners mangle query params in the wild) — compare bytes so a junk
    # signature is a plain mismatch instead of a 500.
    expected = sign_target(token, encoded_target).encode("ascii")
    return hmac.compare_digest(expected, signature.encode("utf-8", "replace"))


def is_safe_target(url: str) -> bool:
    """Only absolute http(s) URLs may be redirected to.

    Rejects `javascript:`/`data:`/relative targets, and any control character
    (a raw newline in a `Location:` value is a header-injection vector).
    """
    if not url or any(ch < " " or ch == "\x7f" for ch in url):
        return False
    parsed = urlparse(url)
    return parsed.scheme in _ALLOWED_SCHEMES and bool(parsed.netloc)


def _api_origin() -> str:
    settings = get_settings()
    return f"{settings.public_api_base_url.rstrip('/')}{settings.api_v1_prefix}"


def pixel_url(token: str) -> str:
    """Absolute URL of the open pixel for `token`."""
    return f"{_api_origin()}/t/o/{token}"


def click_url(token: str, target: str) -> str:
    """Absolute, signed click-through URL wrapping `target`."""
    encoded = encode_target(target)
    return f"{_api_origin()}/t/c/{token}?u={encoded}&s={sign_target(token, encoded)}"


def _escape_text(text: str) -> str:
    """HTML-escape a plain-text run and keep its line breaks visible."""
    return html.escape(text).replace("\r\n", "\n").replace("\r", "\n").replace("\n", "<br>")


def build_tracked_html(body: str, token: str) -> str:
    """Render `body` (plain text) as the HTML alternative part of a tracked mail.

    Escaping happens per text run *around* the matched URLs rather than over
    the whole body first, so the href keeps the original URL's `&` instead of
    an `&amp;`-mangled one while the visible link text is still escaped.
    """
    chunks: list[str] = []
    cursor = 0
    for match in _URL_RE.finditer(body):
        raw = match.group(0)
        trailing = ""
        while raw and raw[-1] in _TRAILING_PUNCTUATION:
            trailing = raw[-1] + trailing
            raw = raw[:-1]
        chunks.append(_escape_text(body[cursor : match.start()]))
        if raw and is_safe_target(raw):
            href = html.escape(click_url(token, raw), quote=True)
            chunks.append(f'<a href="{href}">{html.escape(raw)}</a>')
        else:
            chunks.append(_escape_text(raw))
        chunks.append(_escape_text(trailing))
        cursor = match.end()
    chunks.append(_escape_text(body[cursor:]))

    pixel = (
        f'<img src="{html.escape(pixel_url(token), quote=True)}" '
        'width="1" height="1" alt="" style="display:none" />'
    )
    return (
        f'<html><body><div style="white-space:normal">{"".join(chunks)}</div>{pixel}</body></html>'
    )
