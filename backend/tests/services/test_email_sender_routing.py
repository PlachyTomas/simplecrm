"""Sender-role routing in `app.services.email`.

The Zoho dual-identity setup means every outbound message has to pick
between `SMTP_FROM_INVOICES` and `SMTP_FROM_INFO` based on its
`sender_role`. These tests exercise `_resolve_sender` and the
`_build_mime` envelope, without touching real SMTP.
"""

from __future__ import annotations

import pytest

from app.core.config import get_settings
from app.services.email import (
    Email,
    EmailAttachment,
    _build_mime,
    _resolve_sender,
)


@pytest.fixture(autouse=True)
def _restore_settings_cache():
    """`get_settings` is `lru_cache`d; clear after each test so monkey-
    patched env overrides don't leak.
    """
    yield
    get_settings.cache_clear()


def test_resolve_sender_picks_invoices_identity(monkeypatch: pytest.MonkeyPatch) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("SMTP_FROM_INVOICES", "billing@example.cz")
    monkeypatch.setenv("SMTP_FROM_INFO", "noreply@example.cz")
    assert _resolve_sender("invoices") == "billing@example.cz"
    assert _resolve_sender("info") == "noreply@example.cz"


def test_resolve_sender_falls_back_to_username_when_role_blank(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("SMTP_FROM_INVOICES", "")
    monkeypatch.setenv("SMTP_FROM_INFO", "")
    monkeypatch.setenv("SMTP_USERNAME", "fallback@example.cz")
    assert _resolve_sender("invoices") == "fallback@example.cz"
    assert _resolve_sender("info") == "fallback@example.cz"


def test_build_mime_renders_attachment_and_reply_to() -> None:
    msg = Email(
        to="customer@example.cz",
        subject="Faktura 2026/0001",
        body="V příloze naleznete fakturu.",
        attachments=(
            EmailAttachment(
                filename="faktura-2026-0001.pdf",
                content_type="application/pdf",
                content=b"%PDF-fake-bytes",
            ),
        ),
        reply_to="reply@example.cz",
        sender_role="invoices",
    )
    mime = _build_mime(msg, sender="faktury@simplecrm.cz")
    assert mime["From"] == "faktury@simplecrm.cz"
    assert mime["To"] == "customer@example.cz"
    assert mime["Subject"] == "Faktura 2026/0001"
    assert mime["Reply-To"] == "reply@example.cz"
    parts = list(mime.iter_attachments())
    assert len(parts) == 1
    part = parts[0]
    assert part.get_filename() == "faktura-2026-0001.pdf"
    assert part.get_content_type() == "application/pdf"
    assert part.get_payload(decode=True) == b"%PDF-fake-bytes"
