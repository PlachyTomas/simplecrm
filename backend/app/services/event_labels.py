"""Default event-label provisioning for a new organization.

The three seeds are ordinary rows — no "is_default" flag — so an org can
rename, recolor or delete any of them. Names follow the org's locale
(`cs*` → Czech, anything else → English); the colors are identical either
way so a re-localized org keeps its color language.

The same three rows were backfilled for pre-existing orgs by migration
`c4d5e6f7a8b9`; keep the two in sync if the seed list ever changes.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import EventLabel


@dataclass(frozen=True)
class EventLabelSeed:
    name: str
    color: str


DEFAULT_EVENT_LABELS_CS: tuple[EventLabelSeed, ...] = (
    EventLabelSeed("Hovor", "#0EA5E9"),
    EventLabelSeed("Schůzka", "#6366F1"),
    EventLabelSeed("Follow-up", "#F59E0B"),
)

DEFAULT_EVENT_LABELS_EN: tuple[EventLabelSeed, ...] = (
    EventLabelSeed("Call", "#0EA5E9"),
    EventLabelSeed("Meeting", "#6366F1"),
    EventLabelSeed("Follow-up", "#F59E0B"),
)


def default_event_label_seeds(locale: str | None) -> tuple[EventLabelSeed, ...]:
    """Czech seeds for a `cs*` locale, English otherwise (incl. a missing one)."""
    return (
        DEFAULT_EVENT_LABELS_CS
        if (locale or "").lower().startswith("cs")
        else DEFAULT_EVENT_LABELS_EN
    )


async def create_default_event_labels(
    session: AsyncSession,
    organization_id: uuid.UUID,
    locale: str | None = None,
) -> list[EventLabel]:
    """Provision the default event labels for an organization.

    Idempotent: a name the org already has (case-insensitively) is skipped
    rather than inserted, so a second call can't trip the
    `uq_event_labels_org_name_lower` index. Flushes; the caller commits.
    """
    existing = {
        name.lower()
        for name in (
            await session.execute(
                select(func.lower(EventLabel.name)).where(
                    EventLabel.organization_id == organization_id
                )
            )
        )
        .scalars()
        .all()
    }

    created: list[EventLabel] = []
    for seed in default_event_label_seeds(locale):
        if seed.name.lower() in existing:
            continue
        label = EventLabel(
            organization_id=organization_id,
            name=seed.name,
            color=seed.color,
        )
        session.add(label)
        created.append(label)
    await session.flush()
    return created
