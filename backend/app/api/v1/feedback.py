"""POST /api/v1/feedback — bug reports + improvement suggestions.

Authenticated users send a short caption + body, optionally with image
attachments (screenshots). The endpoint composes a transactional email
to `FEEDBACK_RECIPIENT_EMAIL` with `Reply-To` set to the submitter, so
the founder can hit Reply and land on the user's inbox without needing
a separate ticketing system.

Limits, enforced server-side regardless of any frontend caps:
  * max 5 attachments per submission
  * max 5 MB per attachment, 15 MB across all attachments
  * only `image/png`, `image/jpeg`, `image/webp` accepted — checked
    against the actual leading bytes, not just the client-provided
    Content-Type, so a renamed `.exe` won't slip through.
  * per-user rate limit: 5 submissions / 5 min (existing pattern from
    the registry-lookup endpoint).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.core.config import get_settings
from app.core.deps import get_current_user
from app.db.models import User
from app.schemas.feedback import FeedbackAccepted, FeedbackKind
from app.services.email import Email, EmailAttachment, send_email
from app.services.lookup_cache import RateLimiter

router = APIRouter(prefix="/feedback", tags=["feedback"])

# Module-level singleton so the bucket survives across requests. 5
# submissions per 5 minutes per user — generous for genuine bursts
# (multiple screenshots = multiple tries until the user gets the form
# right) but tight enough that a malicious admin can't flood the
# founder's inbox.
_FEEDBACK_RATE_LIMITER = RateLimiter(max_calls=5, window_seconds=300)


def get_feedback_rate_limiter() -> RateLimiter:
    return _FEEDBACK_RATE_LIMITER


MAX_ATTACHMENTS = 5
MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
MAX_TOTAL_ATTACHMENT_BYTES = 15 * 1024 * 1024

# Magic-byte signatures for the formats we accept. Validated against
# the actual leading bytes so a renamed binary can't masquerade as an
# image by setting Content-Type.
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
_JPEG_MAGIC = b"\xff\xd8\xff"
_WEBP_PREFIX = b"RIFF"
_WEBP_TAG = b"WEBP"

ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}


def _detect_content_type(blob: bytes) -> str | None:
    if blob.startswith(_PNG_MAGIC):
        return "image/png"
    if blob.startswith(_JPEG_MAGIC):
        return "image/jpeg"
    if blob.startswith(_WEBP_PREFIX) and len(blob) >= 12 and blob[8:12] == _WEBP_TAG:
        return "image/webp"
    return None


def _safe_filename(raw: str | None, fallback: str) -> str:
    """Strip directory parts; collapse anything weird to `fallback`."""
    if not raw:
        return fallback
    cleaned = raw.rsplit("/", 1)[-1].rsplit("\\", 1)[-1].strip()
    return cleaned or fallback


_KIND_PREFIX: dict[FeedbackKind, str] = {
    FeedbackKind.bug: "[BUG]",
    FeedbackKind.improvement: "[Improvement]",
}

_KIND_CS_LABEL: dict[FeedbackKind, str] = {
    FeedbackKind.bug: "Chyba",
    FeedbackKind.improvement: "Vylepšení",
}


@router.post("", response_model=FeedbackAccepted, status_code=status.HTTP_202_ACCEPTED)
async def submit_feedback(
    kind: Annotated[FeedbackKind, Form()],
    caption: Annotated[str, Form(min_length=1, max_length=200)],
    body: Annotated[str, Form(min_length=1, max_length=10_000)],
    attachments: Annotated[list[UploadFile] | None, File()] = None,
    user: User = Depends(get_current_user),
    rate_limiter: RateLimiter = Depends(get_feedback_rate_limiter),
) -> FeedbackAccepted:
    if not await rate_limiter.try_acquire(user.id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Příliš mnoho zpětných vazeb. Zkuste to prosím za chvíli.",
        )

    files = attachments or []
    if len(files) > MAX_ATTACHMENTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximálně {MAX_ATTACHMENTS} příloh.",
        )

    parsed: list[EmailAttachment] = []
    total_size = 0
    for index, upload in enumerate(files, start=1):
        chunk = await upload.read(MAX_ATTACHMENT_BYTES + 1)
        if len(chunk) > MAX_ATTACHMENT_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Příloha č. {index} je větší než {MAX_ATTACHMENT_BYTES // 1_048_576} MB.",
            )
        total_size += len(chunk)
        if total_size > MAX_TOTAL_ATTACHMENT_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Souhrnná velikost příloh přesahuje "
                    f"{MAX_TOTAL_ATTACHMENT_BYTES // 1_048_576} MB."
                ),
            )

        detected = _detect_content_type(chunk)
        if detected is None or detected not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(f"Příloha č. {index}: povolené formáty jsou PNG, JPEG a WebP."),
            )

        ext = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}[detected]
        parsed.append(
            EmailAttachment(
                filename=_safe_filename(upload.filename, f"screenshot-{index}.{ext}"),
                content_type=detected,
                content=chunk,
            )
        )

    settings = get_settings()
    org_name = (
        user.organization.name
        if user.organization_id is not None and user.organization is not None
        else "—"
    )
    subject = f"SimpleCRM {_KIND_PREFIX[kind]} {caption}"
    text = (
        f"Druh: {_KIND_CS_LABEL[kind]}\n"
        f"Od: {user.name} <{user.email}>\n"
        f"Organizace: {org_name}\n"
        f"Role: {user.role.value}\n"
        f"User-Agent: (viz hlavičky odpovědi prohlížeče)\n"
        f"\n"
        f"--- Zpráva ---\n"
        f"{body}\n"
    )

    await send_email(
        Email(
            to=settings.feedback_recipient_email,
            subject=subject,
            body=text,
            reply_to=user.email,
            attachments=tuple(parsed),
        )
    )

    return FeedbackAccepted(delivered=True, recipient=settings.feedback_recipient_email)
