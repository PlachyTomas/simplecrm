"""Unit tests for the role matcher and trial gate.

These exercise the dependency functions directly by constructing a User
fixture; the integration (HTTP) paths are covered in tests/api/v1/test_auth.py.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException

from app.core.deps import (
    require_active_trial_or_subscription,
    require_leaderboard_visibility,
    require_role,
    require_roles,
)
from app.db.models import Organization, User, UserRole


def _build_user(
    role: UserRole,
    *,
    trial_delta: timedelta = timedelta(days=5),
    stripe_customer_id: str | None = None,
    show_leaderboard_to_salespeople: bool = False,
) -> User:
    org = Organization(
        id=uuid.uuid4(),
        name="Fixture Org",
        locale="cs-CZ",
        currency="CZK",
        region="eu-cz",  # type: ignore[arg-type]
        trial_ends_at=datetime.now(tz=UTC) + trial_delta,
        stripe_customer_id=stripe_customer_id,
        show_leaderboard_to_salespeople=show_leaderboard_to_salespeople,
    )
    user = User(
        id=uuid.uuid4(),
        email="fixture@example.cz",
        name="Fixture",
        role=role,
        organization_id=org.id,
        is_active=True,
    )
    user.organization = org
    return user


async def test_require_role_admits_admin_unconditionally() -> None:
    dep = require_role(UserRole.salesperson)  # admin not in allowed list
    user = _build_user(UserRole.admin)
    assert await dep(user=user) is user


async def test_require_role_admits_listed_role() -> None:
    dep = require_role(UserRole.manager, UserRole.salesperson)
    assert (await dep(user=_build_user(UserRole.manager))).role is UserRole.manager


async def test_require_role_rejects_unlisted_role() -> None:
    dep = require_role(UserRole.manager)
    with pytest.raises(HTTPException) as exc:
        await dep(user=_build_user(UserRole.salesperson))
    assert exc.value.status_code == 403


async def test_require_roles_accepts_iterable() -> None:
    dep = require_roles([UserRole.salesperson])
    assert (await dep(user=_build_user(UserRole.salesperson))).role is UserRole.salesperson


def test_require_role_with_empty_set_raises_value_error() -> None:
    with pytest.raises(ValueError, match="no allowed roles"):
        require_role()


async def test_trial_gate_admits_users_inside_trial() -> None:
    user = _build_user(UserRole.salesperson, trial_delta=timedelta(days=5))
    assert await require_active_trial_or_subscription(user=user) is user


async def test_trial_gate_rejects_expired_trial_without_subscription() -> None:
    user = _build_user(UserRole.salesperson, trial_delta=timedelta(days=-1))
    with pytest.raises(HTTPException) as exc:
        await require_active_trial_or_subscription(user=user)
    assert exc.value.status_code == 402
    assert isinstance(exc.value.detail, dict)
    assert exc.value.detail["detail"] == "Trial expired"
    assert "trial_ends_at" in exc.value.detail


async def test_trial_gate_admits_expired_trial_with_subscription() -> None:
    user = _build_user(
        UserRole.salesperson,
        trial_delta=timedelta(days=-1),
        stripe_customer_id="cus_test",
    )
    assert await require_active_trial_or_subscription(user=user) is user


async def test_leaderboard_visibility_admits_admin_and_manager() -> None:
    admin = _build_user(UserRole.admin)
    manager = _build_user(UserRole.manager)
    assert await require_leaderboard_visibility(user=admin) is admin
    assert await require_leaderboard_visibility(user=manager) is manager


async def test_leaderboard_visibility_blocks_salesperson_when_off() -> None:
    user = _build_user(UserRole.salesperson, show_leaderboard_to_salespeople=False)
    with pytest.raises(HTTPException) as exc:
        await require_leaderboard_visibility(user=user)
    assert exc.value.status_code == 403
    assert isinstance(exc.value.detail, dict)
    assert exc.value.detail["code"] == "leaderboard_hidden"


async def test_leaderboard_visibility_admits_salesperson_when_on() -> None:
    user = _build_user(UserRole.salesperson, show_leaderboard_to_salespeople=True)
    assert await require_leaderboard_visibility(user=user) is user
