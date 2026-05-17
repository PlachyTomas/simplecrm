"""PATCH /users/me/preferences body schema.

Pydantic enforces an explicit allowlist of keys so the JSONB column can't
be turned into a junk drawer by a frontend bug or a curious user. Only
the keys listed here are accepted; anything else returns 422.

Merge-patch semantics: only keys present in the request are touched on
the underlying row. Passing an explicit `null` for a key **deletes** that
key — lets QA reset the tour with one PATCH and avoids a separate
"delete this key" endpoint.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PreferencesPatch(BaseModel):
    """All fields optional; only present keys are merged into the row.

    `model_config.extra = "forbid"` is the gate that rejects unknown keys
    with a 422 instead of silently storing them.
    """

    model_config = ConfigDict(extra="forbid")

    # ISO-8601 timestamp the user completed (clicked "Hotovo" on the final
    # tour step). `None` clears the field.
    tutorial_completed_at: datetime | None = Field(default=None)

    # ISO-8601 timestamp the user dismissed mid-tour (clicked "Přeskočit"
    # or Esc). `None` clears.
    tutorial_dismissed_at: datetime | None = Field(default=None)

    # Zero-based step index the user was on when they last closed the
    # tour overlay mid-flow. Re-opening resumes from this step. `None`
    # clears the cursor (next open starts from 0).
    tutorial_step_index: int | None = Field(default=None, ge=0, le=20)

    def to_merge_dict(self, *, fields_set: set[str]) -> dict[str, object | None]:
        """Materialize a merge-patch dict.

        Returns only keys the caller actually sent (via ``model_fields_set``).
        Pydantic exposes every declared key in ``model_dump()``, including
        those defaulted to ``None``, so we have to filter explicitly to
        preserve merge semantics (omitted = leave alone vs. null = delete).
        """
        out: dict[str, object | None] = {}
        for key in fields_set:
            value = getattr(self, key)
            if isinstance(value, datetime):
                # Postgres JSONB stores strings; normalise to ISO-8601.
                out[key] = value.isoformat()
            else:
                out[key] = value
        return out
