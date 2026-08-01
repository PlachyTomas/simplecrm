"""Tests for the scheduler wrapper + freeing sweep orchestration."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.token_crypto import decrypt_token, encrypt_token
from app.db.models import (
    Charge,
    Company,
    GoogleCalendarConnection,
    Organization,
    PaymentMethod,
    Plan,
    Subscription,
    User,
    UserRole,
)
from app.db.session import AsyncSessionLocal
from app.services.comgate import RecurringChargeResult
from app.services.email import Email, build_freed_company_email
from app.services.google_calendar import GoogleCalendarAuthError
from app.services.scheduler import (
    _LOCK_FREEING,
    _seconds_until_next_run,
    run_freeing_sweep,
    run_google_calendar_keepalive,
    run_recurring_charges,
)


@pytest.fixture
async def owned_cleanup() -> AsyncIterator[dict[str, list]]:
    tracked: dict[str, list] = {"orgs": [], "emails": []}
    yield tracked
    async with AsyncSessionLocal() as session:
        if tracked["emails"]:
            await session.execute(delete(User).where(User.email.in_(tracked["emails"])))
        if tracked["orgs"]:
            await session.execute(delete(Organization).where(Organization.id.in_(tracked["orgs"])))
        await session.commit()


def test_seconds_until_next_run_is_within_one_day() -> None:
    now = datetime(2026, 4, 17, 12, 0, 0, tzinfo=UTC)
    delta = _seconds_until_next_run(now=now, hour=3)
    assert 0 < delta <= 24 * 3600


def test_seconds_until_next_run_jumps_to_tomorrow_if_past() -> None:
    # At 23:00 UTC on 2026-04-17, the next local 03:00 Prague
    # (summer-time UTC+2) is 2026-04-18 01:00 UTC — ~2 hours away.
    now = datetime(2026, 4, 17, 23, 0, 0, tzinfo=UTC)
    delta = _seconds_until_next_run(now=now, hour=3)
    assert 30 * 60 <= delta <= 5 * 3600


def test_build_freed_company_email_renders_singular_and_plural() -> None:
    one: Email = build_freed_company_email(
        owner_email="a@b.cz", owner_name="Anna", company_names=["Acme"]
    )
    assert "1 firma" in one.subject
    assert "• Acme" in one.body

    many = build_freed_company_email(
        owner_email="a@b.cz", owner_name="Anna", company_names=["Beta", "Acme"]
    )
    assert "2 firmy" in many.subject
    # Alphabetical order — Acme before Beta.
    assert many.body.index("Acme") < many.body.index("Beta")


def test_build_freed_company_email_rejects_empty_list() -> None:
    with pytest.raises(ValueError):
        build_freed_company_email(owner_email="a@b.cz", owner_name="A", company_names=[])


async def test_run_freeing_sweep_frees_and_counts(
    db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = Organization(name=f"Org-{uuid.uuid4().hex[:6]}")
    db_session.add(org)
    await db_session.commit()
    await db_session.refresh(org)
    owned_cleanup["orgs"].append(org.id)

    email = f"o-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    owner = User(email=email, name="Owner", role=UserRole.salesperson, organization_id=org.id)
    db_session.add(owner)
    await db_session.commit()
    await db_session.refresh(owner)

    past = datetime.now(tz=UTC) - timedelta(days=1)
    future = datetime.now(tz=UTC) + timedelta(days=30)
    db_session.add_all(
        [
            Company(
                organization_id=org.id,
                name="Expired 1",
                owner_user_id=owner.id,
                ownership_expires_at=past,
            ),
            Company(
                organization_id=org.id,
                name="Expired 2",
                owner_user_id=owner.id,
                ownership_expires_at=past,
            ),
            Company(
                organization_id=org.id,
                name="Still Fresh",
                owner_user_id=owner.id,
                ownership_expires_at=future,
            ),
        ]
    )
    await db_session.commit()

    freed_count = await run_freeing_sweep()
    assert freed_count >= 2

    # Commit on another session so we can observe.
    async with AsyncSessionLocal() as s2:
        from sqlalchemy import select as _sel

        rows = (
            await s2.execute(
                _sel(Company.name, Company.owner_user_id).where(Company.organization_id == org.id)
            )
        ).all()
        by_name = dict(rows)
    assert by_name["Expired 1"] is None
    assert by_name["Expired 2"] is None
    assert by_name["Still Fresh"] == owner.id


# --------------------------------------------------------------------------
# Google Calendar weekly keep-alive
# --------------------------------------------------------------------------


class _KeepaliveClient:
    """Records each refresh call; raises `invalid_grant` for revoked tokens.

    Only `refresh_access_token` is exercised by `force_refresh_access_token`,
    so the rest of the protocol is intentionally absent.
    """

    def __init__(self, revoke: set[str] | None = None) -> None:
        self.revoke = set(revoke or set())
        self.calls: list[str] = []

    async def refresh_access_token(self, refresh_token: str) -> tuple[str, int, str | None]:
        self.calls.append(refresh_token)
        if refresh_token in self.revoke:
            raise GoogleCalendarAuthError("invalid_grant")
        return "at-new", 3599, None


async def _seed_gcal_user(
    session: AsyncSession, owned_cleanup: dict[str, list], org: Organization
) -> User:
    email = f"gk-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    user = User(email=email, name="GK", role=UserRole.admin, organization_id=org.id)
    session.add(user)
    await session.flush()
    return user


async def _seed_connection(
    session: AsyncSession,
    *,
    user: User,
    org: Organization,
    refresh_token: str,
    sync_broken: bool = False,
) -> GoogleCalendarConnection:
    connection = GoogleCalendarConnection(
        user_id=user.id,
        organization_id=org.id,
        google_email=f"{refresh_token}@gmail.com",
        refresh_token_encrypted=encrypt_token(refresh_token),
        sync_broken=sync_broken,
    )
    session.add(connection)
    await session.flush()
    return connection


async def test_keepalive_refreshes_healthy_connection(
    owned_cleanup: dict[str, list], monkeypatch: pytest.MonkeyPatch
) -> None:
    async with AsyncSessionLocal() as s:
        org = Organization(name=f"KA-{uuid.uuid4().hex[:6]}")
        s.add(org)
        await s.flush()
        owned_cleanup["orgs"].append(org.id)
        user = await _seed_gcal_user(s, owned_cleanup, org)
        rt = f"rt-good-{uuid.uuid4().hex[:8]}"
        connection = await _seed_connection(s, user=user, org=org, refresh_token=rt)
        await s.commit()
        connection_id = connection.id

    fake = _KeepaliveClient()
    monkeypatch.setattr("app.services.google_calendar.get_google_calendar_client", lambda: fake)

    refreshed = await run_google_calendar_keepalive()
    assert refreshed >= 1
    assert rt in fake.calls  # the exchange was actually forced

    async with AsyncSessionLocal() as s:
        row = await s.get(GoogleCalendarConnection, connection_id)
        assert row is not None
        assert row.sync_broken is False
        assert row.access_token_encrypted is not None
        assert decrypt_token(row.access_token_encrypted) == "at-new"


async def test_keepalive_flips_revoked_and_isolates_failures(
    owned_cleanup: dict[str, list], monkeypatch: pytest.MonkeyPatch
) -> None:
    """One revoked grant must be flipped `sync_broken` without aborting the
    batch — a healthy sibling connection is still refreshed."""
    async with AsyncSessionLocal() as s:
        org = Organization(name=f"KA-{uuid.uuid4().hex[:6]}")
        s.add(org)
        await s.flush()
        owned_cleanup["orgs"].append(org.id)
        good_user = await _seed_gcal_user(s, owned_cleanup, org)
        bad_user = await _seed_gcal_user(s, owned_cleanup, org)
        rt_good = f"rt-good-{uuid.uuid4().hex[:8]}"
        rt_bad = f"rt-bad-{uuid.uuid4().hex[:8]}"
        good = await _seed_connection(s, user=good_user, org=org, refresh_token=rt_good)
        bad = await _seed_connection(s, user=bad_user, org=org, refresh_token=rt_bad)
        await s.commit()
        good_id, bad_id = good.id, bad.id

    fake = _KeepaliveClient(revoke={rt_bad})
    monkeypatch.setattr("app.services.google_calendar.get_google_calendar_client", lambda: fake)

    await run_google_calendar_keepalive()

    # The revoked grant is retried once before giving up (2 calls), then flipped.
    assert fake.calls.count(rt_bad) == 2

    async with AsyncSessionLocal() as s:
        good_row = await s.get(GoogleCalendarConnection, good_id)
        bad_row = await s.get(GoogleCalendarConnection, bad_id)
        assert good_row is not None and good_row.sync_broken is False
        assert bad_row is not None and bad_row.sync_broken is True


async def test_keepalive_skips_already_broken_connections(
    owned_cleanup: dict[str, list], monkeypatch: pytest.MonkeyPatch
) -> None:
    async with AsyncSessionLocal() as s:
        org = Organization(name=f"KA-{uuid.uuid4().hex[:6]}")
        s.add(org)
        await s.flush()
        owned_cleanup["orgs"].append(org.id)
        user = await _seed_gcal_user(s, owned_cleanup, org)
        rt = f"rt-broken-{uuid.uuid4().hex[:8]}"
        await _seed_connection(s, user=user, org=org, refresh_token=rt, sync_broken=True)
        await s.commit()

    fake = _KeepaliveClient()
    monkeypatch.setattr("app.services.google_calendar.get_google_calendar_client", lambda: fake)

    await run_google_calendar_keepalive()
    # A connection already flagged broken is never touched by the keep-alive.
    assert rt not in fake.calls


# --------------------------------------------------------------------------
# Recurring-charge sweep — per-period idempotency (review R5 P1 hardening)
# --------------------------------------------------------------------------


class _FakeRecurringComgate:
    """Accepts every recurring charge; records ref_ids. Distinct trans_ids
    keep the unique `charges.comgate_trans_id` constraint happy."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    async def create_recurring_payment(
        self, *, initial_trans_id: str, amount_minor: int, currency: str, ref_id: str, label: str
    ) -> RecurringChargeResult:
        self.calls.append(ref_id)
        return RecurringChargeResult(trans_id=f"RC-{uuid.uuid4().hex[:10]}", accepted=True)


async def _seed_due_subscription(
    owned_cleanup: dict[str, list],
) -> tuple[uuid.UUID, uuid.UUID]:
    """Org with an active monthly sub that is due for renewal NOW and has a
    saved card. Returns (org_id, subscription_id)."""
    async with AsyncSessionLocal() as s:
        org = Organization(name=f"Renew-{uuid.uuid4().hex[:6]}")
        s.add(org)
        await s.flush()
        owned_cleanup["orgs"].append(org.id)

        plan_id = (await s.execute(select(Plan.id).where(Plan.code == "monthly"))).scalar_one()
        now = datetime.now(tz=UTC)
        sub = Subscription(
            organization_id=org.id,
            plan_id=plan_id,
            status="active",
            started_at=now - timedelta(days=30),
            current_period_starts_at=now - timedelta(days=30),
            current_period_ends_at=now - timedelta(minutes=5),
            seat_count=3,
            contracted_seat_count=3,
            next_renewal_charge_at=now - timedelta(minutes=5),
        )
        s.add(sub)
        s.add(
            PaymentMethod(
                organization_id=org.id,
                comgate_initial_trans_id=f"INIT-{uuid.uuid4().hex[:8]}",
                card_brand="visa",
                card_last4="4242",
            )
        )
        await s.commit()
        return org.id, sub.id


async def _org_renewal_charges(org_id: uuid.UUID) -> list[Charge]:
    async with AsyncSessionLocal() as s:
        rows = (
            await s.execute(
                select(Charge)
                .where(Charge.organization_id == org_id)
                .where(Charge.kind == "renewal")
                .order_by(Charge.created_at)
            )
        ).scalars()
        return list(rows)


async def test_recurring_sweep_charges_once_per_period(
    owned_cleanup: dict[str, list], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Regression (review R5 P1): the webhook is what advances
    `next_renewal_charge_at`, so until it lands the sub still looks due.
    A second sweep (next worker's tick, back-to-back wake) must NOT
    create a second ComGate charge for the same period."""
    org_id, _sub_id = await _seed_due_subscription(owned_cleanup)
    fake = _FakeRecurringComgate()
    monkeypatch.setattr("app.services.scheduler.get_comgate_client", lambda: fake)

    first = await run_recurring_charges()
    second = await run_recurring_charges()

    ours = await _org_renewal_charges(org_id)
    assert len(ours) == 1, "exactly one pending renewal charge for the period"
    assert ours[0].status == "pending"
    assert first >= 1 and str(ours[0].id) in fake.calls
    assert second == 0 or str(ours[0].id) == fake.calls[-1]
    assert len([r for r in fake.calls if r == str(ours[0].id)]) == 1


async def test_recurring_sweep_retries_after_failed_charge(
    owned_cleanup: dict[str, list], monkeypatch: pytest.MonkeyPatch
) -> None:
    """A `failed` charge must not block the dunning retry: once the
    backoff-bumped `next_renewal_charge_at` elapses, the sweep charges
    again for the same period."""
    org_id, sub_id = await _seed_due_subscription(owned_cleanup)
    fake = _FakeRecurringComgate()
    monkeypatch.setattr("app.services.scheduler.get_comgate_client", lambda: fake)

    await run_recurring_charges()

    async with AsyncSessionLocal() as s:
        charge = (
            await s.execute(select(Charge).where(Charge.organization_id == org_id))
        ).scalar_one()
        charge.status = "failed"
        sub = await s.get(Subscription, sub_id)
        assert sub is not None
        sub.next_renewal_charge_at = datetime.now(tz=UTC) - timedelta(minutes=1)
        await s.commit()

    retried = await run_recurring_charges()
    assert retried >= 1
    ours = await _org_renewal_charges(org_id)
    assert len(ours) == 2
    assert {c.status for c in ours} == {"failed", "pending"}


async def test_recurring_sweep_bills_pending_seat_count(
    owned_cleanup: dict[str, list], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Money-review R2 P1: a queued downsize (pending_seat_count) must be
    billed at the DOWNSIZED count — the renewal charge pays for the very
    period in which apply_renewal_success applies the queue."""
    org_id, sub_id = await _seed_due_subscription(owned_cleanup)
    async with AsyncSessionLocal() as s:
        sub = await s.get(Subscription, sub_id)
        assert sub is not None
        sub.pending_seat_count = 1  # downsize 3 → 1 queued for the rollover
        await s.commit()

    fake = _FakeRecurringComgate()
    monkeypatch.setattr("app.services.scheduler.get_comgate_client", lambda: fake)
    await run_recurring_charges()

    ours = await _org_renewal_charges(org_id)
    assert len(ours) == 1
    async with AsyncSessionLocal() as s:
        price = (
            await s.execute(select(Plan.price_per_user_minor).where(Plan.code == "monthly"))
        ).scalar_one()
    assert ours[0].amount_minor == price * 1, "renewal must bill the queued (downsized) count"
    assert ours[0].seats == 1


async def test_recurring_sweep_bills_pending_plan_swap(
    owned_cleanup: dict[str, list], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Money-review R2 P1: a queued monthly→annual swap must be billed at
    the ANNUAL price — apply_renewal_success will roll the period 12
    months forward off this charge."""
    org_id, sub_id = await _seed_due_subscription(owned_cleanup)
    async with AsyncSessionLocal() as s:
        annual_id = (await s.execute(select(Plan.id).where(Plan.code == "annual"))).scalar_one()
        sub = await s.get(Subscription, sub_id)
        assert sub is not None
        sub.pending_plan_id = annual_id
        await s.commit()

    fake = _FakeRecurringComgate()
    monkeypatch.setattr("app.services.scheduler.get_comgate_client", lambda: fake)
    await run_recurring_charges()

    ours = await _org_renewal_charges(org_id)
    assert len(ours) == 1
    async with AsyncSessionLocal() as s:
        annual_price = (
            await s.execute(select(Plan.price_per_user_minor).where(Plan.code == "annual"))
        ).scalar_one()
    assert ours[0].amount_minor == annual_price * 3, (
        "renewal must bill the queued (annual) plan's price, "
        "not the outgoing monthly price, because the webhook rolls the "
        "period forward by the new plan's 12 months"
    )


async def test_recurring_sweep_charges_again_after_period_rollover(
    owned_cleanup: dict[str, list], monkeypatch: pytest.MonkeyPatch
) -> None:
    """After the webhook rolls the period forward (apply_renewal_success),
    the next due date must produce a fresh charge — the idempotency guard
    is scoped to a single period, not forever."""
    org_id, sub_id = await _seed_due_subscription(owned_cleanup)
    fake = _FakeRecurringComgate()
    monkeypatch.setattr("app.services.scheduler.get_comgate_client", lambda: fake)

    await run_recurring_charges()

    # Simulate the paid webhook: period rolls forward, then a month later
    # the new period is due.
    now = datetime.now(tz=UTC)
    async with AsyncSessionLocal() as s:
        charge = (
            await s.execute(select(Charge).where(Charge.organization_id == org_id))
        ).scalar_one()
        charge.status = "paid"
        sub = await s.get(Subscription, sub_id)
        assert sub is not None
        sub.current_period_starts_at = now - timedelta(days=30)
        sub.current_period_ends_at = now - timedelta(minutes=1)
        sub.next_renewal_charge_at = now - timedelta(minutes=1)
        await s.commit()

    attempts = await run_recurring_charges()
    assert attempts >= 1
    ours = await _org_renewal_charges(org_id)
    assert len(ours) == 2


async def test_freeing_sweep_skips_when_another_worker_holds_lock(
    owned_cleanup: dict[str, list],
) -> None:
    """Regression (review R5 P1): the sweep is single-flighted behind a Postgres
    advisory lock, so a second worker running the same tick must skip (return 0)
    and leave an expired company untouched — no double sweep / double side effects."""
    async with AsyncSessionLocal() as s:
        org = Organization(name=f"LockOrg-{uuid.uuid4().hex[:6]}")
        s.add(org)
        await s.flush()
        owned_cleanup["orgs"].append(org.id)
        email = f"lk-{uuid.uuid4().hex[:8]}@ex.cz"
        owned_cleanup["emails"].append(email)
        owner = User(email=email, name="Lk", role=UserRole.salesperson, organization_id=org.id)
        s.add(owner)
        await s.flush()
        s.add(
            Company(
                organization_id=org.id,
                name="Expired-Locked",
                owner_user_id=owner.id,
                ownership_expires_at=datetime.now(tz=UTC) - timedelta(days=1),
            )
        )
        await s.commit()
        owner_id = owner.id

    # Hold the freeing lock on a separate connection, then invoke the sweep:
    # it must find the lock taken and skip.
    async with AsyncSessionLocal() as holder:
        got = (await holder.execute(select(func.pg_try_advisory_lock(_LOCK_FREEING)))).scalar_one()
        assert got is True
        try:
            result = await run_freeing_sweep()
            assert result == 0  # skipped
        finally:
            await holder.execute(select(func.pg_advisory_unlock(_LOCK_FREEING)))
            await holder.commit()

    async with AsyncSessionLocal() as s:
        still_owned = (
            await s.execute(select(Company.owner_user_id).where(Company.name == "Expired-Locked"))
        ).scalar_one()
    assert still_owned == owner_id, "sweep must not have freed the company while lock was held"
