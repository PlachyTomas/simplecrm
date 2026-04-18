from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict


class RegistryLookupResult(BaseModel):
    """Response body for /companies/lookup-registry.

    Mirrors `app.services.business_registry.CompanyRegistryData` 1:1 so the
    generated OpenAPI schema is clean.
    """

    model_config = ConfigDict(from_attributes=True)

    name: str
    ico: str
    dic: str | None = None
    address_street: str | None = None
    address_city: str | None = None
    address_zip: str | None = None
    legal_form: str | None = None
    registered_on: date | None = None
