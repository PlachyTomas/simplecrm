"""Schemas for per-user SMTP settings (Phase A)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserSmtpSettingsIn(BaseModel):
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(ge=1, le=65535)
    use_ssl: bool = True
    use_starttls: bool = False
    username: str = Field(min_length=1, max_length=320)
    # Optional on update: omit to keep the stored password unchanged. A new
    # row (no stored password yet) requires it — enforced in the endpoint.
    password: str | None = Field(default=None, max_length=512)
    from_email: EmailStr = Field(max_length=320)
    from_name: str | None = Field(default=None, max_length=200)


class UserSmtpSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    host: str
    port: int
    use_ssl: bool
    use_starttls: bool
    username: str
    from_email: str
    from_name: str | None = None
    # The password itself is never returned — only whether one is stored.
    has_password: bool
    verified: bool
    verified_at: datetime | None = None


class SmtpTestResult(BaseModel):
    ok: bool
    error: str | None = None
