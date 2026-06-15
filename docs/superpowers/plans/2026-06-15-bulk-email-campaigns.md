# Bulk Email Campaigns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a salesperson send a filtered bulk email ("a new offer") to their owned client companies, sent from their own SMTP, with persisted per-recipient delivery history.

**Architecture:** Two phases. Phase A adds required per-user SMTP settings (Fernet-encrypted) and generalizes the email service to send through an arbitrary SMTP config. Phase B adds the bulk-email feature: a filter→recipients→compose→send wizard, a synchronous capped send loop over one authenticated SMTP connection, persisted `EmailCampaign`/`EmailCampaignRecipient` rows, optional per-company deal creation, and a campaign-history view. Phase B is gated on Phase A (no verified SMTP → feature disabled).

**Tech Stack:** FastAPI + SQLAlchemy 2.0 async + Alembic + Pydantic v2 (backend); React + TypeScript + TanStack Query + Tailwind (frontend); pytest + vitest + Playwright (tests). Spec: `docs/superpowers/specs/2026-06-15-bulk-email-campaigns-design.md`.

---

## Phase A — Per-user SMTP

### Task A1: Generalize the email service to send via an arbitrary SMTP config

**Files:**
- Modify: `backend/app/services/email.py`
- Test: `backend/tests/services/test_email_smtp_config.py` (create)

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/services/test_email_smtp_config.py
from app.services.email import Email, SmtpConfig, _build_mime, verify_smtp, send_email_via
import pytest


def test_smtp_config_from_settings_roundtrip():
    cfg = SmtpConfig(
        host="mail.example.com", port=465, use_ssl=True, use_starttls=False,
        username="u@example.com", password="pw", sender="Jan <jan@example.com>",
    )
    assert cfg.host == "mail.example.com"
    assert cfg.sender == "Jan <jan@example.com>"


def test_build_mime_uses_explicit_sender():
    msg = _build_mime(Email(to="a@b.cz", subject="Hi", body="x"), sender="Jan <jan@firma.cz>")
    assert msg["From"] == "Jan <jan@firma.cz>"
    assert msg["To"] == "a@b.cz"


@pytest.mark.asyncio
async def test_send_email_via_invokes_transport(monkeypatch):
    sent = {}
    def fake_send(message, config):
        sent["to"] = message.to
        sent["host"] = config.host
    monkeypatch.setattr("app.services.email._send_via_smtp_config", fake_send)
    cfg = SmtpConfig(host="h", port=465, use_ssl=True, use_starttls=False,
                     username="u", password="p", sender="s@x.cz")
    await send_email_via(Email(to="x@y.cz", subject="s", body="b"), cfg)
    assert sent == {"to": "x@y.cz", "host": "h"}
```

- [ ] **Step 2: Run, expect failure** — `cd backend && uv run pytest tests/services/test_email_smtp_config.py -v` → FAIL (no `SmtpConfig`/`send_email_via`/`verify_smtp`).

- [ ] **Step 3: Implement.** Add to `backend/app/services/email.py`:

```python
@dataclass(frozen=True)
class SmtpConfig:
    host: str
    port: int
    use_ssl: bool
    use_starttls: bool
    username: str
    password: str
    sender: str  # full From header value, e.g. 'Jan Novák <jan@firma.cz>'


def _smtp_config_from_settings(sender: str) -> SmtpConfig:
    s = get_settings()
    return SmtpConfig(
        host=s.smtp_host, port=s.smtp_port, use_ssl=s.smtp_use_ssl,
        use_starttls=s.smtp_use_starttls, username=s.smtp_username,
        password=s.smtp_password, sender=sender,
    )


def _send_via_smtp_config(message: Email, config: SmtpConfig) -> None:
    """Blocking SMTP send against an explicit config (one message)."""
    mime = _build_mime(message, sender=config.sender)
    context = ssl.create_default_context()
    if config.use_ssl:
        with smtplib.SMTP_SSL(host=config.host, port=config.port, context=context, timeout=15) as client:
            if config.username:
                client.login(config.username, config.password)
            client.send_message(mime)
        return
    with smtplib.SMTP(host=config.host, port=config.port, timeout=15) as client:
        if config.use_starttls:
            client.starttls(context=context)
        if config.username:
            client.login(config.username, config.password)
        client.send_message(mime)


async def send_email_via(message: Email, config: SmtpConfig) -> None:
    """Send a single message through an explicit SMTP config (per-user sends)."""
    await asyncio.to_thread(_send_via_smtp_config, message, config)


def verify_smtp(config: SmtpConfig) -> None:
    """Connect + login to validate credentials. Raises smtplib/OSError/ssl on failure."""
    context = ssl.create_default_context()
    if config.use_ssl:
        with smtplib.SMTP_SSL(host=config.host, port=config.port, context=context, timeout=15) as client:
            if config.username:
                client.login(config.username, config.password)
        return
    with smtplib.SMTP(host=config.host, port=config.port, timeout=15) as client:
        if config.use_starttls:
            client.starttls(context=context)
        if config.username:
            client.login(config.username, config.password)
```

Refactor the existing `_send_via_smtp(message)` to delegate: build `_smtp_config_from_settings(_resolve_sender(message.sender_role))` and call `_send_via_smtp_config`. Keep `send_email` unchanged otherwise (transactional path identical).

- [ ] **Step 4: Run tests** → PASS. Also run `uv run pytest tests/services/test_email_sender_routing.py -v` to confirm no regression.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "refactor(email): send via explicit SmtpConfig; add verify_smtp"`

---

### Task A2: `UserSmtpSettings` model + migration

**Files:**
- Create: `backend/app/db/models/user_smtp_settings.py`
- Modify: `backend/app/db/models/__init__.py`
- Create: `backend/alembic/versions/20260615_1000_user_smtp_settings_<rev>.py`
- Test: `backend/tests/db/test_models_user_smtp.py` (create)

- [ ] **Step 1: Model** (mirror `google_calendar_connection.py`):

```python
# backend/app/db/models/user_smtp_settings.py
from __future__ import annotations
import uuid
from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
if TYPE_CHECKING:
    from app.db.models.organization import Organization
    from app.db.models.user import User


class UserSmtpSettings(Base):
    """Per-user outbound SMTP credentials for bulk email. Password is
    Fernet-encrypted at rest (app.core.token_crypto). `verified_at` is set
    only after a successful test connection; bulk email is gated on it."""
    __tablename__ = "user_smtp_settings"

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    host: Mapped[str] = mapped_column(String(255), nullable=False)
    port: Mapped[int] = mapped_column(Integer, nullable=False, default=465)
    use_ssl: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    use_starttls: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    username: Mapped[str] = mapped_column(String(320), nullable=False)
    password_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    from_email: Mapped[str] = mapped_column(String(320), nullable=False)
    from_name: Mapped[str | None] = mapped_column(String(200))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user: Mapped[User] = relationship()
    organization: Mapped[Organization] = relationship()
```

- [ ] **Step 2: Register** in `backend/app/db/models/__init__.py` — add import `from app.db.models.user_smtp_settings import UserSmtpSettings` and add `"UserSmtpSettings"` to `__all__`.

- [ ] **Step 3: Generate migration** — `cd backend && uv run alembic revision --autogenerate -m "user smtp settings"`. Verify it creates the `user_smtp_settings` table with the unique constraint on `user_id` and the two FKs (CASCADE). Adjust filename/timestamp to match the project convention `20260615_1000_user_smtp_settings_<rev>.py`.

- [ ] **Step 4: Apply + smoke test** — `uv run alembic upgrade head`. Test:

```python
# backend/tests/db/test_models_user_smtp.py
import pytest
from app.db.models import UserSmtpSettings

@pytest.mark.asyncio
async def test_create_user_smtp_settings(db_session, seed_org_and_user):
    org, user = seed_org_and_user
    row = UserSmtpSettings(user_id=user.id, organization_id=org.id, host="mail.x.cz",
                           port=465, username="u@x.cz", password_encrypted="enc",
                           from_email="u@x.cz")
    db_session.add(row); await db_session.commit(); await db_session.refresh(row)
    assert row.id is not None and row.use_ssl is True
```

(Use the existing conftest fixtures; match the fixture names already used in `tests/db/test_models_phase2.py`.)

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(db): add user_smtp_settings model + migration"`

---

### Task A3: SMTP settings schemas

**Files:**
- Create: `backend/app/schemas/user_smtp.py`

- [ ] **Step 1: Implement** (no test — covered by endpoint tests in A4):

```python
# backend/app/schemas/user_smtp.py
from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserSmtpSettingsIn(BaseModel):
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(ge=1, le=65535)
    use_ssl: bool = True
    use_starttls: bool = False
    username: str = Field(min_length=1, max_length=320)
    # Optional on update: omit to keep the stored password unchanged.
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
    has_password: bool          # never expose the password itself
    verified: bool
    verified_at: datetime | None = None


class SmtpTestResult(BaseModel):
    ok: bool
    error: str | None = None
```

- [ ] **Step 2: Commit** — `git add -A && git commit -m "feat(schemas): user SMTP settings schemas"`

---

### Task A4: SMTP settings endpoints

**Files:**
- Create: `backend/app/api/v1/user_smtp.py`
- Modify: `backend/app/api/v1/__init__.py`
- Test: `backend/tests/api/test_user_smtp.py` (create)

- [ ] **Step 1: Write failing tests** covering: GET when unconfigured returns `{configured: false}` shape (use 200 with `configured` flag or 404 — pick **200 with `{configured: false}`**, see impl); PUT creates row (password encrypted, not echoed); GET after PUT returns `has_password=True`, `verified=False`; PUT without `password` keeps the stored one; POST `/test` with mocked `verify_smtp` success sets `verified`; DELETE removes it.

```python
# backend/tests/api/test_user_smtp.py — representative cases
@pytest.mark.asyncio
async def test_put_and_get_smtp(client, auth_headers):
    payload = {"host": "mail.x.cz", "port": 465, "use_ssl": True, "use_starttls": False,
               "username": "u@x.cz", "password": "secret", "from_email": "u@x.cz"}
    r = await client.put("/api/v1/me/smtp", json=payload, headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert "password" not in body and body["has_password"] is True and body["verified"] is False
    g = await client.get("/api/v1/me/smtp", headers=auth_headers)
    assert g.json()["host"] == "mail.x.cz"

@pytest.mark.asyncio
async def test_test_endpoint_marks_verified(client, auth_headers, monkeypatch):
    monkeypatch.setattr("app.api.v1.user_smtp.verify_smtp", lambda cfg: None)
    await client.put("/api/v1/me/smtp", json={...}, headers=auth_headers)
    r = await client.post("/api/v1/me/smtp/test", headers=auth_headers)
    assert r.json()["ok"] is True
    assert (await client.get("/api/v1/me/smtp", headers=auth_headers)).json()["verified"] is True
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement** `backend/app/api/v1/user_smtp.py`:

```python
from __future__ import annotations
from datetime import UTC, datetime
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user
from app.core.token_crypto import decrypt_token, encrypt_token
from app.db import get_db
from app.db.models import User, UserSmtpSettings
from app.schemas.user_smtp import SmtpTestResult, UserSmtpSettingsIn, UserSmtpSettingsOut
from app.services.email import SmtpConfig, verify_smtp

router = APIRouter(prefix="/me/smtp", tags=["smtp"])


async def _get(session: AsyncSession, user: User) -> UserSmtpSettings | None:
    return (await session.execute(
        select(UserSmtpSettings).where(UserSmtpSettings.user_id == user.id)
    )).scalar_one_or_none()


def _to_out(row: UserSmtpSettings) -> UserSmtpSettingsOut:
    return UserSmtpSettingsOut(
        host=row.host, port=row.port, use_ssl=row.use_ssl, use_starttls=row.use_starttls,
        username=row.username, from_email=row.from_email, from_name=row.from_name,
        has_password=bool(row.password_encrypted), verified=row.verified_at is not None,
        verified_at=row.verified_at)


def _smtp_config(row: UserSmtpSettings) -> SmtpConfig:
    sender = f"{row.from_name} <{row.from_email}>" if row.from_name else row.from_email
    return SmtpConfig(host=row.host, port=row.port, use_ssl=row.use_ssl,
                      use_starttls=row.use_starttls, username=row.username,
                      password=decrypt_token(row.password_encrypted), sender=sender)


@router.get("")
async def get_smtp(user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db)):
    row = await _get(session, user)
    if row is None:
        return {"configured": False}
    return _to_out(row)


@router.put("", response_model=UserSmtpSettingsOut)
async def put_smtp(payload: UserSmtpSettingsIn, user: User = Depends(get_current_user),
                   session: AsyncSession = Depends(get_db)) -> UserSmtpSettingsOut:
    row = await _get(session, user)
    if row is None:
        if not payload.password:
            from fastapi import HTTPException, status
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Password required for new SMTP settings")
        row = UserSmtpSettings(user_id=user.id, organization_id=user.organization_id,
                               password_encrypted=encrypt_token(payload.password))
        session.add(row)
    elif payload.password:
        row.password_encrypted = encrypt_token(payload.password)
    # Any credential change clears verification.
    row.host, row.port = payload.host, payload.port
    row.use_ssl, row.use_starttls = payload.use_ssl, payload.use_starttls
    row.username, row.from_email, row.from_name = payload.username, payload.from_email, payload.from_name
    row.verified_at = None
    await session.commit(); await session.refresh(row)
    return _to_out(row)


@router.post("/test", response_model=SmtpTestResult)
async def test_smtp(user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db)) -> SmtpTestResult:
    row = await _get(session, user)
    if row is None:
        return SmtpTestResult(ok=False, error="SMTP není nastaveno")
    import asyncio, smtplib, ssl
    try:
        await asyncio.to_thread(verify_smtp, _smtp_config(row))
    except (smtplib.SMTPException, OSError, ssl.SSLError) as exc:
        return SmtpTestResult(ok=False, error=str(exc))
    row.verified_at = datetime.now(tz=UTC)
    await session.commit()
    return SmtpTestResult(ok=True)


@router.delete("", status_code=204)
async def delete_smtp(user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db)) -> None:
    row = await _get(session, user)
    if row is not None:
        await session.delete(row); await session.commit()
```

- [ ] **Step 4: Register router** — in `backend/app/api/v1/__init__.py` add `user_smtp` to the import group and `api_router.include_router(user_smtp.router, dependencies=PROTECTED_DEPS)`.

- [ ] **Step 5: Run tests** → PASS.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(api): per-user SMTP settings endpoints"`

---

### Task A5: SMTP settings UI (Settings → Integrace)

**Files:**
- Create: `frontend/src/app/settings/SmtpSettingsSection.tsx`
- Create: `frontend/src/app/settings/useSmtpSettings.ts`
- Modify: `frontend/src/app/settings/SettingsPage.tsx` (render `<SmtpSettingsSection />` in the integrations tab, near the Google Calendar card)
- Regenerate types: `frontend/src/types/api.generated.ts`
- Test: `frontend/src/__tests__/smtpSettings.test.tsx` (create)

- [ ] **Step 1: Regenerate API types** — with the backend running, `cd frontend && pnpm types:generate` (mirrors how other hooks consume `@/types/api.generated`). Confirm `UserSmtpSettingsOut` / `SmtpTestResult` appear.

- [ ] **Step 2: Hooks** `useSmtpSettings.ts` — `useSmtpSettings()` (GET `/me/smtp`), `useSaveSmtpSettings()` (PUT), `useTestSmtpSettings()` (POST `/me/smtp/test`), `useDeleteSmtpSettings()` (DELETE). Use `apiFetch` from `@/lib/api` and `queryKey: ["smtp-settings"]`; invalidate on mutation. Mirror `frontend/src/app/companies/useUpdateCompany.ts` and `useCompany.ts` for shape.

- [ ] **Step 3: Component** `SmtpSettingsSection.tsx` — a card titled "Odesílání e-mailů (SMTP)" with fields host/port, SSL vs STARTTLS toggle, username, password (placeholder "••• (beze změny)" when `has_password`), from_email, from_name; a "Uložit" button and an "Otestovat připojení" button that calls the test mutation and shows ✅ "Ověřeno" or the error string; a verified badge when `verified`. Match the visual patterns in `InvoiceDetailsCard.tsx`.

- [ ] **Step 4: Wire into SettingsPage** under the integrations tab (same tab as Google Calendar).

- [ ] **Step 5: Test** (vitest) — render section, fill form, mock `apiFetch`, assert PUT called with values and that password placeholder logic hides the stored secret. Mock the test button → assert verified badge appears.

- [ ] **Step 6: Playwright** — `pnpm dev`; navigate `http://localhost:5173/app/settings?tab=integrations`; screenshot the SMTP card; check console clean. Close the browser when done.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(settings): per-user SMTP settings UI"`

---

## Phase B — Bulk email

### Task B1: Campaign models + enums + migration

**Files:**
- Modify: `backend/app/db/models/enums.py` (add `EmailRecipientStatus`; add `email_sent` to `ActivityType`)
- Create: `backend/app/db/models/email_campaign.py` (both `EmailCampaign` and `EmailCampaignRecipient`)
- Modify: `backend/app/db/models/__init__.py`
- Create migration: `backend/alembic/versions/20260615_1100_email_campaigns_<rev>.py`
- Test: `backend/tests/db/test_models_email_campaign.py`

- [ ] **Step 1: Enums.** In `enums.py` add:

```python
class EmailRecipientStatus(StrEnum):
    sent = "sent"
    failed = "failed"
    skipped = "skipped"
```

And add `email_sent = "email_sent"` to the existing `ActivityType` StrEnum.

- [ ] **Step 2: Models** `email_campaign.py`:

```python
from __future__ import annotations
import uuid
from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.db.models.enums import EmailRecipientStatus
if TYPE_CHECKING:
    from app.db.models.organization import Organization
    from app.db.models.user import User


class EmailCampaign(Base):
    __tablename__ = "email_campaigns"
    __table_args__ = (Index("ix_email_campaigns_org_created", "organization_id", "created_at"),)
    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    subject: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    from_email: Mapped[str] = mapped_column(String(320), nullable=False)
    attachment_filename: Mapped[str | None] = mapped_column(String(255))
    total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sent_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skipped_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    recipients: Mapped[list[EmailCampaignRecipient]] = relationship(
        back_populates="campaign", cascade="all, delete-orphan")
    created_by: Mapped[User | None] = relationship()


class EmailCampaignRecipient(Base):
    __tablename__ = "email_campaign_recipients"
    __table_args__ = (Index("ix_email_campaign_recipients_campaign", "campaign_id"),)
    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("email_campaigns.id", ondelete="CASCADE"), nullable=False)
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL"))
    contact_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"))
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    company_name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[EmailRecipientStatus] = mapped_column(
        Enum(EmailRecipientStatus, name="email_recipient_status"), nullable=False)
    error: Mapped[str | None] = mapped_column(String(500))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    campaign: Mapped[EmailCampaign] = relationship(back_populates="recipients")
```

- [ ] **Step 3: Register** both models + `EmailRecipientStatus` in `__init__.py` (imports + `__all__`).

- [ ] **Step 4: Migration.** `uv run alembic revision --autogenerate -m "email campaigns"`. Autogenerate creates the two tables + the `email_recipient_status` enum type. **Manually add** the ActivityType value at the top of `upgrade()` (autogenerate won't detect native-enum value additions):

```python
def upgrade() -> None:
    op.execute("ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'email_sent'")
    # ... autogenerated create_table calls ...
```

In `downgrade()`, drop the two tables + the `email_recipient_status` type; leave the `activity_type` value in place (PG can't easily drop enum values — note this in a comment).

- [ ] **Step 5: Apply + smoke test** — `uv run alembic upgrade head`; write a model round-trip test (create a campaign with one `sent` recipient).

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(db): email campaign models + email_sent activity + migration"`

---

### Task B2: Bulk-email schemas

**Files:**
- Create: `backend/app/schemas/bulk_email.py`

- [ ] **Step 1: Implement:**

```python
from __future__ import annotations
import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from app.db.models.enums import EmailRecipientStatus
from app.schemas.contact import ContactOut


class BulkEmailFilters(BaseModel):
    industry: str | None = Field(default=None, max_length=120)
    owner_user_id: uuid.UUID | None = None        # managers/admins; ignored→self for salespeople
    stage_id: uuid.UUID | None = None             # has a deal in this stage
    has_won_deal: bool | None = None
    no_order_since_days: int | None = Field(default=None, ge=1, le=3650)  # last_order_at older than N days (or never)


class RecipientCandidate(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    company_id: uuid.UUID
    company_name: str
    default_email: str | None       # company.email or main_contact.email
    contacts: list[ContactOut]
    emailable: bool
    skip_reason: str | None = None  # "no_email" | "blocked"


class BulkEmailRecipientIn(BaseModel):
    company_id: uuid.UUID
    emails: list[EmailStr] = Field(min_length=1, max_length=50)  # chosen addresses for this company
    contact_id: uuid.UUID | None = None  # optional, for the first/primary chosen contact (timeline link)


class BulkEmailSendIn(BaseModel):
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1, max_length=20000)
    recipients: list[BulkEmailRecipientIn] = Field(min_length=1, max_length=250)
    create_deals: bool = False
    deal_title: str | None = Field(default=None, max_length=200)


class CampaignRecipientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    company_id: uuid.UUID | None
    company_name: str
    email: str
    status: EmailRecipientStatus
    error: str | None = None
    sent_at: datetime | None = None


class CampaignOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    subject: str
    from_email: str
    attachment_filename: str | None = None
    total: int
    sent_count: int
    failed_count: int
    skipped_count: int
    created_at: datetime


class CampaignDetailOut(CampaignOut):
    body: str
    recipients: list[CampaignRecipientOut]
```

- [ ] **Step 2: Commit** — `git add -A && git commit -m "feat(schemas): bulk email schemas"`

---

### Task B3: Bulk-email service (resolve + render + send)

**Files:**
- Create: `backend/app/services/bulk_email.py`
- Test: `backend/tests/services/test_bulk_email.py`

Key behaviors (write tests first for each):
- `resolve_recipients` returns only **owned** companies in scope; salesperson sees own, manager/admin honor `owner_user_id`; applies industry / stage / has_won_deal / no_order_since_days filters; marks `skip_reason="no_email"` when neither company.email nor main contact email exists; `skip_reason="blocked"` when the company's IČO is on `BlockedCompany`.
- `render_message` replaces `{firma}`, `{kontakt}`, `{vlastnik}` (kontakt = contact first name or "" ; vlastnik = sender name).
- `send_campaign` requires verified SMTP (raise `BulkEmailError`/HTTP 422 upstream if missing), enforces 250 cap, records per-recipient status, increments counts, and on `sent` runs side effects (deal when `create_deals`, `email_sent` activity).

- [ ] **Step 1: Failing tests** (representative):

```python
# backend/tests/services/test_bulk_email.py
@pytest.mark.asyncio
async def test_resolve_only_owned_in_scope(db_session, seed_companies):
    # owned-by-user, pool, owned-by-other → salesperson sees only own
    cands = await resolve_recipients(db_session, salesperson, BulkEmailFilters())
    ids = {c.company_id for c in cands}
    assert owned.id in ids and pool.id not in ids and others.id not in ids

@pytest.mark.asyncio
async def test_resolve_marks_no_email_and_blocked(db_session, ...):
    cands = {c.company_id: c for c in await resolve_recipients(...)}
    assert cands[no_email_co.id].emailable is False and cands[no_email_co.id].skip_reason == "no_email"
    assert cands[blocked_co.id].skip_reason == "blocked"

def test_render_message_merges_fields():
    subj, body = render_message(BulkEmailTemplate(subject="Nabídka pro {firma}", body="Dobrý den {kontakt}, {vlastnik}"),
                                company_name="ACME", contact_name="Jan", sender_name="Petr")
    assert subj == "Nabídka pro ACME" and "Dobrý den Jan, Petr" in body

@pytest.mark.asyncio
async def test_send_campaign_records_status_and_creates_deal(db_session, monkeypatch, ...):
    monkeypatch.setattr("app.services.bulk_email.send_email_via", AsyncMock())
    campaign = await send_campaign(db_session, user, send_payload(create_deals=True), attachment=None)
    assert campaign.sent_count == 1 and campaign.recipients[0].status == EmailRecipientStatus.sent
    # one deal created for the emailed company, owned by sender, named after subject
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement** `bulk_email.py`. Core pieces:

```python
class BulkEmailError(Exception): ...

MAX_RECIPIENTS = 250

# resolve_recipients: build `select(Company)` scoped via scope_by_owner, filter
# owner_user_id IS NOT NULL (owned only) + optional owner match; apply industry ==;
# for stage_id / has_won_deal use EXISTS subqueries on Deal (+ Stage.stage_type==won);
# for no_order_since_days: (last_order_at IS NULL) OR (last_order_at < now()-interval).
# Reuse _resolve_main_contacts from companies.py (extract to a shared helper or import).
# Load each company's contacts; compute default_email = company.email or main_contact.email;
# blocked = company.ico in {BlockedCompany.ico for org}.

async def send_campaign(session, user, payload, attachment):
    smtp = await _require_verified_smtp(session, user)   # raises BulkEmailError if missing/unverified
    if len(payload.recipients) > MAX_RECIPIENTS: raise BulkEmailError("too many recipients")
    # Re-validate each requested company server-side: in scope, owned, not blocked, email present.
    campaign = EmailCampaign(organization_id=user.organization_id, created_by_user_id=user.id,
                             subject=payload.subject, body=payload.body, from_email=smtp.sender_email,
                             attachment_filename=(attachment.filename if attachment else None))
    session.add(campaign); await session.flush()
    att = (EmailAttachment(attachment.filename, attachment.content_type, attachment.content),) if attachment else ()
    results = await asyncio.to_thread(_send_loop, smtp.config, campaign, validated, att)  # opens 1 connection
    for r in results: session.add(r); _bump_counts(campaign, r)
    if payload.create_deals:
        await _create_deals(session, user, [r for r in results if r.status == sent], payload)
    await _log_activities(session, user, [r for r in results if r.status == sent])
    await session.commit(); await session.refresh(campaign)
    return campaign
```

`_send_loop` (sync, runs in a thread): open one `smtplib.SMTP[_SSL]`, login once, iterate validated recipients building `Email(to=..., subject=rendered, body=rendered, attachments=att, sender_role unused)` and `client.send_message(_build_mime(email, sender=config.sender))`; append a `EmailCampaignRecipient` with `sent`/`failed`(+error) ; on a dropped connection re-open once, else mark remaining `failed`. Recipients pre-marked `skipped` (server re-validation) are recorded without sending. Reuse `_build_mime` from `email.py`.

`_create_deals`: resolve the org's default `Pipeline` (`is_default=True`) and its first `StageType.open` `Stage` (lowest `default_probability`/`order`); for each emailed company create `Deal(name=payload.deal_title or payload.subject, company_id, stage_id, owner_user_id=user.id, value=0, currency=org default)`.

`_log_activities`: insert `Activity(entity_type=company, entity_id=company_id, user_id=user.id, activity_type=ActivityType.email_sent, payload={"subject": ..., "campaign_id": str(campaign.id)})`.

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(service): bulk email resolve/render/send with deal + activity side effects"`

---

### Task B4: Bulk-email endpoints

**Files:**
- Create: `backend/app/api/v1/bulk_email.py`
- Modify: `backend/app/api/v1/__init__.py`
- Test: `backend/tests/api/test_bulk_email.py`

- [ ] **Step 1: Failing tests** — POST `/recipients` returns only owned-in-scope with skip flags; POST `/send` with no verified SMTP → 422; with mocked transport → returns campaign summary, persists rows; over 250 → 422; GET `/campaigns` lists the user's campaigns (admin sees org); GET `/campaigns/{id}` returns recipients with scoping (404 cross-org).

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement** router (prefix `/companies/bulk-email`):

```python
@router.post("/recipients", response_model=list[RecipientCandidate])
async def recipients(filters: BulkEmailFilters, user=Depends(get_current_user), session=Depends(get_db)):
    return await resolve_recipients(session, user, filters)

@router.post("/send", response_model=CampaignOut)
async def send(
    payload: str = Form(...),                    # JSON string of BulkEmailSendIn (multipart)
    attachment: UploadFile | None = File(default=None),
    user=Depends(get_current_user), session=Depends(get_db)):
    data = BulkEmailSendIn.model_validate_json(payload)
    att = None
    if attachment is not None:
        content = await attachment.read()
        _validate_attachment(attachment.content_type, len(content))  # allowlist + size cap (e.g. 10 MB)
        att = SimpleNamespace(filename=attachment.filename, content_type=attachment.content_type, content=content)
    try:
        campaign = await send_campaign(session, user, data, att)
    except BulkEmailError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    return CampaignOut.model_validate(campaign)

@router.get("/campaigns", response_model=Page[CampaignOut])  # paginated, scoped
@router.get("/campaigns/{campaign_id}", response_model=CampaignDetailOut)  # scoped, 404 cross-org/out-of-scope
```

Scoping for list/detail: salesperson sees own (`created_by_user_id == user.id`); admin/manager see org. Use `user.organization_id` always.

- [ ] **Step 4: Register router** in `__init__.py` under `PROTECTED_DEPS`.

- [ ] **Step 5: Run tests** → PASS, plus `uv run pytest` (whole suite) to catch regressions.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(api): bulk email recipients/send/campaigns endpoints"`

---

### Task B5: Bulk-email frontend (wizard + history + gated entry)

**Files:**
- Create: `frontend/src/app/companies/bulk-email/BulkEmailWizard.tsx`
- Create: `frontend/src/app/companies/bulk-email/useBulkEmail.ts` (hooks: `useResolveRecipients`, `useSendBulkEmail`, `useEmailCampaigns`, `useEmailCampaign`)
- Create: `frontend/src/app/companies/bulk-email/EmailCampaignsPage.tsx` (history at `/app/email-campaigns`)
- Modify: `frontend/src/app/companies/CompaniesListPage.tsx` (add "Hromadný e-mail" button + history link; gate on verified SMTP via `useSmtpSettings`)
- Modify: `frontend/src/App.tsx` (route `/app/email-campaigns` → `EmailCampaignsPage`, inside the protected `/app` shell)
- Regenerate: `frontend/src/types/api.generated.ts`
- Test: `frontend/src/__tests__/bulkEmail.test.tsx`

- [ ] **Step 1: Regenerate types** (`pnpm types:generate`) to pick up the new endpoints/schemas.

- [ ] **Step 2: Hooks** in `useBulkEmail.ts` — `useResolveRecipients()` (mutation POST `/companies/bulk-email/recipients`), `useSendBulkEmail()` (mutation; build `FormData` with `payload` JSON + optional `attachment`; POST via `apiFetch` letting the browser set the multipart boundary), `useEmailCampaigns()` (GET list), `useEmailCampaign(id)` (GET detail). Match existing query patterns.

- [ ] **Step 3: Wizard** `BulkEmailWizard.tsx` — 4 steps with local state:
  1. *Filtr*: industry text/select, owner select (only for manager/admin via `useCurrentUser`), deal-activity controls (stage select from `usePipelines`, has-won checkbox, "bez objednávky déle než N dní" number). "Najít firmy" → `useResolveRecipients`.
  2. *Příjemci*: table of candidates; each row has the default recipient + an expander listing `contacts` with checkboxes (multi-select). Greyed rows for `emailable=false` with the reason. Track selected emails per company.
  3. *Text*: subject input, body textarea with a merge-field hint (`{firma}`, `{kontakt}`, `{vlastnik}`), file input for one attachment.
  4. *Odeslání*: "Vytvořit obchod v pipeline pro každou firmu" checkbox + title input (default = subject); "Odeslat" → `useSendBulkEmail`; on success show summary (sent/failed/skipped) + link to the campaign detail.
  Follow `AddCompanyModal.tsx` for modal scaffolding/focus-trap.

- [ ] **Step 4: Gated entry** — in `CompaniesListPage.tsx`, add a "Hromadný e-mail" button next to "Přidat firmu". If `useSmtpSettings()` shows not-verified, the button opens a small dialog: "Nejdřív nastavte odesílání e-mailů (SMTP)" with a link to `/app/settings?tab=integrations`. Otherwise open `BulkEmailWizard`. Add a "Historie" link to `/app/email-campaigns`.

- [ ] **Step 5: History page + route** — `EmailCampaignsPage.tsx` lists campaigns (subject, date, counts) and a detail drawer/section showing per-recipient status with a clear note that "Odesláno" = the mail server accepted it. Add the route to `App.tsx`.

- [ ] **Step 6: Tests** (vitest) — wizard step gating (can't advance without recipients/subject); contact multi-select; gated entry when SMTP unverified; campaigns list render. Mock `apiFetch`.

- [ ] **Step 7: Playwright** — navigate to `/app/companies`, open the wizard, screenshot each step; navigate to `/app/email-campaigns`, screenshot. Check console clean. Close the browser.

- [ ] **Step 8: Commit** — `git add -A && git commit -m "feat(bulk-email): wizard, history view, gated entry"`

---

### Task B6: Landing page mention

**Files:**
- Modify: `frontend/src/marketing/LandingPage.tsx` (add a card to the `Differentiators`/`#funkce` grid)
- Modify/add test: `frontend/src/__tests__/landing.test.tsx`

- [ ] **Step 1: Add a feature card** in the `Differentiators` section grid — title "Hromadné nabídky e-mailem", blurb e.g. "Pošlete novou nabídku všem svým klientům najednou. Vyfiltrujte firmy podle oboru a aktivity a odešlete e-mail ze své vlastní adresy." Pick a lucide icon already imported there (e.g. `Mail`/`Send`; add the import if needed).

- [ ] **Step 2: Test** — extend `landing.test.tsx` to assert the new copy renders.

- [ ] **Step 3: Playwright** — navigate `http://localhost:5173/`, scroll to `#funkce`, screenshot. Close the browser.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(landing): mention bulk email offers in funkce"`

---

### Task B7: Full verification

- [ ] **Step 1: Backend CI mirror** — `cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest` (mirror `.github/workflows/ci.yml`).
- [ ] **Step 2: Frontend CI mirror** — `cd frontend && pnpm lint && pnpm format --check && pnpm typecheck && pnpm types:check && pnpm test && pnpm build`.
- [ ] **Step 3: Fix anything red; re-run until green.**
- [ ] **Step 4: Final Playwright pass** over SMTP settings, the wizard, history, and landing; confirm screenshots match intent and consoles are clean. Close the browser.
- [ ] **Step 5: Final commit** — `git add -A && git commit -m "chore(bulk-email): CI green + verification"`

---

## Self-review notes (author)

- **Spec coverage:** SMTP settings (A2–A5) ✓; required-SMTP gating (A4 `/test`, B3 `_require_verified_smtp`, B4 422, B5 gated button) ✓; owned-only + scope + filters (B3 `resolve_recipients`) ✓; recipient default + contact multi-select (B2/B3/B5) ✓; blocked/no-email skip (B3) ✓; synchronous capped send over one connection (B3 `_send_loop`, 250 cap) ✓; campaign history persistence + view (B1/B4/B5) ✓; per-company deal + `email_sent` activity (B1/B3) ✓; merge fields + attachment (B2/B3/B5) ✓; landing mention (B6) ✓; tests (each task) ✓.
- **Native-enum migration** for `ActivityType.email_sent` handled explicitly in B1 Step 4 (`ALTER TYPE … ADD VALUE IF NOT EXISTS`).
- **Naming consistency:** `SmtpConfig`, `send_email_via`, `verify_smtp`, `resolve_recipients`, `render_message`, `send_campaign`, `BulkEmailError`, `MAX_RECIPIENTS=250`, statuses `sent|failed|skipped` are used identically across tasks.
