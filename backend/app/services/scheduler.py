"""Background scheduler for daily/periodic jobs.

MVP uses a minimal asyncio loop rather than a full APScheduler
dependency — the only scheduled job is the nightly freeing sweep, so
the extra dep would be overkill. If we add more complex schedules (say,
per-org cron expressions), swap `_DailyRunner` for APScheduler in one
module.

The freeing sweep runs once at 03:00 Europe/Prague (which corresponds to
01:00 or 02:00 UTC depending on DST — we compute the next local midnight
offset rather than hard-coding UTC).
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.db.models import Company, User
from app.db.session import AsyncSessionLocal
from app.services.email import build_freed_company_email, send_email
from app.services.freeing import free_expired_companies

logger = logging.getLogger("simplecrm.scheduler")

PRAGUE = ZoneInfo("Europe/Prague")
DEFAULT_HOUR = 3  # 03:00 local


def _seconds_until_next_run(*, now: datetime, hour: int) -> float:
    """Return seconds from `now` until the next HH:00 local time."""
    local = now.astimezone(PRAGUE)
    target = local.replace(hour=hour, minute=0, second=0, microsecond=0)
    if target <= local:
        target += timedelta(days=1)
    delta = target.astimezone(UTC) - now.astimezone(UTC)
    return max(1.0, delta.total_seconds())


async def run_freeing_sweep() -> int:
    """Execute the nightly freeing sweep and notify each affected owner.

    Returns the number of freed companies (useful for tests).
    """
    total = 0
    async with AsyncSessionLocal() as session:
        # Pull per-owner groups BEFORE running the sweep so we can name
        # which companies left each owner. After the sweep, owner_user_id
        # is NULL, so we must gather the "before" state first.
        pre_stmt = select(Company).where(
            Company.owner_user_id.is_not(None),
            Company.ownership_expires_at < datetime.now(tz=UTC),
        )
        about_to_free = list((await session.execute(pre_stmt)).scalars())

        per_owner: dict[str, list[str]] = {}
        owners: dict[str, User] = {}
        for company in about_to_free:
            owner_id = str(company.owner_user_id)
            per_owner.setdefault(owner_id, []).append(company.name)
        if per_owner:
            owner_rows = (
                await session.execute(
                    select(User).where(User.id.in_([c.owner_user_id for c in about_to_free]))
                )
            ).scalars()
            for owner in owner_rows:
                owners[str(owner.id)] = owner

        result = await free_expired_companies(session)
        total = result.count

    # Send notifications outside the transaction so a mail failure
    # doesn't roll the freeing back.
    for owner_id, names in per_owner.items():
        recipient = owners.get(owner_id)
        if recipient is None or not recipient.email or not recipient.is_active:
            continue
        message = build_freed_company_email(
            owner_email=recipient.email,
            owner_name=recipient.name,
            company_names=names,
        )
        try:
            await send_email(message)
        except Exception:
            logger.exception("freeing sweep: email send failed for %s", recipient.email)

    logger.info("freeing sweep completed: freed=%d", total)
    return total


class _DailyRunner:
    """Runs `job` once per day at `hour` local time until cancelled."""

    def __init__(self, *, hour: int, job: Callable[[], Awaitable[object]]):
        self.hour = hour
        self.job = job
        self._task: asyncio.Task[None] | None = None

    async def _loop(self) -> None:
        while True:
            try:
                wait_s = _seconds_until_next_run(
                    now=datetime.now(tz=UTC), hour=self.hour
                )
                await asyncio.sleep(wait_s)
                await self.job()
            except asyncio.CancelledError:
                return
            except Exception:
                # Log and keep looping; a single failure mustn't take
                # down the scheduler until morning.
                logger.exception("scheduler job failed")
                await asyncio.sleep(60)

    def start(self) -> None:
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._loop(), name="simplecrm.scheduler")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self._task
        self._task = None


scheduler = _DailyRunner(hour=DEFAULT_HOUR, job=run_freeing_sweep)
