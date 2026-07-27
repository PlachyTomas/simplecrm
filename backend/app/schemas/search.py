from __future__ import annotations

import uuid

from pydantic import BaseModel


class SearchHit(BaseModel):
    """One row in the global-search dropdown.

    Deliberately entity-agnostic: the caller renders `name` as the headline and
    `subtitle` as the dim second line, whatever the entity is. What goes into
    `subtitle` is decided server-side (IČO for companies, company name for
    contacts and deals) so the UI never has to branch per entity type.
    """

    id: uuid.UUID
    name: str
    subtitle: str | None = None


class GlobalSearchResults(BaseModel):
    companies: list[SearchHit] = []
    contacts: list[SearchHit] = []
    deals: list[SearchHit] = []
