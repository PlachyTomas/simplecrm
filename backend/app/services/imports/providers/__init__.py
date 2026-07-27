"""Provider profile registry.

``generic`` is the empty profile: it matches nothing, so every column falls
through to the manual mapper. It exists so "obecné CSV" is a first-class
choice in the wizard's "Odkud migrujete?" step rather than a special case.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.services.imports.providers.base import (
    ROLE_SIDES,
    FileRole,
    ProviderProfile,
    Side,
)
from app.services.imports.providers.pipedrive import PIPEDRIVE

GENERIC = ProviderProfile(
    key="generic",
    label="Obecné CSV",
    roles=("companies", "contacts", "combined", "deals"),
    aliases={},
    role_signals={},
)

PROVIDERS: tuple[ProviderProfile, ...] = (PIPEDRIVE, GENERIC)


def get_provider(key: str | None) -> ProviderProfile | None:
    if key is None:
        return None
    for profile in PROVIDERS:
        if profile.key == key:
            return profile
    return None


def detect_provider(headers: Sequence[str]) -> ProviderProfile:
    """Best-scoring non-generic profile, or :data:`GENERIC` when nothing
    recognises the header row."""
    best: ProviderProfile | None = None
    best_score = 0
    for profile in PROVIDERS:
        if profile is GENERIC:
            continue
        score = profile.score(headers)
        if score > best_score:
            best, best_score = profile, score
    return best or GENERIC


__all__ = [
    "GENERIC",
    "PIPEDRIVE",
    "PROVIDERS",
    "ROLE_SIDES",
    "FileRole",
    "ProviderProfile",
    "Side",
    "detect_provider",
    "get_provider",
]
