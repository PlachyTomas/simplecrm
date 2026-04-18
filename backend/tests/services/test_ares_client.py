"""Unit tests for CzechAresService with a mocked httpx transport."""

from __future__ import annotations

import json
from datetime import date

import httpx
import pytest

from app.services.business_registry import (
    BusinessRegistryError,
    BusinessRegistryRegistry,
    CompanyRegistryData,
    CzechAresService,
)

ALZA_PAYLOAD = {
    "ico": "27082440",
    "obchodniJmeno": "Alza.cz a.s.",
    "dic": "CZ27082440",
    "pravniForma": "121",
    "datumVzniku": "1994-09-26",
    "sidlo": {
        "kodStatu": "CZ",
        "nazevObce": "Praha",
        "nazevUlice": "Jankovcova",
        "cisloDomovni": 1522,
        "cisloOrientacni": 53,
        "psc": 17000,
        "textovaAdresa": "Jankovcova 1522/53, 17000 Praha 7",
    },
}


def _mock_transport(response_builder):  # type: ignore[no-untyped-def]
    async def handler(request: httpx.Request) -> httpx.Response:
        return response_builder(request)

    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_lookup_returns_parsed_company_on_200() -> None:
    def builder(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/27082440")
        return httpx.Response(200, json=ALZA_PAYLOAD)

    service = CzechAresService(transport=_mock_transport(builder))
    result = await service.lookup("CZ", "27082440")
    assert isinstance(result, CompanyRegistryData)
    assert result.name == "Alza.cz a.s."
    assert result.ico == "27082440"
    assert result.dic == "CZ27082440"
    assert result.address_street == "Jankovcova 1522/53"
    assert result.address_city == "Praha"
    assert result.address_zip == "17000"
    assert result.legal_form == "121"
    assert result.registered_on == date(1994, 9, 26)


@pytest.mark.asyncio
async def test_lookup_returns_none_on_404() -> None:
    def builder(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"detail": "not found"})

    service = CzechAresService(transport=_mock_transport(builder))
    assert await service.lookup("CZ", "99999999") is None


@pytest.mark.asyncio
async def test_lookup_raises_on_500() -> None:
    def builder(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    service = CzechAresService(transport=_mock_transport(builder))
    with pytest.raises(BusinessRegistryError):
        await service.lookup("CZ", "27082440")


@pytest.mark.asyncio
async def test_lookup_raises_on_network_error() -> None:
    def builder(_: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("DNS blew up")

    service = CzechAresService(transport=_mock_transport(builder))
    with pytest.raises(BusinessRegistryError):
        await service.lookup("CZ", "27082440")


@pytest.mark.asyncio
async def test_lookup_raises_on_malformed_json() -> None:
    def builder(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, content=b"not-json", headers={"content-type": "application/json"}
        )

    service = CzechAresService(transport=_mock_transport(builder))
    with pytest.raises(BusinessRegistryError):
        await service.lookup("CZ", "27082440")


@pytest.mark.asyncio
async def test_lookup_rejects_bad_ico_format() -> None:
    service = CzechAresService(transport=_mock_transport(lambda _: httpx.Response(200, json={})))
    with pytest.raises(ValueError, match="8 digits"):
        await service.lookup("CZ", "abc")
    with pytest.raises(ValueError, match="8 digits"):
        await service.lookup("CZ", "123")


@pytest.mark.asyncio
async def test_lookup_rejects_non_cz_country() -> None:
    service = CzechAresService(transport=_mock_transport(lambda _: httpx.Response(200, json={})))
    with pytest.raises(ValueError, match="CZ"):
        await service.lookup("SK", "12345678")


@pytest.mark.asyncio
async def test_lookup_accepts_partial_payload() -> None:
    minimal = {"ico": "12345678", "obchodniJmeno": "Mini"}

    def builder(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=json.dumps(minimal))

    service = CzechAresService(transport=_mock_transport(builder))
    result = await service.lookup("CZ", "12345678")
    assert result == CompanyRegistryData(name="Mini", ico="12345678")


def test_registry_resolves_cz() -> None:
    reg = BusinessRegistryRegistry()
    service = reg.resolve("cz")
    assert isinstance(service, CzechAresService)


def test_registry_rejects_unknown_country() -> None:
    reg = BusinessRegistryRegistry()
    with pytest.raises(ValueError, match="No registry service"):
        reg.resolve("DE")
