"""Business-registry abstraction.

The `BusinessRegistryService` Protocol normalizes access to Czech / Slovak /
German / Polish company registries behind one async call. Only the Czech
implementation (ARES) is wired up for MVP; other countries can be added
without touching callers.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Protocol

import httpx

ARES_BASE_URL = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty"
ARES_REQUEST_TIMEOUT = 10.0


class BusinessRegistryError(RuntimeError):
    """Registry upstream failed in an unexpected way (5xx, network error, etc.)."""


@dataclass(frozen=True)
class CompanyRegistryData:
    name: str
    ico: str
    dic: str | None = None
    address_street: str | None = None
    address_city: str | None = None
    address_zip: str | None = None
    legal_form: str | None = None
    registered_on: date | None = None


class BusinessRegistryService(Protocol):
    country_code: str

    async def lookup(
        self, country_code: str, registration_number: str
    ) -> CompanyRegistryData | None: ...


def _validate_czech_ico(ico: str) -> None:
    if not (len(ico) == 8 and ico.isdigit()):
        raise ValueError("IČO must be exactly 8 digits")


def _format_czech_address(sidlo: dict[str, object]) -> tuple[str | None, str | None, str | None]:
    """Map ARES's `sidlo` block to our (street, city, zip) triple."""
    street = sidlo.get("nazevUlice")
    house = sidlo.get("cisloDomovni")
    orient = sidlo.get("cisloOrientacni")

    street_parts: list[str] = []
    if isinstance(street, str) and street:
        street_parts.append(street)
    if isinstance(house, int):
        if isinstance(orient, int):
            street_parts.append(f"{house}/{orient}")
        else:
            street_parts.append(str(house))
    street_line = " ".join(street_parts) if street_parts else None

    city_raw = sidlo.get("nazevObce")
    city = city_raw if isinstance(city_raw, str) else None

    psc_raw = sidlo.get("psc")
    if isinstance(psc_raw, int):
        zip_code: str | None = f"{psc_raw:05d}"
    elif isinstance(psc_raw, str) and psc_raw.isdigit():
        zip_code = psc_raw.zfill(5)
    else:
        zip_code = None

    return street_line, city, zip_code


def _parse_ares_payload(payload: dict[str, object]) -> CompanyRegistryData:
    """Turn ARES's top-level `ekonomicky-subjekt` object into our dataclass."""
    ico = payload.get("ico")
    if not isinstance(ico, str):
        raise BusinessRegistryError("ARES payload missing `ico`")
    name = payload.get("obchodniJmeno")
    if not isinstance(name, str):
        raise BusinessRegistryError("ARES payload missing `obchodniJmeno`")

    dic_raw = payload.get("dic")
    dic = dic_raw if isinstance(dic_raw, str) else None

    legal_form_raw = payload.get("pravniForma")
    legal_form = legal_form_raw if isinstance(legal_form_raw, str) else None

    street: str | None = None
    city: str | None = None
    zip_code: str | None = None
    sidlo = payload.get("sidlo")
    if isinstance(sidlo, dict):
        street, city, zip_code = _format_czech_address(sidlo)

    registered_on: date | None = None
    datum_vzniku = payload.get("datumVzniku")
    if isinstance(datum_vzniku, str):
        try:
            registered_on = date.fromisoformat(datum_vzniku[:10])
        except ValueError:
            registered_on = None

    return CompanyRegistryData(
        name=name,
        ico=ico,
        dic=dic,
        address_street=street,
        address_city=city,
        address_zip=zip_code,
        legal_form=legal_form,
        registered_on=registered_on,
    )


class CzechAresService:
    """Czech Business Registry (ARES) client."""

    country_code = "CZ"

    def __init__(
        self,
        *,
        base_url: str = ARES_BASE_URL,
        timeout: float = ARES_REQUEST_TIMEOUT,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._transport = transport

    async def lookup(
        self, country_code: str, registration_number: str
    ) -> CompanyRegistryData | None:
        if country_code.upper() != self.country_code:
            raise ValueError(f"CzechAresService only serves CZ, got {country_code!r}")
        _validate_czech_ico(registration_number)

        url = f"{self._base_url}/{registration_number}"
        async with httpx.AsyncClient(timeout=self._timeout, transport=self._transport) as client:
            try:
                response = await client.get(url, headers={"Accept": "application/json"})
            except httpx.HTTPError as exc:
                raise BusinessRegistryError(f"ARES request failed: {exc}") from exc

        if response.status_code == 404:
            return None
        if response.status_code >= 400:
            raise BusinessRegistryError(f"ARES returned HTTP {response.status_code}")

        try:
            payload = response.json()
        except ValueError as exc:
            raise BusinessRegistryError("ARES returned non-JSON body") from exc
        if not isinstance(payload, dict):
            raise BusinessRegistryError("ARES returned non-object payload")
        return _parse_ares_payload(payload)


class BusinessRegistryRegistry:
    """Country-code → service resolver. Tests can override by passing a dict."""

    def __init__(self, services: dict[str, BusinessRegistryService] | None = None) -> None:
        self._services = services or {"CZ": CzechAresService()}

    def resolve(self, country_code: str) -> BusinessRegistryService:
        key = country_code.upper()
        if key not in self._services:
            raise ValueError(f"No registry service for country {country_code!r}")
        return self._services[key]


def get_business_registry() -> BusinessRegistryRegistry:
    """FastAPI dependency returning the registry singleton."""
    return BusinessRegistryRegistry()
