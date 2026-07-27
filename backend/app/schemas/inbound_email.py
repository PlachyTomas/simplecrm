"""Schemas for Smart BCC — the inbound-email capture surface (feature F3)."""

from __future__ import annotations

import uuid
from enum import StrEnum

from pydantic import BaseModel, Field


class InboundOutcome(StrEnum):
    """What the inbound endpoint did with one forwarded message.

    Every value is a **2xx** answer: the caller is an MTA-side worker, and a
    4xx/5xx there means the mail server retries (or bounces to the user) over
    something we already decided not to store. Only auth and the size cap are
    hard failures.

    `no_token`   — no magic address in any recipient header; not ours to file.
    `no_org`     — the token resolved, but that user has no organization yet,
                   so there is no timeline to write to.
    `duplicate`  — this `Message-ID` is already recorded for the org.
    `matched`    — stored and linked to at least a company.
    `unmatched`  — stored, but the correspondent matched no contact/company;
                   kept anyway so the user is never silently ignored.
    """

    no_token = "no_token"  # noqa: S105 — an outcome name, not a credential
    no_org = "no_org"
    duplicate = "duplicate"
    matched = "matched"
    unmatched = "unmatched"


class InboundEmailIn(BaseModel):
    """JSON body shape accepted by `POST /api/v1/inbound-email`.

    `raw_mime` is the complete RFC 5322 message, either base64-encoded or as
    plain text — base64 is tried first and plain text is the fallback, so a
    `curl` smoke test can paste a message verbatim while a worker sends bytes
    safely. Posting the raw message as the request body with
    `Content-Type: message/rfc822` is the preferred (and byte-exact) shape;
    see docs/inbound-email-setup.md.
    """

    raw_mime: str = Field(min_length=1)


class InboundEmailResult(BaseModel):
    """What we did, echoed back so the worker can log it."""

    outcome: InboundOutcome
    email_id: uuid.UUID | None = None
    company_id: uuid.UUID | None = None
    deal_id: uuid.UUID | None = None
    contact_id: uuid.UUID | None = None


class InboundAddressOut(BaseModel):
    """The caller's personal Smart-BCC address."""

    address: str
    local_part: str
