"""Background scheduler for daily/periodic jobs.

MVP uses a minimal asyncio loop rather than a full APScheduler
dependency — current jobs:

  - Nightly freeing sweep (`run_freeing_sweep`) at 03:00 Europe/Prague
  - Hourly ComGate recurring-charge job (`run_recurring_charges`) for
    subscriptions whose `next_renewal_charge_at` has elapsed

If we add per-org cron expressions, swap `_DailyRunner` /
`_PeriodicRunner` for APScheduler in one module.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.db.models import (
    Charge,
    Company,
    PaymentMethod,
    Subscription,
    User,
)
from app.db.session import AsyncSessionLocal
from app.services import billing
from app.services.comgate import ComGateError, get_comgate_client
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
                wait_s = _seconds_until_next_run(now=datetime.now(tz=UTC), hour=self.hour)
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


# ---------------------------------------------------------------------------
# Recurring-charge job (ComGate-backed renewals)
# ---------------------------------------------------------------------------


# How often to scan for renewals whose `next_renewal_charge_at` has
# elapsed. Hourly is the common SaaS cadence — finer than that wastes
# work, coarser leaves customers without service for too long after
# their period ends.
RECURRING_CHARGE_INTERVAL_SECONDS = 3600


async def run_recurring_charges() -> int:
    """For every active subscription whose `next_renewal_charge_at` has
    elapsed, fire a ComGate recurring charge using the saved card.

    The ComGate webhook handler eventually lands the success/failure
    via `apply_renewal_success` / `mark_charge_failed` — this job just
    triggers the request and writes a pending Charge as a breadcrumb.

    Returns the number of charge attempts initiated (useful for tests).
    """
    now = datetime.now(tz=UTC)
    attempts = 0
    comgate = get_comgate_client()

    async with AsyncSessionLocal() as session:
        # Find subscriptions due for a renewal charge. Filters mirror
        # the design: skip comp orgs, skip those with cancel_at_period_end
        # (next_renewal_charge_at IS NULL), skip those without a saved
        # card, skip non-monthly/annual plans (trial / enterprise / comp
        # don't auto-renew through this path).
        due_stmt = (
            select(Subscription, PaymentMethod)
            .join(
                PaymentMethod,
                PaymentMethod.organization_id == Subscription.organization_id,
            )
            .where(Subscription.status == "active")
            .where(Subscription.is_comp.is_(False))
            .where(Subscription.next_renewal_charge_at.is_not(None))
            .where(Subscription.next_renewal_charge_at <= now)
        )
        due_rows = (await session.execute(due_stmt)).all()

        for sub, payment_method in due_rows:
            plan_code = sub.plan.code if sub.plan else None
            if plan_code not in {"monthly", "annual"}:
                continue
            price = billing.get_effective_price_per_user_minor(sub)
            if price is None or price <= 0:
                continue
            amount_minor = price * sub.seat_count

            charge = Charge(
                organization_id=sub.organization_id,
                kind="renewal",
                amount_minor=amount_minor,
                currency=sub.plan.currency,
                status="pending",
                seats=sub.seat_count,
                period_starts_at=sub.current_period_starts_at,
                period_ends_at=sub.current_period_ends_at,
            )
            session.add(charge)
            await session.flush()

            label = f"SimpleCRM {sub.plan.display_name_cs} – obnovení"
            try:
                result = await comgate.create_recurring_payment(
                    initial_trans_id=payment_method.comgate_initial_trans_id,
                    amount_minor=amount_minor,
                    currency=sub.plan.currency,
                    ref_id=str(charge.id),
                    label=label,
                )
                charge.comgate_trans_id = result.trans_id
                attempts += 1
            except ComGateError as exc:
                # Mark the charge failed inline; the dunning logic in
                # `mark_charge_failed` would normally fire via webhook
                # but a transport-level rejection never produces one.
                logger.warning(
                    "recurring charge failed for %s: %s",
                    sub.organization_id,
                    exc,
                )
                charge.status = "failed"
                charge.failure_reason = str(exc)[:500]
                await billing.mark_charge_failed(
                    session,
                    org_id=sub.organization_id,
                    kind="renewal",
                    failure_reason=str(exc),
                )

        await session.commit()

    logger.info("recurring charge sweep completed: attempts=%d", attempts)
    return attempts


class _PeriodicRunner:
    """Runs `job` every `interval_seconds` until cancelled.

    Sibling of `_DailyRunner`: the same start/stop contract, but the
    cadence is wall-clock interval rather than a local-time hour. Used
    for the recurring-charge job which needs hourly granularity.
    """

    def __init__(self, *, interval_seconds: float, job: Callable[[], Awaitable[object]]):
        self.interval_seconds = interval_seconds
        self.job = job
        self._task: asyncio.Task[None] | None = None

    async def _loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(self.interval_seconds)
                await self.job()
            except asyncio.CancelledError:
                return
            except Exception:
                logger.exception("periodic scheduler job failed")
                await asyncio.sleep(60)

    def start(self) -> None:
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._loop(), name="simplecrm.scheduler.periodic")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self._task
        self._task = None


recurring_charge_scheduler = _PeriodicRunner(
    interval_seconds=RECURRING_CHARGE_INTERVAL_SECONDS,
    job=run_recurring_charges,
)


# ---------------------------------------------------------------------------
# Invoice-renewal-draft job (commit #7 of INVOICES_TASK.md)
# ---------------------------------------------------------------------------
#
# Runs daily at 04:00 Europe/Prague (one hour after the freeing sweep so
# nightly bookkeeping finishes first). For each active subscription whose
# `current_period_ends_at` is within `RENEWAL_DRAFT_LEAD_DAYS`, build a
# `status='draft'` Invoice projecting the next-period charge. The founder
# reviews + confirms via the super-admin UI in commits #9-10 before the
# next morning's 03:00 ComGate charge fires.
#
# Idempotent: re-running on the same day returns existing drafts via the
# `(subscription_id, status='draft')` uniqueness check inside
# `prepare_renewal_draft`. CI / dev can call this manually.

RENEWAL_DRAFT_LEAD_DAYS = 7
RENEWAL_DRAFT_HOUR = 4  # 04:00 local


async def run_renewal_draft_sweep() -> int:
    """Build draft invoices for every active subscription whose current
    period ends within the next `RENEWAL_DRAFT_LEAD_DAYS` days.

    Skips:
      - comp orgs (no money owed)
      - subs with `current_period_ends_at IS NULL` (no anchor, can't
        project the next period)
      - subs whose plan isn't monthly/annual (trial / enterprise / comp
        don't auto-renew through this path)

    Returns the number of drafts created (or returned-as-existing) so
    tests can assert.
    """
    from app.services.invoicing.service import InvoiceService

    now = datetime.now(tz=UTC)
    horizon = now + timedelta(days=RENEWAL_DRAFT_LEAD_DAYS)
    drafts = 0

    async with AsyncSessionLocal() as session:
        from sqlalchemy.orm import selectinload

        due_stmt = (
            select(Subscription)
            .options(selectinload(Subscription.plan))
            .where(Subscription.status == "active")
            .where(Subscription.is_comp.is_(False))
            .where(Subscription.current_period_ends_at.is_not(None))
            .where(Subscription.current_period_ends_at <= horizon)
        )
        subs = (await session.execute(due_stmt)).scalars().all()
        svc = InvoiceService()

        for sub in subs:
            plan_code = sub.plan.code if sub.plan else None
            if plan_code not in {"monthly", "annual"}:
                continue
            try:
                await svc.prepare_renewal_draft(session, subscription=sub)
                drafts += 1
            except Exception:
                # A single sub failing shouldn't take down the sweep.
                logger.exception("renewal-draft prep failed for subscription %s", sub.id)

        await session.commit()

    logger.info("renewal-draft sweep completed: drafts=%d", drafts)
    return drafts


renewal_draft_scheduler = _DailyRunner(hour=RENEWAL_DRAFT_HOUR, job=run_renewal_draft_sweep)


# ---------------------------------------------------------------------------
# Weekly archive-integrity sweep (commit #12 of INVOICES_TASK.md)
# ---------------------------------------------------------------------------
#
# Runs every 7 days. Walks every issued invoice's stored bytes, hash-
# verifies via InvoiceStorage. Failures land in the admin Faktury
# integrity panel — and feed back into the monthly accountant export
# so a missing PDF is caught long before year-end audit.

INTEGRITY_CHECK_INTERVAL_SECONDS = 7 * 24 * 3600


async def run_weekly_integrity_check() -> int:
    """Background-runner version of the integrity walk. Returns the
    number of failures (useful for tests + log inspection)."""
    from app.services.invoicing.integrity import run_archive_integrity_check

    async with AsyncSessionLocal() as session:
        result = await run_archive_integrity_check(session, actor_user_id=None)
        await session.commit()
        return len(result.failures)


integrity_check_scheduler = _PeriodicRunner(
    interval_seconds=INTEGRITY_CHECK_INTERVAL_SECONDS,
    job=run_weekly_integrity_check,
)
