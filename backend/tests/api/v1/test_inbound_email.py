"""Integration tests for Smart BCC — inbound email capture (feature F3).

Covers the public capture hook (`POST /api/v1/inbound-email`): shared-secret
auth, the size cap, the routing/matching ladder (contact -> company -> sole
open deal), idempotency on `Message-ID`, and the deliberate 2xx answers for
"not ours" / "nothing matched". Plus the authenticated address endpoints and
the fact that a captured message shows up in the company's email history.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from email.message import EmailMessage

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.inbound_email import _DEV_FALLBACK_SECRET as _DEV_FALLBACK
from app.core.config import get_settings
from app.core.security import create_access_token
from app.db.models import (
    Activity,
    ActivityType,
    Company,
    Contact,
    Deal,
    EmailDirection,
    Organization,
    SentEmail,
    Stage,
    StageType,
    User,
    UserRole,
)
from app.db.session import AsyncSessionLocal
from app.services.inbound_email import parse_inbound_message
from app.services.pipeline import create_default_pipeline

_SECRET = "test-inbound-shared-secret"
_DOMAIN = "in.simplecrm.test"
_PREFIX = "bcc"


@pytest.fixture(autouse=True)
def _inbound_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pin the inbound config for the duration of a test.

    `get_settings()` is an `lru_cache`d singleton, so patching attributes on
    the instance is what every caller sees; monkeypatch restores them after.
    """
    settings = get_settings()
    monkeypatch.setattr(settings, "inbound_shared_secret", _SECRET)
    monkeypatch.setattr(settings, "inbound_email_domain", _DOMAIN)
    monkeypatch.setattr(settings, "inbound_email_local_prefix", _PREFIX)


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


class Seed:
    """The handles a test needs after seeding (kept explicit, not a tuple soup)."""

    def __init__(
        self, user: User, org: Organization, company: Company, contact: Contact, deal: Deal
    ) -> None:
        self.user = user
        self.org = org
        self.company = company
        self.contact = contact
        self.deal = deal
        self.token = user.inbound_token or ""

    @property
    def magic(self) -> str:
        return f"{_PREFIX}+{self.token}@{_DOMAIN}"


async def _seed(session: AsyncSession, owned_cleanup: dict[str, list]) -> Seed:
    org = Organization(name=f"Org-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.commit()
    await session.refresh(org)
    owned_cleanup["orgs"].append(org.id)

    pipeline = await create_default_pipeline(session, org.id)
    await session.commit()
    await session.refresh(pipeline, attribute_names=["stages"])
    open_stage: Stage = next(s for s in pipeline.stages if s.stage_type is StageType.open)

    user_email = f"u-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(user_email)
    user = User(
        email=user_email,
        name="Admin",
        role=UserRole.admin,
        organization_id=org.id,
        # Deliberately MIXED CASE. Addresses are lower-cased on the way in
        # (`getaddresses` + `_header_addresses`), so a token seeded in
        # lower-case hex — as this fixture used to be — silently exercises
        # only the easy half of the lookup and hides the fact that a real
        # minted token has to survive case-folding to be matched at all.
        inbound_token=f"Ab{uuid.uuid4().hex[:12]}CD",
    )
    company = Company(organization_id=org.id, name="Acme", email="info@acme.cz")
    session.add_all([user, company])
    await session.commit()
    await session.refresh(user)
    await session.refresh(company)

    contact = Contact(
        organization_id=org.id,
        company_id=company.id,
        first_name="Jan",
        last_name="Novák",
        email="jan@acme.cz",
    )
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=open_stage.id,
        owner_user_id=user.id,
        name="Deal",
        value=0,
        currency="CZK",
    )
    session.add_all([contact, deal])
    await session.commit()
    await session.refresh(contact)
    await session.refresh(deal)
    return Seed(user, org, company, contact, deal)


async def _add_open_deal(session: AsyncSession, seed: Seed, name: str) -> Deal:
    stage_id = (
        await session.execute(select(Deal.stage_id).where(Deal.id == seed.deal.id))
    ).scalar_one()
    deal = Deal(
        organization_id=seed.org.id,
        company_id=seed.company.id,
        stage_id=stage_id,
        owner_user_id=seed.user.id,
        name=name,
        value=0,
        currency="CZK",
    )
    session.add(deal)
    await session.commit()
    return deal


def _mime(
    *,
    sender: str,
    to: list[str],
    subject: str = "Nabídka",
    body: str | None = "Dobrý den,\n\nposílám nabídku.\n",
    html: str | None = None,
    message_id: str | None = None,
    cc: list[str] | None = None,
    delivered_to: str | None = None,
    in_reply_to: str | None = None,
) -> bytes:
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = ", ".join(to)
    if cc:
        msg["Cc"] = ", ".join(cc)
    if delivered_to:
        msg["Delivered-To"] = delivered_to
    msg["Subject"] = subject
    msg["Message-ID"] = message_id or f"<{uuid.uuid4().hex}@mail.example>"
    msg["Date"] = "Mon, 27 Jul 2026 10:15:00 +0200"
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
    if html is not None and body is None:
        msg.set_content(html, subtype="html")
    else:
        msg.set_content(body or "")
        if html is not None:
            msg.add_alternative(html, subtype="html")
    return msg.as_bytes()


def _post_kwargs(raw: bytes, *, secret: str | None = _SECRET) -> dict:
    headers = {"Content-Type": "message/rfc822"}
    if secret is not None:
        headers["X-Inbound-Secret"] = secret
    return {"content": raw, "headers": headers}


def _auth(user: User) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {create_access_token(user.id, user.organization_id, user.role)}"
    }


# ---------------------------------------------------------------------------
# Auth + size cap
# ---------------------------------------------------------------------------


async def test_missing_secret_is_rejected(client: AsyncClient) -> None:
    raw = _mime(sender="jan@acme.cz", to=[f"{_PREFIX}+whatever@{_DOMAIN}"])
    res = await client.post("/api/v1/inbound-email", **_post_kwargs(raw, secret=None))
    assert res.status_code == 401


async def test_wrong_secret_is_rejected(client: AsyncClient) -> None:
    raw = _mime(sender="jan@acme.cz", to=[f"{_PREFIX}+whatever@{_DOMAIN}"])
    res = await client.post("/api/v1/inbound-email", **_post_kwargs(raw, secret="nope"))
    assert res.status_code == 401


async def test_dev_fallback_secret_applies_only_in_dev(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """With no secret configured, dev accepts the documented fallback — and
    only dev. Nothing is stored either way (no token in the message); a 202
    just proves the request got past the auth gate."""
    settings = get_settings()
    monkeypatch.setattr(settings, "inbound_shared_secret", "")
    raw = _mime(sender="jan@acme.cz", to=["someone@acme.cz"])

    monkeypatch.setattr(settings, "app_env", "dev")
    ok = await client.post("/api/v1/inbound-email", **_post_kwargs(raw, secret=_DEV_FALLBACK))
    assert ok.status_code == 202
    other = await client.post("/api/v1/inbound-email", **_post_kwargs(raw, secret="nope"))
    assert other.status_code == 401

    monkeypatch.setattr(settings, "app_env", "production")
    denied = await client.post("/api/v1/inbound-email", **_post_kwargs(raw, secret=_DEV_FALLBACK))
    assert denied.status_code == 401


async def test_oversize_message_is_rejected(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "inbound_max_bytes", 512)
    raw = _mime(sender="jan@acme.cz", to=[f"{_PREFIX}+x@{_DOMAIN}"], body="x" * 4000)
    res = await client.post("/api/v1/inbound-email", **_post_kwargs(raw))
    assert res.status_code == 413


# ---------------------------------------------------------------------------
# Routing + matching
# ---------------------------------------------------------------------------


async def test_no_token_returns_202_without_storing(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    seed = await _seed(db_session, owned_cleanup)
    raw = _mime(sender=seed.user.email, to=["jan@acme.cz"])
    res = await client.post("/api/v1/inbound-email", **_post_kwargs(raw))
    assert res.status_code == 202
    assert res.json()["outcome"] == "no_token"

    async with AsyncSessionLocal() as s:
        count = (
            (await s.execute(select(SentEmail).where(SentEmail.organization_id == seed.org.id)))
            .scalars()
            .all()
        )
    assert count == []


async def test_happy_path_links_contact_company_and_sole_open_deal(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    seed = await _seed(db_session, owned_cleanup)
    # The realistic shape: the Bcc was stripped by the sending server and
    # resurfaces as Delivered-To.
    raw = _mime(
        sender=seed.user.email,
        to=["jan@acme.cz"],
        delivered_to=seed.magic,
        subject="Cenová nabídka",
    )
    res = await client.post("/api/v1/inbound-email", **_post_kwargs(raw))
    assert res.status_code == 201
    payload = res.json()
    assert payload["outcome"] == "matched"
    assert payload["company_id"] == str(seed.company.id)
    assert payload["deal_id"] == str(seed.deal.id)
    assert payload["contact_id"] == str(seed.contact.id)

    async with AsyncSessionLocal() as s:
        row = (
            await s.execute(select(SentEmail).where(SentEmail.organization_id == seed.org.id))
        ).scalar_one()
        assert row.direction is EmailDirection.inbound
        assert row.from_email == "jan@acme.cz"
        assert row.sender_user_id == seed.user.id
        assert row.subject == "Cenová nabídka"
        assert "posílám nabídku" in row.body
        assert row.sent_at is not None

        activity = (
            await s.execute(
                select(Activity).where(
                    Activity.organization_id == seed.org.id,
                    Activity.activity_type == ActivityType.email_received,
                )
            )
        ).scalar_one()
        assert activity.company_id == seed.company.id
        assert activity.payload["subject"] == "Cenová nabídka"


async def test_incoming_reply_matches_on_the_from_header(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """A mail the user *received* has them in To: and the customer in From:."""
    seed = await _seed(db_session, owned_cleanup)
    raw = _mime(sender="jan@acme.cz", to=[seed.user.email], delivered_to=seed.magic)
    res = await client.post("/api/v1/inbound-email", **_post_kwargs(raw))
    assert res.status_code == 201
    assert res.json()["company_id"] == str(seed.company.id)


async def test_ambiguous_open_deals_leave_deal_null(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    seed = await _seed(db_session, owned_cleanup)
    await _add_open_deal(db_session, seed, "Second deal")

    raw = _mime(sender=seed.user.email, to=["jan@acme.cz", seed.magic])
    res = await client.post("/api/v1/inbound-email", **_post_kwargs(raw))
    assert res.status_code == 201
    payload = res.json()
    assert payload["outcome"] == "matched"
    assert payload["company_id"] == str(seed.company.id)
    assert payload["deal_id"] is None


async def test_unknown_correspondent_is_stored_unmatched(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    seed = await _seed(db_session, owned_cleanup)
    raw = _mime(sender=seed.user.email, to=["stranger@nowhere.example", seed.magic])
    res = await client.post("/api/v1/inbound-email", **_post_kwargs(raw))
    assert res.status_code == 201
    payload = res.json()
    assert payload["outcome"] == "unmatched"
    assert payload["company_id"] is None

    async with AsyncSessionLocal() as s:
        row = (
            await s.execute(select(SentEmail).where(SentEmail.organization_id == seed.org.id))
        ).scalar_one()
        assert row.company_id is None
        assert row.deal_id is None
        assert row.from_email == "stranger@nowhere.example"


async def test_duplicate_message_id_is_idempotent(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    seed = await _seed(db_session, owned_cleanup)
    raw = _mime(
        sender=seed.user.email,
        to=["jan@acme.cz", seed.magic],
        message_id="<duplicate-me@mail.example>",
    )

    first = await client.post("/api/v1/inbound-email", **_post_kwargs(raw))
    assert first.status_code == 201
    second = await client.post("/api/v1/inbound-email", **_post_kwargs(raw))
    assert second.status_code == 200
    assert second.json()["outcome"] == "duplicate"
    assert second.json()["email_id"] == first.json()["email_id"]

    async with AsyncSessionLocal() as s:
        rows = (
            (await s.execute(select(SentEmail).where(SentEmail.organization_id == seed.org.id)))
            .scalars()
            .all()
        )
    assert len(rows) == 1


async def test_html_only_body_falls_back_to_stripped_text(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    seed = await _seed(db_session, owned_cleanup)
    raw = _mime(
        sender=seed.user.email,
        to=["jan@acme.cz", seed.magic],
        body=None,
        html=(
            "<html><head><style>p{color:red}</style></head>"
            "<body><p>Dobr&yacute; den,</p><p>pos&iacute;l&aacute;m nab&iacute;dku.</p>"
            "<script>alert(1)</script></body></html>"
        ),
    )
    res = await client.post("/api/v1/inbound-email", **_post_kwargs(raw))
    assert res.status_code == 201

    async with AsyncSessionLocal() as s:
        row = (
            await s.execute(select(SentEmail).where(SentEmail.organization_id == seed.org.id))
        ).scalar_one()
    assert "Dobrý den," in row.body
    assert "posílám nabídku." in row.body
    assert "<p>" not in row.body
    assert "alert(1)" not in row.body
    assert "color:red" not in row.body


async def test_json_body_with_base64_raw_mime_is_accepted(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    import base64

    seed = await _seed(db_session, owned_cleanup)
    raw = _mime(sender=seed.user.email, to=["jan@acme.cz", seed.magic])
    res = await client.post(
        "/api/v1/inbound-email",
        json={"raw_mime": base64.b64encode(raw).decode("ascii")},
        headers={"X-Inbound-Secret": _SECRET},
    )
    assert res.status_code == 201
    assert res.json()["company_id"] == str(seed.company.id)


# ---------------------------------------------------------------------------
# History + address endpoints
# ---------------------------------------------------------------------------


async def test_inbound_row_shows_up_in_company_email_history(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    seed = await _seed(db_session, owned_cleanup)
    raw = _mime(sender=seed.user.email, to=["jan@acme.cz", seed.magic], subject="Zpráva")
    assert (await client.post("/api/v1/inbound-email", **_post_kwargs(raw))).status_code == 201

    res = await client.get(f"/api/v1/emails?company_id={seed.company.id}", headers=_auth(seed.user))
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["subject"] == "Zpráva"
    assert items[0]["direction"] == "inbound"
    assert items[0]["from_email"] == "jan@acme.cz"


async def test_inbound_address_is_minted_lazily_and_rotates(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    seed = await _seed(db_session, owned_cleanup)
    async with AsyncSessionLocal() as s:
        user = await s.get(User, seed.user.id)
        assert user is not None
        user.inbound_token = None
        await s.commit()

    res = await client.get("/api/v1/me/inbound-address", headers=_auth(seed.user))
    assert res.status_code == 200
    first = res.json()
    assert first["address"].endswith(f"@{_DOMAIN}")
    assert first["address"] == f"{first['local_part']}@{_DOMAIN}"
    assert first["local_part"].startswith(f"{_PREFIX}+")

    # Idempotent: reading again returns the same address.
    again = await client.get("/api/v1/me/inbound-address", headers=_auth(seed.user))
    assert again.json()["address"] == first["address"]

    rotated = await client.post("/api/v1/me/inbound-address/rotate", headers=_auth(seed.user))
    assert rotated.status_code == 200
    assert rotated.json()["address"] != first["address"]


async def test_mail_to_the_minted_address_is_actually_filed(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """The address the app hands the user must be the one capture recognises.

    Regression (F3 verification): tokens were minted with
    `secrets.token_urlsafe`, i.e. mixed case, while every recipient address is
    lower-cased while parsing — so a real user's magic address resolved to no
    user and their mail was dropped with a 202 `no_token`. Every other test in
    this file missed it because the seed fixture assigned a lower-case hex
    token; here the address comes from the endpoint itself, so the mint and
    the match are checked against each other rather than against a fixture.
    """
    seed = await _seed(db_session, owned_cleanup)
    async with AsyncSessionLocal() as s:
        user = await s.get(User, seed.user.id)
        assert user is not None
        user.inbound_token = None
        await s.commit()

    minted = (await client.get("/api/v1/me/inbound-address", headers=_auth(seed.user))).json()
    raw = _mime(sender="jan@acme.cz", to=[seed.user.email], delivered_to=minted["address"])
    res = await client.post("/api/v1/inbound-email", **_post_kwargs(raw))
    assert res.status_code == 201
    assert res.json()["outcome"] == "matched"


async def test_case_folded_magic_address_still_resolves(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """Case is not ours to rely on — an MTA may rewrite any part of the address."""
    seed = await _seed(db_session, owned_cleanup)
    raw = _mime(sender="jan@acme.cz", to=[seed.user.email], delivered_to=seed.magic.upper())
    res = await client.post("/api/v1/inbound-email", **_post_kwargs(raw))
    assert res.status_code == 201
    assert res.json()["company_id"] == str(seed.company.id)


async def test_message_to_a_rotated_away_token_is_not_filed(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    seed = await _seed(db_session, owned_cleanup)
    stale_magic = seed.magic
    assert (
        await client.post("/api/v1/me/inbound-address/rotate", headers=_auth(seed.user))
    ).status_code == 200

    raw = _mime(sender=seed.user.email, to=["jan@acme.cz", stale_magic])
    res = await client.post("/api/v1/inbound-email", **_post_kwargs(raw))
    assert res.status_code == 202
    assert res.json()["outcome"] == "no_token"


async def test_reply_to_a_sent_mail_joins_its_thread(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    seed = await _seed(db_session, owned_cleanup)
    thread_id = uuid.uuid4()
    async with AsyncSessionLocal() as s:
        s.add(
            SentEmail(
                organization_id=seed.org.id,
                sender_user_id=seed.user.id,
                company_id=seed.company.id,
                to_emails=["jan@acme.cz"],
                cc_emails=[],
                bcc_emails=[],
                subject="Původní",
                body="text",
                attachment_filenames=[],
                status="sent",
                message_id="<original@simplecrm.cz>",
                thread_id=thread_id,
                sent_at=datetime.now(tz=UTC),
            )
        )
        await s.commit()

    raw = _mime(
        sender="jan@acme.cz",
        to=[seed.user.email],
        delivered_to=seed.magic,
        in_reply_to="<original@simplecrm.cz>",
    )
    res = await client.post("/api/v1/inbound-email", **_post_kwargs(raw))
    assert res.status_code == 201

    async with AsyncSessionLocal() as s:
        row = (
            await s.execute(
                select(SentEmail).where(
                    SentEmail.organization_id == seed.org.id,
                    SentEmail.direction == EmailDirection.inbound,
                )
            )
        ).scalar_one()
    assert row.thread_id == thread_id


# ---------------------------------------------------------------------------
# Hardening regressions (security review F3)
# ---------------------------------------------------------------------------


def test_deeply_nested_mime_degrades_instead_of_raising() -> None:
    """~1600 nested multiparts (~100 KB, far under the size cap) used to blow the
    stack inside the stdlib parser and 500 the public endpoint — which the
    forwarding worker turns into a bounce (review F3 P1)."""
    depth = 1600
    parts = "".join(
        f"--b{i}\r\nContent-Type: multipart/mixed; boundary=b{i + 1}\r\n\r\n" for i in range(depth)
    )
    raw = (
        b"From: a@ex.cz\r\nTo: b@ex.cz\r\nSubject: deep\r\n"
        b"Content-Type: multipart/mixed; boundary=b0\r\n\r\n" + parts.encode() + b"--b0--\r\n"
    )
    parsed = parse_inbound_message(raw)
    assert parsed.message_id.endswith("@unparseable.local>") or parsed.subject == "deep"


def test_unparseable_bytes_hash_to_a_stable_id() -> None:
    """Redelivery of the same unparseable bytes must still deduplicate."""
    raw = b"\xff\xfe not a message at all"
    assert parse_inbound_message(raw).message_id == parse_inbound_message(raw).message_id


async def test_non_ascii_secret_header_is_401_not_500(client: AsyncClient) -> None:
    """compare_digest raises on non-ASCII str; Starlette latin-1-decodes headers,
    so a junk byte in the header must not 500 the public endpoint (review F3 P2)."""
    # Raw bytes, as a real MTA would send them: httpx refuses to encode a
    # non-ASCII str header, but Starlette latin-1-decodes whatever arrives.
    resp = await client.post(
        "/api/v1/inbound-email",
        content=b"From: a@ex.cz\r\n\r\nhi",
        headers=[
            (b"content-type", b"message/rfc822"),
            (b"x-inbound-secret", "sécret".encode("latin-1")),
        ],
    )
    assert resp.status_code == 401


async def test_deactivated_user_token_stops_capturing(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """Security-delta review R1 P1: the magic address is a bearer
    write-credential, so deactivating a user must revoke it exactly like it
    revokes their sessions and logins. Otherwise an offboarded (or
    seat-downsized, or erased) account keeps a channel for filing mail into
    its former organization.

    The response is the same `no_token` a bogus address gets — a deactivated
    user must not be able to tell their token still exists.
    """
    seed = await _seed(db_session, owned_cleanup)
    raw = _mime(
        sender="jan@acme.cz",
        to=[seed.user.email, f"{_PREFIX}+{seed.user.inbound_token}@{_DOMAIN}"],
    )

    # Sanity: it captures while the account is live.
    ok = await client.post("/api/v1/inbound-email", **_post_kwargs(raw))
    assert ok.status_code == 201, ok.text

    async with AsyncSessionLocal() as s:
        user = await s.get(User, seed.user.id)
        assert user is not None
        user.is_active = False
        await s.commit()

    raw_after = _mime(
        sender="jan@acme.cz",
        to=[seed.user.email, f"{_PREFIX}+{seed.user.inbound_token}@{_DOMAIN}"],
        subject="Po deaktivaci",
    )
    res = await client.post("/api/v1/inbound-email", **_post_kwargs(raw_after))
    assert res.status_code == 202
    assert res.json()["outcome"] == "no_token"

    async with AsyncSessionLocal() as s:
        subjects = (
            (
                await s.execute(
                    select(SentEmail.subject).where(SentEmail.organization_id == seed.org.id)
                )
            )
            .scalars()
            .all()
        )
    assert "Po deaktivaci" not in subjects, "deactivated account must not accept new mail"
