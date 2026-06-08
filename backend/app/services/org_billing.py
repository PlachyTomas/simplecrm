"""Czech billing-details completeness check.

A paid charge must carry enough buyer detail to issue a valid daňový
doklad. The pre-payment UI enforces this client-side; this helper is the
server-side backstop used by `initial-payment-init`.

Rule (type-agnostic so it works even when billing_kind is null):
  - full postal address always required, AND
  - individuals: a billing_name (their full name);
  - businesses (or unknown): a valid 8-digit IČO.
"""

from __future__ import annotations

import re

from app.db.models import Organization

_ICO_RE = re.compile(r"^\d{8}$")


def billing_complete(org: Organization) -> bool:
    if not (org.address_street and org.address_city and org.address_zip):
        return False
    if org.billing_kind == "individual":
        return bool(org.billing_name and org.billing_name.strip())
    return bool(org.ico and _ICO_RE.match(org.ico))
