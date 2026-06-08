"""Unit tests for billing_complete() — the mandatory-fields gate the
initial-payment endpoint enforces (and the pre-payment UI mirrors)."""

from __future__ import annotations

from app.db.models import Organization
from app.services.org_billing import billing_complete


def _org(**kw) -> Organization:
    base = {
        "name": "Acme",
        "billing_kind": None,
        "ico": None,
        "billing_name": None,
        "address_street": None,
        "address_city": None,
        "address_zip": None,
    }
    base.update(kw)
    return Organization(**base)


def test_business_complete_with_ico_and_address() -> None:
    org = _org(
        billing_kind="business",
        ico="27082440",
        address_street="Lidická 1",
        address_city="Brno",
        address_zip="60200",
    )
    assert billing_complete(org) is True


def test_business_incomplete_without_ico() -> None:
    org = _org(
        billing_kind="business",
        address_street="Lidická 1",
        address_city="Brno",
        address_zip="60200",
    )
    assert billing_complete(org) is False


def test_individual_complete_with_name_and_address() -> None:
    org = _org(
        billing_kind="individual",
        billing_name="Jan Novák",
        address_street="Lidická 1",
        address_city="Brno",
        address_zip="60200",
    )
    assert billing_complete(org) is True


def test_individual_incomplete_without_name() -> None:
    org = _org(
        billing_kind="individual",
        address_street="Lidická 1",
        address_city="Brno",
        address_zip="60200",
    )
    assert billing_complete(org) is False


def test_incomplete_when_address_missing() -> None:
    org = _org(billing_kind="business", ico="27082440")
    assert billing_complete(org) is False


def test_null_billing_kind_treated_as_business() -> None:
    org = _org(
        ico="27082440",
        address_street="Lidická 1",
        address_city="Brno",
        address_zip="60200",
    )
    assert billing_complete(org) is True
