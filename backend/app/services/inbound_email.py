"""Smart BCC — inbound email capture (feature F3).

The cheap 80% of a full Gmail/Outlook sync: the user BCCs their personal
magic address (`bcc+<token>@in.simplecrm.cz`) from whatever mail client they
already use, an MTA-side worker POSTs us the raw MIME, and we file the
message on the right company/contact/deal timeline.

Two rules shape everything below:

  * **Parse defensively, never execute.** Only the stdlib `email` package
    touches the wire bytes. There is no template engine, no `eval`, no HTML
    renderer — the HTML fallback is a tag-stripping `HTMLParser` subclass.
    Every field is length-capped before it reaches a column.
  * **Never guess a link.** A deal is attached only when the matched company
    has exactly one open deal. Ambiguity leaves `deal_id` NULL rather than
    filing a customer's mail against the wrong opportunity, and a total miss
    still stores the row (`unmatched`) so nothing is silently dropped.
"""

from __future__ import annotations

import hashlib
import re
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from email import message_from_bytes
from email.message import EmailMessage, Message
from email.policy import default as default_policy
from email.utils import getaddresses, parsedate_to_datetime
from html import unescape
from html.parser import HTMLParser
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import (
    ActivityEntityType,
    ActivityType,
    Company,
    Contact,
    Deal,
    EmailDirection,
    SentEmail,
    SentEmailStatus,
    Stage,
    StageType,
    User,
)
from app.schemas.inbound_email import InboundOutcome
from app.services.activity_log import record_activity

# Column widths in `sent_emails` / storage sanity caps. A forwarded mail is
# attacker-influenced input, so every list and string is bounded before it
# reaches the DB.
_MAX_BODY_CHARS = 100_000
_MAX_SUBJECT_CHARS = 300
_MAX_MESSAGE_ID_CHARS = 500
_MAX_ADDRESS_CHARS = 320
_MAX_ADDRESSES_PER_HEADER = 100
_MAX_ATTACHMENT_FILENAMES = 50
_MAX_FILENAME_CHARS = 255

# Headers that can carry the magic address. `Bcc` is normally stripped by the
# sending server — which is the whole point of Smart BCC — so the envelope
# recipient usually resurfaces as `Delivered-To` / `X-Original-To` instead.
# Scan them all and take the first token that resolves.
_RECIPIENT_HEADERS = ("to", "cc", "bcc", "delivered-to", "x-original-to")

# Blank lines beyond two carry no meaning and just bloat the stored body.
_EXCESS_BLANK_LINES = re.compile(r"\n{3,}")


# ---------------------------------------------------------------------------
# HTML -> text (no new dependency)
# ---------------------------------------------------------------------------


class _HtmlToText(HTMLParser):
    """Minimal tag stripper for HTML-only messages.

    Not a renderer: it drops `script`/`style`/`head` content entirely, turns
    block-level tags into newlines, and keeps everything else as text. Good
    enough for a timeline preview, and it cannot execute anything.
    """

    _DROP_CONTENT = frozenset({"script", "style", "head", "title"})
    _BLOCK = frozenset(
        {
            "br", "p", "div", "li", "tr", "table", "blockquote", "section",
            "article", "header", "footer", "h1", "h2", "h3", "h4", "h5", "h6",
            "pre", "hr", "ul", "ol",
        }
    )  # fmt: skip

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._chunks: list[str] = []
        self._suppress_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self._DROP_CONTENT:
            self._suppress_depth += 1
        elif tag in self._BLOCK:
            self._chunks.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self._DROP_CONTENT:
            self._suppress_depth = max(0, self._suppress_depth - 1)
        elif tag in self._BLOCK:
            self._chunks.append("\n")

    def handle_data(self, data: str) -> None:
        if self._suppress_depth == 0:
            self._chunks.append(data)

    def text(self) -> str:
        return "".join(self._chunks)


def html_to_text(html: str) -> str:
    """Strip tags from `html` and normalize the whitespace it leaves behind."""
    parser = _HtmlToText()
    try:
        parser.feed(html)
        parser.close()
        raw = parser.text()
    except Exception:
        # Malformed markup must never take the endpoint down — fall back to a
        # blunt regex strip so we still store *something* readable.
        raw = unescape(re.sub(r"<[^>]*>", " ", html))
    lines = [line.rstrip() for line in raw.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    return _EXCESS_BLANK_LINES.sub("\n\n", "\n".join(lines)).strip()


# ---------------------------------------------------------------------------
# MIME parsing
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ParsedInboundMessage:
    """The handful of fields we keep from a forwarded message."""

    message_id: str
    in_reply_to: str | None
    references: list[str]
    date: datetime | None
    from_email: str
    from_name: str
    to: list[str]
    cc: list[str]
    bcc: list[str]
    delivered_to: list[str]
    subject: str
    body: str
    attachment_filenames: list[str] = field(default_factory=list)
    # Whether the endpoint had to synthesize `message_id` because the message
    # carried none — only used for logging/tests.
    synthetic_message_id: bool = False

    @property
    def recipients(self) -> list[str]:
        """Every address that could carry the magic token, in scan order."""
        return [*self.to, *self.cc, *self.bcc, *self.delivered_to]


def _safe_str(value: Any) -> str | None:
    """`str(value)` or None — header objects can raise while decoding."""
    try:
        return str(value)
    except Exception:
        return None


def _header_addresses(msg: Message, name: str) -> list[str]:
    """All addresses in every instance of header `name`, lower-cased.

    `get_all` can hand back non-string header objects (and, on malformed
    input, raise while decoding), so everything is coerced through `str` and
    the whole thing is guarded — a broken header must degrade to "no
    addresses", never to a 500.
    """
    try:
        raw = msg.get_all(name, [])
    except Exception:
        return []
    values = [text for text in (_safe_str(item) for item in raw) if text is not None]
    try:
        pairs = getaddresses(values)
    except Exception:
        return []
    out: list[str] = []
    for _name, addr in pairs:
        cleaned = addr.strip().strip("<>").lower()[:_MAX_ADDRESS_CHARS]
        if "@" in cleaned and cleaned not in out:
            out.append(cleaned)
        if len(out) >= _MAX_ADDRESSES_PER_HEADER:
            break
    return out


def _header_str(msg: Message, name: str) -> str:
    try:
        value = msg.get(name)
    except Exception:
        return ""
    return "" if value is None else str(value).strip()


def _extract_body(msg: EmailMessage) -> str:
    """Best-effort plain text: the `text/plain` part, else stripped `text/html`.

    `get_body` walks `multipart/alternative` and `multipart/related` for us.
    Decoding is wrapped because a lying `charset=` is common in the wild and
    must not fail the request.
    """

    def _content(part: EmailMessage | None) -> str:
        if part is None:
            return ""
        try:
            content = part.get_content()
        except Exception:
            payload = part.get_payload(decode=True)
            if not isinstance(payload, bytes):
                return ""
            content = payload.decode("utf-8", errors="replace")
        return content if isinstance(content, str) else ""

    try:
        plain = msg.get_body(preferencelist=("plain",))
    except Exception:
        plain = None
    text = _content(plain if isinstance(plain, EmailMessage) else None)
    if text.strip():
        return text

    try:
        html_part = msg.get_body(preferencelist=("html",))
    except Exception:
        html_part = None
    html_source = _content(html_part if isinstance(html_part, EmailMessage) else None)
    return html_to_text(html_source) if html_source.strip() else text


def _attachment_filenames(msg: EmailMessage) -> list[str]:
    """Filenames only — attachment *bytes* are deliberately never stored
    (same policy as composer sends and bulk email; storage is out of scope)."""
    names: list[str] = []
    try:
        parts = list(msg.iter_attachments())
    except Exception:
        return []
    for part in parts:
        name = _safe_filename(part)
        if name:
            names.append(name[:_MAX_FILENAME_CHARS])
        if len(names) >= _MAX_ATTACHMENT_FILENAMES:
            break
    return names


def _safe_filename(part: Any) -> str | None:
    try:
        name = part.get_filename()
    except Exception:
        return None
    return _safe_str(name) if name else None


def _synthetic_message_id(from_email: str, subject: str, date_raw: str, body: str) -> str:
    """Stable id for a message that carries no `Message-ID`.

    Hashing the identifying headers plus a body prefix keeps idempotency
    working for such messages: a resend of the *same* bytes hashes the same,
    so the unique index still catches it.
    """
    digest = hashlib.sha256(
        "\x1f".join((from_email, subject, date_raw, body[:2048])).encode("utf-8", "replace")
    ).hexdigest()
    return f"<{digest}@inbound.local>"


def _unparseable_message(raw: bytes) -> ParsedInboundMessage:
    """Empty parse for bytes the stdlib parser refused, keyed by content hash so
    a redelivery of the same bytes still deduplicates."""
    digest = hashlib.sha256(raw).hexdigest()
    return ParsedInboundMessage(
        message_id=f"<{digest}@unparseable.local>",
        in_reply_to=None,
        references=[],
        date=None,
        from_email="",
        from_name="",
        to=[],
        cc=[],
        bcc=[],
        delivered_to=[],
        subject="",
        body="",
        synthetic_message_id=True,
    )


def parse_inbound_message(raw: bytes) -> ParsedInboundMessage:
    """Parse raw RFC 5322 bytes into the fields we persist.

    Never raises on malformed input: the `email` package's compat32/default
    policies are lenient by design, and every accessor above is individually
    guarded. Worst case you get a message with empty fields, which the caller
    stores as `unmatched`.
    """
    # The parser itself is the one recursion site: ~1600 nested multipart
    # boundaries (about 100 KB — three orders of magnitude under the size cap)
    # blow the stack. In prod the forwarding worker relays anything that reaches
    # the catch-all address, so "attacker" here means anyone who can send mail;
    # a 500 also makes the worker bounce the message. Degrade to an empty parse,
    # which the caller stores as `unmatched`.
    try:
        msg = message_from_bytes(raw, policy=default_policy)
    except (RecursionError, ValueError, TypeError, LookupError, UnicodeError):
        return _unparseable_message(raw)
    assert isinstance(msg, EmailMessage)  # noqa: S101 — policy=default guarantees this

    from_addrs = _header_addresses(msg, "from")
    from_email = from_addrs[0] if from_addrs else ""
    from_name = ""
    try:
        pairs = getaddresses([str(v) for v in msg.get_all("from", [])])
        from_name = pairs[0][0].strip()[:200] if pairs else ""
    except Exception:
        from_name = ""

    subject = _header_str(msg, "subject")[:_MAX_SUBJECT_CHARS]
    body = _extract_body(msg)[:_MAX_BODY_CHARS]

    date_raw = _header_str(msg, "date")
    parsed_date: datetime | None = None
    if date_raw:
        try:
            parsed_date = parsedate_to_datetime(date_raw)
        except (TypeError, ValueError):
            parsed_date = None
    if parsed_date is not None and parsed_date.tzinfo is None:
        parsed_date = parsed_date.replace(tzinfo=UTC)

    message_id = _header_str(msg, "message-id")[:_MAX_MESSAGE_ID_CHARS]
    synthetic = not message_id
    if synthetic:
        message_id = _synthetic_message_id(from_email, subject, date_raw, body)

    references_raw = _header_str(msg, "references")
    references = [ref for ref in references_raw.split() if ref.startswith("<")][:20]

    return ParsedInboundMessage(
        message_id=message_id,
        in_reply_to=(_header_str(msg, "in-reply-to")[:_MAX_MESSAGE_ID_CHARS] or None),
        references=references,
        date=parsed_date,
        from_email=from_email,
        from_name=from_name,
        to=_header_addresses(msg, "to"),
        cc=_header_addresses(msg, "cc"),
        bcc=_header_addresses(msg, "bcc"),
        delivered_to=[
            addr
            for header in ("delivered-to", "x-original-to")
            for addr in _header_addresses(msg, header)
        ],
        subject=subject,
        body=body,
        attachment_filenames=_attachment_filenames(msg),
        synthetic_message_id=synthetic,
    )


# ---------------------------------------------------------------------------
# Addressing
# ---------------------------------------------------------------------------


def inbound_address_for(token: str) -> str:
    """`{prefix}+{token}@{domain}` — the user's personal BCC address."""
    settings = get_settings()
    return f"{inbound_local_part(token)}@{settings.inbound_email_domain}"


def inbound_local_part(token: str) -> str:
    return f"{get_settings().inbound_email_local_prefix}+{token}"


def extract_inbound_token(addresses: list[str]) -> str | None:
    """First `{prefix}+{token}@{domain}` token found in `addresses`.

    Sub-addressing (`+`) is what makes one MX record serve every user. The
    comparison is case-insensitive throughout — `addresses` has already been
    lower-cased by `_header_addresses`, so the token this returns is a
    case-folded needle and `_find_user_by_token` matches it accordingly.
    """
    settings = get_settings()
    domain = settings.inbound_email_domain.strip().lower()
    prefix = settings.inbound_email_local_prefix.strip().lower()
    if not domain or not prefix:
        return None
    for address in addresses:
        local, _, addr_domain = address.rpartition("@")
        if addr_domain.strip().lower() != domain:
            continue
        head, plus, token = local.partition("+")
        if plus and head.strip().lower() == prefix and token:
            return token
    return None


def is_inbound_address(address: str) -> bool:
    """True for any address at the inbound domain (magic or not)."""
    domain = get_settings().inbound_email_domain.strip().lower()
    return bool(domain) and address.rpartition("@")[2].strip().lower() == domain


def pick_correspondent(parsed: ParsedInboundMessage, *, user_email: str) -> str | None:
    """The other party's address.

    Primary rule (per spec): the first `To`/`Cc` address that is neither the
    user's own nor a magic address — that is the customer on a mail the user
    *sent* and BCC'd to us.

    Fallback: a mail the user *received* and BCC'd on has the user in `To`
    and the customer in `From`, so when nothing survives the primary rule we
    take `From`. Without this, every captured incoming reply would file as
    `unmatched`, which is the more common half of the feature.
    """
    own = user_email.strip().lower()
    for address in (*parsed.to, *parsed.cc):
        if address != own and not is_inbound_address(address):
            return address
    sender = parsed.from_email.strip().lower()
    if sender and sender != own and not is_inbound_address(sender):
        return sender
    return None


# ---------------------------------------------------------------------------
# Matching + storage
# ---------------------------------------------------------------------------


@dataclass
class InboundResult:
    """What `record_inbound_message` decided, mirrored into the HTTP response."""

    outcome: InboundOutcome
    email: SentEmail | None = None
    company: Company | None = None
    deal: Deal | None = None
    contact: Contact | None = None


async def _find_user_by_token(session: AsyncSession, token: str) -> User | None:
    """Resolve a magic-address token to its owner, case-insensitively.

    An address is lower-cased on the way in (`_header_addresses`, and MTAs
    rewrite case freely), so an exact comparison would silently drop every
    message addressed to a token that contains an upper-case character. New
    tokens are minted case-flat (`api/v1/inbound_email._mint_token`); this
    keeps tokens minted before that change working too. `lower()` forgoes
    `ix_users_inbound_token`, which is irrelevant on a per-deployment users
    table and cheap next to parsing the message we just received.
    """
    needle = token.strip().lower()
    if not needle:
        return None
    return (
        await session.execute(select(User).where(func.lower(User.inbound_token) == needle).limit(1))
    ).scalar_one_or_none()


async def _match_contact(
    session: AsyncSession, *, organization_id: uuid.UUID, email: str
) -> Contact | None:
    return (
        await session.execute(
            select(Contact)
            .where(
                Contact.organization_id == organization_id,
                func.lower(Contact.email) == email.lower(),
            )
            .limit(1)
        )
    ).scalar_one_or_none()


async def _match_company(
    session: AsyncSession, *, organization_id: uuid.UUID, email: str
) -> Company | None:
    return (
        await session.execute(
            select(Company)
            .where(
                Company.organization_id == organization_id,
                func.lower(Company.email) == email.lower(),
            )
            .limit(1)
        )
    ).scalar_one_or_none()


async def _sole_open_deal(
    session: AsyncSession, *, organization_id: uuid.UUID, company_id: uuid.UUID
) -> Deal | None:
    """The company's single open deal, or None when there are 0 or 2+.

    Deliberately all-or-nothing: filing a mail against the wrong opportunity
    is worse than leaving it on the company timeline, where the user can move
    it. Two rows are enough to answer "exactly one?", so the query is capped.
    """
    deals = (
        (
            await session.execute(
                select(Deal)
                .join(Stage, Stage.id == Deal.stage_id)
                .where(
                    Deal.organization_id == organization_id,
                    Deal.company_id == company_id,
                    Stage.stage_type == StageType.open,
                )
                .limit(2)
            )
        )
        .scalars()
        .all()
    )
    return deals[0] if len(deals) == 1 else None


async def _existing_by_message_id(
    session: AsyncSession, *, organization_id: uuid.UUID, message_id: str
) -> SentEmail | None:
    return (
        await session.execute(
            select(SentEmail)
            .where(
                SentEmail.organization_id == organization_id,
                SentEmail.message_id == message_id,
            )
            .limit(1)
        )
    ).scalar_one_or_none()


async def _thread_id_for(
    session: AsyncSession, *, organization_id: uuid.UUID, in_reply_to: str | None
) -> uuid.UUID:
    """Join the parent's thread when this message replies to one of our sends."""
    if in_reply_to:
        parent_thread = (
            await session.execute(
                select(SentEmail.thread_id)
                .where(
                    SentEmail.organization_id == organization_id,
                    SentEmail.message_id == in_reply_to,
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if parent_thread is not None:
            return parent_thread
    return uuid.uuid4()


async def record_inbound_message(session: AsyncSession, *, raw: bytes) -> InboundResult:
    """Parse `raw`, route it to a user, match it to CRM records, and store it.

    Commits on success. Returns an :class:`InboundResult` whose `outcome`
    drives the HTTP status — no branch here raises, because the caller is a
    mail server and a 5xx would turn a routing miss into a retry storm.
    """
    parsed = parse_inbound_message(raw)

    token = extract_inbound_token(parsed.recipients)
    if token is None:
        return InboundResult(outcome=InboundOutcome.no_token)

    user = await _find_user_by_token(session, token)
    if user is None:
        # An unknown token is indistinguishable from no token at all, and
        # saying so would let a caller enumerate live tokens.
        return InboundResult(outcome=InboundOutcome.no_token)
    organization_id = user.organization_id
    if organization_id is None:
        return InboundResult(outcome=InboundOutcome.no_org)

    existing = await _existing_by_message_id(
        session, organization_id=organization_id, message_id=parsed.message_id
    )
    if existing is not None:
        return InboundResult(outcome=InboundOutcome.duplicate, email=existing)

    correspondent = pick_correspondent(parsed, user_email=user.email)
    contact: Contact | None = None
    company: Company | None = None
    deal: Deal | None = None
    if correspondent:
        contact = await _match_contact(
            session, organization_id=organization_id, email=correspondent
        )
        if contact is not None and contact.company_id is not None:
            company = await session.get(Company, contact.company_id)
        if company is None:
            company = await _match_company(
                session, organization_id=organization_id, email=correspondent
            )
        if company is not None:
            deal = await _sole_open_deal(
                session, organization_id=organization_id, company_id=company.id
            )

    thread_id = await _thread_id_for(
        session, organization_id=organization_id, in_reply_to=parsed.in_reply_to
    )
    email_row = SentEmail(
        # Explicit id: the activity payload below links to this row, and the
        # column default only fires at flush — which must stay inside the
        # idempotency try/except at commit time.
        id=uuid.uuid4(),
        organization_id=organization_id,
        sender_user_id=user.id,
        deal_id=deal.id if deal is not None else None,
        company_id=company.id if company is not None else None,
        direction=EmailDirection.inbound,
        from_email=(correspondent or parsed.from_email or None),
        # Strip the magic address before storing: the token in it is a bearer
        # write-credential, and `to_emails`/`cc_emails` are served to every org
        # member by GET /emails. Users routinely put it in To/Cc rather than
        # Bcc, which would otherwise hand a colleague the ability to inject
        # forged correspondence into this user's timeline until they rotate.
        to_emails=[a for a in parsed.to if not is_inbound_address(a)],
        cc_emails=[a for a in parsed.cc if not is_inbound_address(a)],
        bcc_emails=[],
        subject=parsed.subject or "(bez předmětu)",
        body=parsed.body,
        attachment_filenames=parsed.attachment_filenames,
        # There is no delivery attempt to fail on an inbound row; `sent`
        # means "recorded". `direction` is the discriminator that matters.
        status=SentEmailStatus.sent,
        message_id=parsed.message_id,
        in_reply_to_message_id=parsed.in_reply_to,
        thread_id=thread_id,
        sent_at=parsed.date or datetime.now(tz=UTC),
    )
    session.add(email_row)

    if company is not None:
        # `email_id` links the timeline row to the stored mail (Mail page
        # detail); pre-existing rows without it render unlinked.
        payload: dict[str, Any] = {
            "subject": email_row.subject,
            "email_id": str(email_row.id),
        }
        if correspondent:
            payload["from"] = correspondent
        if deal is not None:
            entity_type, entity_id = ActivityEntityType.deal, deal.id
            payload["deal_name"] = deal.name
        else:
            entity_type, entity_id = ActivityEntityType.company, company.id
        record_activity(
            session,
            organization_id=organization_id,
            entity_type=entity_type,
            entity_id=entity_id,
            company_id=company.id,
            user_id=user.id,
            activity_type=ActivityType.email_received,
            payload=payload,
        )

    try:
        await session.commit()
    except IntegrityError:
        # Two workers delivered the same message concurrently; the unique
        # index on (organization_id, message_id) is the arbiter. Report the
        # winner rather than failing the retry.
        await session.rollback()
        winner = await _existing_by_message_id(
            session, organization_id=organization_id, message_id=parsed.message_id
        )
        return InboundResult(outcome=InboundOutcome.duplicate, email=winner)

    await session.refresh(email_row)
    return InboundResult(
        outcome=InboundOutcome.matched if company is not None else InboundOutcome.unmatched,
        email=email_row,
        company=company,
        deal=deal,
        contact=contact,
    )
