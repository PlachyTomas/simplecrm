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
