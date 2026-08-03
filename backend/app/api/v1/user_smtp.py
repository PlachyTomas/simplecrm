"""Endpoints for per-user SMTP settings (`/api/v1/me/smtp`).

Bulk email is sent from the user's own mailbox, so each user configures and
verifies their own SMTP target here. The password is Fernet-encrypted at
rest and never returned. A successful `POST /test` sets `verified_at`, which
the bulk-email feature requires before it will send.
"""

from __future__ import annotations

import asyncio
import smtplib
import ssl
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.token_crypto import TokenDecryptError, decrypt_token, encrypt_token
from app.db import get_db
from app.db.models import User, UserSmtpSettings
from app.schemas.user_smtp import SmtpTestResult, UserSmtpSettingsIn, UserSmtpSettingsOut
from app.services.email import SmtpConfig, verify_smtp

router = APIRouter(prefix="/me/smtp", tags=["smtp"])


async def _get(session: AsyncSession, user: User) -> UserSmtpSettings | None:
    return (
        await session.execute(select(UserSmtpSettings).where(UserSmtpSettings.user_id == user.id))
    ).scalar_one_or_none()


def _to_out(row: UserSmtpSettings) -> UserSmtpSettingsOut:
    return UserSmtpSettingsOut(
        host=row.host,
        port=row.port,
        use_ssl=row.use_ssl,
        use_starttls=row.use_starttls,
        username=row.username,
        from_email=row.from_email,
        from_name=row.from_name,
        signature=row.signature,
        has_password=bool(row.password_encrypted),
        verified=row.verified_at is not None,
        verified_at=row.verified_at,
    )


def smtp_config_for(row: UserSmtpSettings) -> SmtpConfig:
    """Build a send-ready `SmtpConfig` from a stored row (decrypts password)."""
    sender = f"{row.from_name} <{row.from_email}>" if row.from_name else row.from_email
    return SmtpConfig(
        host=row.host,
        port=row.port,
        use_ssl=row.use_ssl,
        use_starttls=row.use_starttls,
        username=row.username,
        password=decrypt_token(row.password_encrypted),
        sender=sender,
    )


@router.get("")
async def get_smtp(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> UserSmtpSettingsOut | dict[str, bool]:
    row = await _get(session, user)
    if row is None:
        return {"configured": False}
    return _to_out(row)


@router.put("", response_model=UserSmtpSettingsOut)
async def put_smtp(
    payload: UserSmtpSettingsIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> UserSmtpSettingsOut:
    row = await _get(session, user)
    if row is None:
        if not payload.password:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Heslo je povinné při prvním nastavení SMTP.",
            )
        row = UserSmtpSettings(
            user_id=user.id,
            organization_id=user.organization_id,
            password_encrypted=encrypt_token(payload.password),
        )
        session.add(row)
    elif payload.password:
        row.password_encrypted = encrypt_token(payload.password)

    # Any credential/host/identity change invalidates a prior verification —
    # the user must re-test before the bulk-email gate opens again. Decided
    # *before* the assignments below, while `row` still holds the old values.
    #
    # `signature` is deliberately not in this set: it never reaches the SMTP
    # conversation, and treating a sign-off edit as a credential change would
    # silently un-verify the mailbox and close the bulk-email gate.
    connection_changed = bool(payload.password) or any(
        getattr(row, field) != getattr(payload, field)
        for field in ("host", "port", "use_ssl", "use_starttls", "username", "from_email")
    )

    row.host = payload.host
    row.port = payload.port
    row.use_ssl = payload.use_ssl
    row.use_starttls = payload.use_starttls
    row.username = payload.username
    row.from_email = payload.from_email
    row.from_name = payload.from_name
    row.signature = payload.signature
    if connection_changed:
        row.verified_at = None

    await session.commit()
    await session.refresh(row)
    return _to_out(row)


@router.post("/test", response_model=SmtpTestResult)
async def test_smtp(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SmtpTestResult:
    row = await _get(session, user)
    if row is None:
        return SmtpTestResult(ok=False, error="SMTP není nastaveno.")
    try:
        config = smtp_config_for(row)
    except TokenDecryptError:
        # The stored ciphertext is keyed by `jwt_secret`; after a rotation it
        # can't be read back. Report it as a failed test (and drop the
        # verified flag) so the UI prompts for the password instead of
        # 500-ing here and on every later send.
        row.verified_at = None
        await session.commit()
        return SmtpTestResult(
            ok=False, error="Uložené heslo nelze přečíst — zadejte ho prosím znovu."
        )
    try:
        await asyncio.to_thread(verify_smtp, config)
    except (smtplib.SMTPException, OSError, ssl.SSLError) as exc:
        return SmtpTestResult(ok=False, error=str(exc))
    row.verified_at = datetime.now(tz=UTC)
    await session.commit()
    return SmtpTestResult(ok=True)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_smtp(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> None:
    row = await _get(session, user)
    if row is not None:
        await session.delete(row)
        await session.commit()
