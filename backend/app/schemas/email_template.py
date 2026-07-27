"""Schemas for org-shared email templates (feature F2)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# Same ceiling as a campaign body (`schemas/bulk_email.BulkEmailSendIn`) so a
# template can always be pasted into a send without truncation.
MAX_TEMPLATE_BODY = 20000


class EmailTemplateIn(BaseModel):
    """Create/update payload. PUT replaces the whole row — templates are
    three fields, so a partial patch would buy nothing."""

    name: str = Field(min_length=1, max_length=200)
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(default="", max_length=MAX_TEMPLATE_BODY)


class EmailTemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    subject: str
    body: str
    created_by_user_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class MergeFieldsOut(BaseModel):
    """The merge-field vocabulary, for the composer/template editor's hint
    list. Served from `services/merge_fields.MERGE_FIELD_KEYS` so the UI never
    hardcodes a second copy; labels live in the frontend i18n catalogs."""

    keys: list[str]
    # The subset of `keys` that needs a deal behind the send. Surfaces that
    # never have one (the bulk-email wizard) hide these rather than advertise
    # a token that would render empty.
    deal_keys: list[str] = []
