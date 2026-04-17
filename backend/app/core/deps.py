"""Reusable FastAPI dependencies.

- `get_current_user` — extracts and verifies a Bearer access token.
- `require_role` — factory; 403s if the user's role isn't in the allowed set.
- `require_active_trial_or_subscription` — 402s when the org's trial has ended
  and no subscription is active.
"""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable, Iterable
from datetime import UTC, datetime

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


async def require_active_trial_or_subscription(
    user: User = Depends(get_current_user),
) -> User:
    """Reject access when the org's trial has expired and no paid plan is active.

    The "active subscription" signal for MVP is `Organization.stripe_customer_id`
    being non-null. Actual Stripe integration lands later; this gate exists
    from day one so the frontend can render its blocking state.
    """
    org = user.organization
    if org.stripe_customer_id is not None:
        return user
    if org.trial_ends_at > datetime.now(tz=UTC):
        return user
    raise HTTPException(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        detail={
            "detail": "Trial expired",
            "trial_ends_at": org.trial_ends_at.isoformat(),
            "organization_id": str(org.id),
        },
    )
