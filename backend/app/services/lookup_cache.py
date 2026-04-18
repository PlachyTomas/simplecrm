"""Small in-process TTL cache + per-user rate limiter for registry lookups.

Process-local state is fine for a single API instance. When the app grows
beyond one process we'll swap the cache for Redis and the rate limiter for
a SlowAPI/Redis combo. Until then this keeps the code dependency-free.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from collections import deque
from dataclasses import dataclass, field

CACHE_TTL_SECONDS = 24 * 60 * 60
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_CALLS = 20


@dataclass
class _CacheEntry[T]:
    value: T
    expires_at: float


class TtlCache[T]:
    """Tiny async-safe (key -> value, expires_at) store."""

    def __init__(self, ttl_seconds: float = CACHE_TTL_SECONDS) -> None:
        self._ttl = ttl_seconds
        self._entries: dict[tuple[str, ...], _CacheEntry[T]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: tuple[str, ...]) -> T | None:
        async with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            if entry.expires_at < time.monotonic():
                self._entries.pop(key, None)
                return None
            return entry.value

    async def set(self, key: tuple[str, ...], value: T) -> None:
        async with self._lock:
            self._entries[key] = _CacheEntry(value=value, expires_at=time.monotonic() + self._ttl)

    async def clear(self) -> None:
        async with self._lock:
            self._entries.clear()


@dataclass
class _Bucket:
    timestamps: deque[float] = field(default_factory=deque)


class RateLimiter:
    """Sliding-window rate limiter keyed by user id.

    Returns True if the caller is within the limit; updates the bucket.
    """

    def __init__(
        self,
        max_calls: int = RATE_LIMIT_MAX_CALLS,
        window_seconds: float = RATE_LIMIT_WINDOW_SECONDS,
    ) -> None:
        self._max_calls = max_calls
        self._window = window_seconds
        self._buckets: dict[uuid.UUID, _Bucket] = {}
        self._lock = asyncio.Lock()

    async def try_acquire(self, user_id: uuid.UUID) -> bool:
        async with self._lock:
            bucket = self._buckets.setdefault(user_id, _Bucket())
            now = time.monotonic()
            cutoff = now - self._window
            while bucket.timestamps and bucket.timestamps[0] < cutoff:
                bucket.timestamps.popleft()
            if len(bucket.timestamps) >= self._max_calls:
                return False
            bucket.timestamps.append(now)
            return True

    async def reset(self) -> None:
        async with self._lock:
            self._buckets.clear()
