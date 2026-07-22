"""Tests for the scheduler wrapper + freeing sweep orchestration."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.token_crypto import decrypt_token, encrypt_token
from app.db.models import Company, GoogleCalendarConnection, Organization, User, UserRole
from app.db.session import AsyncSessionLocal
from app.services.email import Email, build_freed_company_email
from app.services.google_calendar import GoogleCalendarAuthError
from app.services.scheduler import (
    _LOCK_FREEING,
    _seconds_until_next_run,
    run_freeing_sweep,
    run_google_calendar_keepalive,
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
