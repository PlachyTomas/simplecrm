"""Reusable FastAPI dependencies.

- `get_current_user` — extracts and verifies a Bearer access token.
- `require_role` — factory; 403s if the user's role isn't in the allowed set.
- `require_active_trial_or_subscription` — 402s when the org's trial has ended
  and no subscription is active.
"""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable, Iterable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.security import ACCESS_TOKEN_TYPE, JWTError, decode_token
from app.db import get_db
from app.db.models import User, UserRole

bearer_scheme = HTTPBearer(auto_error=False, description="JWT access token")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_token(credentials.credentials)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if payload.get("type") != ACCESS_TOKEN_TYPE:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Wrong token type")

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed token"
        ) from exc

    user = await session.get(User, user_id, options=[joinedload(User.organization)])
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive"
        )
    return user


def require_role(*allowed: UserRole) -> Callable[[User], Awaitable[User]]:
    """Dependency factory: 403 unless the user's role is in `allowed`.

    Admins bypass the check — their role implies every other capability.
    """
    allowed_set: frozenset[UserRole] = frozenset(allowed)
    if not allowed_set:
        raise ValueError("require_role() called with no allowed roles")

    async def _enforce(user: User = Depends(get_current_user)) -> User:
        if user.role is UserRole.admin or user.role in allowed_set:
            return user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient role",
        )

    return _enforce


def require_roles(allowed: Iterable[UserRole]) -> Callable[[User], Awaitable[User]]:
    """Iterable-accepting sibling of `require_role`; useful when composing
    role sets at module level."""
    return require_role(*allowed)


async def require_org_membership(
    user: User = Depends(get_current_user),
) -> User:
    """403 when the user has no organization yet (post-signup, pre-create-org).

    Used as a gate ahead of `require_active_trial_or_subscription` on every
    org-scoped router so those endpoints don't have to scatter null-checks
    against `user.organization_id`. The frontend `ProtectedRoute` reads
    `user.organization_id == null` from `/auth/me` and redirects to the
    create-org flow before any of these endpoints are called.
    """
    if user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"detail": "Organization setup required", "code": "needs_org_setup"},
        )
    return user


async def require_can_invite(
    user: User = Depends(get_current_user),
) -> User:
    """Admin or anyone with `can_invite=True` may issue/revoke invitations."""
    if user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"detail": "Organization setup required", "code": "needs_org_setup"},
        )
    if user.role is UserRole.admin or user.can_invite:
        return user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Insufficient permission",
    )


async def require_leaderboard_visibility(
    user: User = Depends(get_current_user),
) -> User:
    """Reject salespeople when their org has the leaderboard hidden.

    Admins and managers always pass; for them the leaderboard is a core
    management tool. Salespeople pass only when the admin has explicitly
    opted the org into showing the leaderboard via Settings → Oprávnění
    (`Organization.show_leaderboard_to_salespeople`). The default for new
    orgs is False, so the gate is closed unless flipped on.
    """
    if user.role is not UserRole.salesperson:
        return user
    if user.organization is not None and user.organization.show_leaderboard_to_salespeople:
        return user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "detail": "Leaderboard hidden by organization policy",
            "code": "leaderboard_hidden",
        },
    )


async def require_super_admin(
    user: User = Depends(get_current_user),
) -> User:
    """403 unless the user has `is_super_admin=True`. Cross-organization scope.

    Distinct from org-level `role='admin'`: super-admins operate the
    /admin/* surface across every organization. Set the flag manually
    via SQL on the founder's user row.
    """
    if not user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super-admin access required",
        )
    return user


async def require_active_trial_or_subscription(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> User:
    """Reject access when the org's subscription doesn't allow it.

    Source of truth: `BillingService.is_app_access_allowed` — comp orgs
    (an org a super-admin marked free to use) always pass; trialing/active
    orgs pass while their period is open; past-due orgs get a 7-day grace;
    pending_activation and canceled deny.

    Super-admins are never gated: they're cross-organization platform
    operators, so an expired org trial must not 402 `/auth/me` and bounce
    them off the /admin surface to /login.

    Users without an organization (post-signup, pre-create-org) bypass
    this gate so `/auth/me` can return their record and the frontend
    can route them to the create-org flow.

    Fallback: orgs that somehow lack a Subscription row (the migration
    backfilled every existing org and onboarding seeds one for new
    orgs, so this only happens to test fixtures that seed orgs
    directly) fall back to an `Organization.trial_ends_at` check so
    the legacy contract still holds.
    """
    if user.is_super_admin:
        return user

    if user.organization_id is None or user.organization is None:
        return user

    # Lazy import to dodge any import cycle through app.services.billing.
    from datetime import UTC, datetime

    from sqlalchemy import select

    from app.db.models import Subscription
    from app.services import billing

    sub = (
        await session.execute(
            select(Subscription).where(Subscription.organization_id == user.organization_id)
        )
    ).scalar_one_or_none()

    if sub is None:
        # Legacy fallback for orgs without a Subscription row.
        if user.organization.trial_ends_at > datetime.now(tz=UTC):
            return user
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "subscription_required",
                "current_status": "trialing",
                "is_comp": False,
                "can_choose_plan": True,
                "ends_at": user.organization.trial_ends_at.isoformat(),
            },
        )

    if billing.is_app_access_allowed(sub):
        return user

    raise HTTPException(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        detail={
            "code": "subscription_required",
            "current_status": sub.status,
            "is_comp": sub.is_comp,
            "can_choose_plan": True,
            "ends_at": (
                sub.current_period_ends_at.isoformat() if sub.current_period_ends_at else None
            ),
        },
    )
