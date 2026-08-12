"""Schemas for personal todo lists and their todos.

Snake_case on the wire like the rest of the entity API (`calendar_event`,
`event_label`) — the camelCase aliases live only on the dashboard config
blobs.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator

MAX_LIST_NAME = 80
MAX_TODO_TEXT = 500


def _clean(value: str, *, limit: int, field: str) -> str:
    """Trim first, then enforce 1..limit — "   " is empty, not 3 chars long."""
    text = value.strip()
    if not text:
        raise ValueError(f"{field} must not be empty")
    if len(text) > limit:
        raise ValueError(f"{field} must be at most {limit} characters")
    return text


class TodoListOut(BaseModel):
    id: uuid.UUID
    name: str
    # The whole-list deal link. Denormalized name so the switcher can draw
    # a chip without a second fetch; None whenever `deal_id` is None.
    deal_id: uuid.UUID | None = None
    deal_name: str | None = None
    # Todos not yet ticked off — the badge in the list switcher.
    open_count: int = 0
    created_at: datetime


class TodoListCreate(BaseModel):
    name: str
    deal_id: uuid.UUID | None = None

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str) -> str:
        return _clean(value, limit=MAX_LIST_NAME, field="name")


class TodoListUpdate(BaseModel):
    """Partial update. Tri-state on `exclude_unset`: an absent `deal_id`
    leaves the link alone, an explicit null clears it."""

    name: str | None = None
    deal_id: uuid.UUID | None = None

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str | None) -> str | None:
        return None if value is None else _clean(value, limit=MAX_LIST_NAME, field="name")


class TodoOut(BaseModel):
    id: uuid.UUID
    list_id: uuid.UUID
    # Denormalized for the deal-detail section, which mixes lists together.
    list_name: str
    text: str
    is_done: bool
    position: int
    # The todo's *own* link, not the effective one — a todo inside a
    # deal-linked list carries None here while displaying its list's deal.
    # The client resolves `list.deal_id or todo.deal_id`.
    deal_id: uuid.UUID | None = None
    deal_name: str | None = None
    created_at: datetime
    updated_at: datetime


class TodoCreate(BaseModel):
    text: str
    deal_id: uuid.UUID | None = None

    @field_validator("text")
    @classmethod
    def _validate_text(cls, value: str) -> str:
        return _clean(value, limit=MAX_TODO_TEXT, field="text")


class TodoUpdate(BaseModel):
    """Partial update; `deal_id` is tri-state on `exclude_unset` like
    `TodoListUpdate.deal_id`. Sending it at all while the parent list is
    deal-linked is a 422 — the list link wins, so it would be dead
    config."""

    text: str | None = None
    is_done: bool | None = None
    deal_id: uuid.UUID | None = None

    @field_validator("text")
    @classmethod
    def _validate_text(cls, value: str | None) -> str | None:
        return None if value is None else _clean(value, limit=MAX_TODO_TEXT, field="text")


class DealTodoCreate(BaseModel):
    """Body of `POST /deals/{id}/todos` — the list is resolved server-side."""

    text: str

    @field_validator("text")
    @classmethod
    def _validate_text(cls, value: str) -> str:
        return _clean(value, limit=MAX_TODO_TEXT, field="text")
