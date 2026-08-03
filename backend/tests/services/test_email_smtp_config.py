"""Tests for the per-user SMTP config send path (Task A1)."""

from __future__ import annotations

import pytest

from app.services.email import (
    Email,
    SmtpConfig,
    _build_mime,
    send_email_via,
    verify_smtp,
)


def test_smtp_config_holds_fields() -> None:
    cfg = SmtpConfig(
        host="mail.example.com",
        port=465,
        use_ssl=True,
        use_starttls=False,
        username="u@example.com",
        password="pw",
        sender="Jan <jan@example.com>",
    )
    assert cfg.host == "mail.example.com"
    assert cfg.sender == "Jan <jan@example.com>"


def test_build_mime_uses_explicit_sender() -> None:
    msg = _build_mime(Email(to="a@b.cz", subject="Hi", body="x"), sender="Jan <jan@firma.cz>")
    assert msg["From"] == "Jan <jan@firma.cz>"
    assert msg["To"] == "a@b.cz"
    assert msg["Subject"] == "Hi"


@pytest.mark.asyncio
async def test_send_email_via_invokes_transport(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: dict[str, object] = {}

    def fake_send(message: Email, config: SmtpConfig) -> None:
        sent["to"] = message.to
        sent["host"] = config.host
        sent["sender"] = config.sender

    monkeypatch.setattr("app.services.email._send_via_smtp_config", fake_send)
    cfg = SmtpConfig(
        host="h",
        port=465,
        use_ssl=True,
        use_starttls=False,
        username="u",
        password="p",
        sender="s@x.cz",
    )
    await send_email_via(Email(to="x@y.cz", subject="s", body="b"), cfg)
    assert sent == {"to": "x@y.cz", "host": "h", "sender": "s@x.cz"}


def test_verify_smtp_ssl_path(monkeypatch: pytest.MonkeyPatch) -> None:
    """verify_smtp logs in and returns None on success (SSL transport mocked)."""
    calls: dict[str, object] = {}

    class FakeSMTPSSL:
        def __init__(self, host: str, port: int, context: object, timeout: int) -> None:
            calls["host"] = host
            calls["port"] = port

        def __enter__(self) -> FakeSMTPSSL:
            return self

        def __exit__(self, *exc: object) -> None:
            return None

        def login(self, username: str, password: str) -> None:
            calls["login"] = (username, password)

    monkeypatch.setattr("smtplib.SMTP_SSL", FakeSMTPSSL)
    cfg = SmtpConfig(
        host="mail.x.cz",
        port=465,
        use_ssl=True,
        use_starttls=False,
        username="u@x.cz",
        password="secret",
        sender="u@x.cz",
    )
    verify_smtp(cfg)
    assert calls["host"] == "mail.x.cz"
    assert calls["login"] == ("u@x.cz", "secret")


async def test_send_reports_unreadable_password_instead_of_crashing() -> None:
    """Security-delta review R3 P3: SMTP passwords are Fernet-encrypted with a
    key derived from `jwt_secret`, so rotating that secret makes every stored
    password unreadable. That must surface as the same actionable 409 an
    unverified account gets — not as an unhandled 500 out of the send path."""
    import uuid as _uuid
    from datetime import UTC, datetime

    from sqlalchemy import delete as sa_delete

    from app.db.models import Organization, User, UserRole, UserSmtpSettings
    from app.db.session import AsyncSessionLocal
    from app.schemas.sent_email import SentEmailCreate
    from app.services.mailer import SmtpCredentialsUnreadableError, send_user_email

    async with AsyncSessionLocal() as s:
        org = Organization(name=f"SmtpRot-{_uuid.uuid4().hex[:6]}")
        s.add(org)
        await s.flush()
        user = User(
            email=f"rot-{_uuid.uuid4().hex[:8]}@ex.cz",
            name="Rot",
            role=UserRole.admin,
            organization_id=org.id,
        )
        s.add(user)
        await s.flush()
        s.add(
            UserSmtpSettings(
                user_id=user.id,
                organization_id=org.id,
                host="smtp.example.com",
                port=465,
                use_ssl=True,
                use_starttls=False,
                username="rot@ex.cz",
                # Ciphertext this deployment's key cannot decrypt — exactly the
                # state a jwt_secret rotation leaves behind.
                password_encrypted="gAAAAABmZZZZ-not-decryptable",
                from_email="rot@ex.cz",
                verified_at=datetime.now(tz=UTC),
            )
        )
        await s.commit()
        user_id, org_id = user.id, org.id

    try:
        async with AsyncSessionLocal() as s:
            sender = await s.get(User, user_id)
            assert sender is not None
            with pytest.raises(SmtpCredentialsUnreadableError):
                await send_user_email(
                    s,
                    user=sender,
                    payload=SentEmailCreate(
                        to=["someone@example.com"],
                        subject="Test",
                        body="Test",
                    ),
                    attachments=[],
                    deal=None,
                    company=None,
                    reply_parent=None,
                )
    finally:
        async with AsyncSessionLocal() as s:
            await s.execute(
                sa_delete(UserSmtpSettings).where(UserSmtpSettings.organization_id == org_id)
            )
            await s.execute(sa_delete(User).where(User.id == user_id))
            await s.execute(sa_delete(Organization).where(Organization.id == org_id))
            await s.commit()
