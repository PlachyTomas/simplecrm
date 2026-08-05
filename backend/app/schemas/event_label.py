"""Schemas for org-shared calendar event labels."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, field_validator

# The single source of truth for label colors. The frontend swatch picker
# mirrors this list; anything outside it is a 422 so a hand-rolled request
# can't smuggle an arbitrary color (or CSS) into the chip styling.
EVENT_LABEL_COLORS: tuple[str, ...] = (
    "#6366F1",  # indigo
    "#0EA5E9",  # sky
    "#10B981",  # emerald
    "#F59E0B",  # amber
    "#EF4444",  # red
    "#EC4899",  # pink
    "#8B5CF6",  # violet
    "#64748B",  # slate
)

MAX_LABEL_NAME = 50


def _clean_name(value: str) -> str:
    """Trim first, then enforce 1..50 — "   " is an empty name, not a 3-char one."""
    name = value.strip()
    if not name:
        raise ValueError("name must not be empty")
    if len(name) > MAX_LABEL_NAME:
        raise ValueError(f"name must be at most {MAX_LABEL_NAME} characters")
    return name


def _clean_color(value: str) -> str:
    """Normalize to the canonical uppercase hex and reject anything off-palette."""
    color = value.strip().upper()
    if color not in EVENT_LABEL_COLORS:
        raise ValueError("color must be one of the allowed palette colors")
    return color


class EventLabelBrief(BaseModel):
    """The shape embedded in a calendar event — just enough to draw a chip."""

    id: uuid.UUID
    name: str
    color: str


class EventLabelOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    color: str
    # How many events currently carry the label. Drives the delete confirm
    # ("used on N events") in Settings → Štítky událostí.
    usage_count: int = 0


class EventLabelCreate(BaseModel):
    name: str
    color: str

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str) -> str:
        return _clean_name(value)

    @field_validator("color")
    @classmethod
    def _validate_color(cls, value: str) -> str:
        return _clean_color(value)


class EventLabelUpdate(BaseModel):
    """Partial update — omitted fields are left alone (`exclude_unset`)."""

    name: str | None = None
    color: str | None = None

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str | None) -> str | None:
        return None if value is None else _clean_name(value)

    @field_validator("color")
    @classmethod
    def _validate_color(cls, value: str | None) -> str | None:
        return None if value is None else _clean_color(value)
