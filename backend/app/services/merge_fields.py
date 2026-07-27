"""Shared merge-field vocabulary for outbound mail.

One substitution engine for both send paths — the 1:1 composer
(`services/mailer.py`) and bulk campaigns (`services/bulk_email.py`) — so a
template written in one place renders identically in the other.

The syntax is the one bulk email shipped with: **single braces, Czech
names** (`{firma}`, `{kontakt}`, `{vlastnik}`). Those three keep their exact
original meaning; the rest of `MERGE_FIELD_KEYS` extends the vocabulary.

Two deliberate properties:

  * **Unknown tokens are left verbatim.** A body that mentions `{cenik}` or
    a stray `{` must survive untouched — blanking it would silently mangle a
    legitimate mail, and raising would fail a send over a typo.
  * **A known token with no value renders empty.** `{obchod}` in a mail that
    isn't attached to a deal collapses to nothing rather than leaking a
    placeholder to the recipient.

`MERGE_FIELD_KEYS` is exported for the API (`GET /email-templates/merge-fields`)
so the composer/template UI can list the vocabulary without duplicating it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal

from babel.numbers import format_currency

from app.core.i18n import DEFAULT_LANGUAGE

# UI language -> Babel locale for money formatting. Mirrors
# `services/invoicing/renderer.py::BABEL_LOCALE`; duplicated on purpose
# because importing that module drags WeasyPrint into every email send.
_BABEL_LOCALE = {"cs": "cs_CZ", "en": "en_GB"}

# The vocabulary, in the order the UI should list it. The first three are the
# original bulk-email fields and MUST keep their meaning.
MERGE_FIELD_KEYS: tuple[str, ...] = (
    "firma",
    "kontakt",
    "kontakt_jmeno",
    "vlastnik",
    "obchod",
    "hodnota",
    "muj_email",
)

# The subset that only resolves when the send is attached to a deal. A bulk
# campaign never is — `services/bulk_email.send_campaign` builds its context
# from the org + recipient company, and any deals it creates are created
# *after* the mail goes out — so these two would always render empty there.
# Exported so a surface that can't fill them can drop them from its hint list
# instead of promising a substitution that never happens.
DEAL_MERGE_FIELD_KEYS: tuple[str, ...] = ("obchod", "hodnota")

# `{token}` with an identifier-shaped body. Anything else (`{}`, `{ firma }`,
# `{2}`) isn't a token at all and is left exactly as written.
_TOKEN_RE = re.compile(r"\{([A-Za-z_][A-Za-z0-9_]*)\}")

# RFC 3676 §4.3: a signature block starts with "-- " (dash dash space) on its
# own line. Mail clients hide/collapse everything after it.
SIGNATURE_DELIMITER = "\n\n-- \n"


@dataclass(frozen=True)
class MergeContext:
    """Everything the vocabulary can resolve for one recipient.

    Every field is optional: an unresolvable token renders empty rather than
    forcing every call site to invent a value.
    """

    # {firma}
    company_name: str = ""
    # {kontakt} — whatever the caller considers "the contact" (bulk email has
    # always passed the first name here; the composer passes the full name).
    contact_name: str = ""
    # {kontakt_jmeno}
    contact_first_name: str = ""
    # {vlastnik} — the sending user's display name.
    sender_name: str = ""
    # {muj_email} — the sender's verified SMTP `from_email`, not their login.
    sender_email: str = ""
    # {obchod}
    deal_name: str = ""
    # {hodnota}, formatted with `currency` in `language`'s locale.
    deal_value: Decimal | None = None
    currency: str = "CZK"
    language: str = DEFAULT_LANGUAGE

    def values(self) -> dict[str, str]:
        """The token -> replacement map. Keys match `MERGE_FIELD_KEYS`."""
        return {
            "firma": self.company_name or "",
            "kontakt": self.contact_name or "",
            "kontakt_jmeno": self.contact_first_name or "",
            "vlastnik": self.sender_name or "",
            "obchod": self.deal_name or "",
            "hodnota": self.formatted_value(),
            "muj_email": self.sender_email or "",
        }

    def formatted_value(self) -> str:
        """`{hodnota}`: the deal value in the org currency, or "".

        Empty for a missing deal, a missing value **and a zero value** — a
        campaign-created deal starts at 0, and "0,00 Kč" in a sales mail is
        worse than saying nothing.
        """
        if self.deal_value is None or self.deal_value == 0:
            return ""
        locale = _BABEL_LOCALE.get(self.language, _BABEL_LOCALE[DEFAULT_LANGUAGE])
        return format_currency(self.deal_value, self.currency or "CZK", locale=locale)


def apply_merge_fields(text: str, context: MergeContext) -> str:
    """Substitute every known `{token}` in `text`; leave the rest verbatim."""
    if not text:
        return text
    values = context.values()

    def _replace(match: re.Match[str]) -> str:
        return values.get(match.group(1), match.group(0))

    return _TOKEN_RE.sub(_replace, text)


# `sent_emails.subject` is varchar(300). The *input* subject is validated to 300
# at the API edge, but tokens expand (a 200-char company name into a 297-char
# subject clears validation and overflows), and the overflow only surfaces on the
# INSERT — i.e. after SMTP already delivered the mail, leaving no row, no
# activity, a failure in the UI, and a user who re-sends. Clamp instead.
MAX_SUBJECT_LENGTH = 300


def render_message(subject: str, body: str, context: MergeContext) -> tuple[str, str]:
    """Merge-render a subject/body pair in one call.

    The rendered subject is clamped to what the column can hold, so the header
    that goes out and the row we store always agree.
    """
    rendered_subject = apply_merge_fields(subject, context)
    if len(rendered_subject) > MAX_SUBJECT_LENGTH:
        rendered_subject = rendered_subject[: MAX_SUBJECT_LENGTH - 1].rstrip() + "…"
    return rendered_subject, apply_merge_fields(body, context)


def apply_signature(body: str, signature: str | None) -> str:
    """Append `signature` behind the RFC 3676 delimiter.

    A missing/blank signature is a no-op, so callers can pass the stored
    value straight through without branching.
    """
    if signature is None or not signature.strip():
        return body
    return f"{body}{SIGNATURE_DELIMITER}{signature}"
