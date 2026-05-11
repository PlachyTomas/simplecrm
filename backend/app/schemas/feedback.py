"""Schemas for `POST /api/v1/feedback`.

The endpoint takes multipart/form-data (caption + body + kind + up to
five image attachments), so the request body itself is not modeled as a
single Pydantic schema — FastAPI's `Form(...)` parameters pick the
scalars apart. This module only carries the response schema and the
enum, which keeps the OpenAPI surface tidy.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel


class FeedbackKind(StrEnum):
    bug = "bug"
    improvement = "improvement"


class FeedbackAccepted(BaseModel):
    """Returned on a successful submission. Deliberately minimal — there
    is no server-side record to surface back; the email is the artifact.
    """

    delivered: bool
    recipient: str
