from __future__ import annotations

from typing import Annotated

from fastapi import Query
from pydantic import BaseModel, Field


class PaginationParams:
    """FastAPI dependency: parses `?limit=&offset=` and clamps bounds."""

    def __init__(
        self,
        limit: Annotated[int, Query(ge=1, le=200)] = 50,
        offset: Annotated[int, Query(ge=0)] = 0,
    ) -> None:
        self.limit = limit
        self.offset = offset


class Page[T](BaseModel):
    """Paginated response envelope used by every list endpoint."""

    items: list[T]
    total: int = Field(ge=0)
    limit: int = Field(ge=1, le=200)
    offset: int = Field(ge=0)
