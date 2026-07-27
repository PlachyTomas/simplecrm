"""Composer-side signature + merge-field rendering (feature F2).

Exercises `POST /api/v1/emails` end to end with the SMTP transport stubbed,
asserting on the `Email` handed to the transport — that's the only place the
final text exists before it leaves the process.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.core.token_crypto import encrypt_token
from app.db.models import (
    Company,
    Contact,
    Deal,
    Organization,
    SentEmail,
    Stage,
    User,
    UserRole,
    UserSmtpSettings,
)
from app.db.session import AsyncSessionLocal
from app.services.email import Email
from app.services.pipeline import create_default_pipeline

SIGNATURE = "S pozdravem\n{vlastnik}\n{muj_email}"


@pytest.fixture
async def owned_cleanup() -> AsyncIterator[dict[str, list]]:
    tracked: dict[str, list] = {"orgs": [], "emails": []}
    yield tracked
    async with AsyncSessionLocal() as session:
        if tracked["emails"]:
            await session.execute(delete(User).where(User.email.in_(tracked["emails"])))
        if tracked["orgs"]:
            await session.execute(delete(Organization).where(Organization.id.in_(tracked["orgs"])))
        await session.commit()


async def _seed(
    session: AsyncSession,
    owned_cleanup: dict[str, list],
    *,
    signature: str | None = SIGNATURE,
) -> tuple[User, Deal]:
    org = Organization(name=f"Org-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.commit()
    await session.refresh(org)
    owned_cleanup["orgs"].append(org.id)
    pipeline = await create_default_pipeline(session, org.id)
    await session.commit()
    await session.refresh(pipeline, attribute_names=["stages"])
    stage: Stage = pipeline.stages[0]

    email = f"u-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    admin = User(email=email, name="Petr Prodejce", role=UserRole.admin, organization_id=org.id)
    company = Company(organization_id=org.id, name="ACME", email="info@acme.cz")
    session.add_all([admin, company])
    await session.commit()
    await session.refresh(admin)
    await session.refresh(company)

    session.add(
        Contact(
            organization_id=org.id,
            company_id=company.id,
            first_name="Jan",
            last_name="Novák",
            email="jan@acme.cz",
        )
    )
    session.add(
        UserSmtpSettings(
            user_id=admin.id,
            organization_id=org.id,
            host="smtp.example.com",
            port=587,
            use_ssl=False,
            use_starttls=True,
            username="petr@firma.cz",
            password_encrypted=encrypt_token("secret"),
            from_email="petr@firma.cz",
            from_name="Petr",
            signature=signature,
            verified_at=datetime.now(tz=UTC),
        )
    )
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=stage.id,
        owner_user_id=admin.id,
        name="Dodávka strojů",
        value=Decimal("125000.00"),
        currency="CZK",
    )
    session.add(deal)
    await session.commit()
    await session.refresh(deal)
    return admin, deal


def _auth(user: User) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {create_access_token(user.id, user.organization_id, user.role)}"
    }


def _capture(monkeypatch: pytest.MonkeyPatch) -> list[Email]:
    captured: list[Email] = []

    async def _send(message: Email, _config: object) -> None:
        captured.append(message)

    monkeypatch.setattr("app.services.mailer.send_email_via", _send)
    return captured


async def _post(
    client: AsyncClient, user: User, deal: Deal, **payload: object
) -> dict[str, object]:
    data: dict[str, object] = {
        "to": ["jan@acme.cz"],
        "subject": "Nabídka",
        "body": "Dobrý den,",
        "deal_id": str(deal.id),
        "track": False,
    }
    data.update(payload)
    resp = await client.post(
        "/api/v1/emails", headers=_auth(user), data={"payload": json.dumps(data)}
    )
    assert resp.status_code == 201, resp.text
    out: dict[str, object] = resp.json()
    return out


# ---------------------------------------------------------------------------
# Signature
# ---------------------------------------------------------------------------


async def test_signature_appended_once_with_delimiter_and_merged(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin, deal = await _seed(db_session, owned_cleanup)
    captured = _capture(monkeypatch)

    await _post(client, admin, deal)

    body = captured[0].body
    assert body == "Dobrý den,\n\n-- \nS pozdravem\nPetr Prodejce\npetr@firma.cz"
    # Exactly one sig block — a second send path must not double-append.
    assert body.count("\n-- \n") == 1


async def test_signature_omitted_when_send_opts_out(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin, deal = await _seed(db_session, owned_cleanup)
    captured = _capture(monkeypatch)

    await _post(client, admin, deal, append_signature=False)

    assert captured[0].body == "Dobrý den,"
    assert "-- " not in captured[0].body


@pytest.mark.parametrize("signature", [None, "", "   \n "])
async def test_no_signature_stored_means_nothing_appended(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    monkeypatch: pytest.MonkeyPatch,
    signature: str | None,
) -> None:
    admin, deal = await _seed(db_session, owned_cleanup, signature=signature)
    captured = _capture(monkeypatch)

    await _post(client, admin, deal)

    assert captured[0].body == "Dobrý den,"


async def test_signature_is_inside_the_tracked_html(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The signature goes on *before* tracking renders the HTML alternative,
    so the two parts can't disagree about what was sent."""
    admin, deal = await _seed(db_session, owned_cleanup)
    captured = _capture(monkeypatch)

    await _post(client, admin, deal, track=True)

    message = captured[0]
    assert message.html_body is not None
    assert "petr@firma.cz" in message.html_body
    assert "S pozdravem" in message.html_body


async def test_sent_history_records_the_rendered_body(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin, deal = await _seed(db_session, owned_cleanup)
    _capture(monkeypatch)

    out = await _post(client, admin, deal)

    async with AsyncSessionLocal() as check:
        row = (
            await check.execute(select(SentEmail).where(SentEmail.id == uuid.UUID(str(out["id"]))))
        ).scalar_one()
    assert row.body.endswith("petr@firma.cz")


# ---------------------------------------------------------------------------
# Merge fields through the composer
# ---------------------------------------------------------------------------


async def test_composer_resolves_merge_fields_from_deal_and_recipient(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin, deal = await _seed(db_session, owned_cleanup, signature=None)
    captured = _capture(monkeypatch)

    await _post(
        client,
        admin,
        deal,
        subject="Nabídka pro {firma}",
        body="Dobrý den {kontakt_jmeno}, obchod {obchod} za {hodnota}. {neznamy}",
    )

    message = captured[0]
    assert message.subject == "Nabídka pro ACME"
    assert message.body.startswith("Dobrý den Jan, obchod Dodávka strojů za ")
    # Unknown tokens survive verbatim rather than being blanked.
    assert message.body.endswith("{neznamy}")
    assert "125" in message.body
