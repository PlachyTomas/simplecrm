"""Org-creation orchestration: org + default team + default pipeline + admin.

Used by the Google OAuth callback (first-time login with no pending invite),
the dev-login flow, and the explicit `POST /onboarding/organization`
endpoint. Centralizes the side effects so they can't drift between call
sites: the org always lands with one default team named "Hlavní tým" and
the default pipeline, and the founding user is always promoted to admin
and dropped into that team.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Organization, Team, User, UserRole
from app.services.pipeline import create_default_pipeline

DEFAULT_TEAM_NAME = "Hlavní tým"


async def create_organization_with_admin(
    session: AsyncSession,
    *,
    name: str,
    founder: User,
) -> Organization:
    """Create a new Organization and promote `founder` to its admin.

    Side effects (in one transaction; caller commits):
      - Insert `Organization(name=name)`.
      - Insert default `Team(name="Hlavní tým", is_default=True)`.
      - Provision the default pipeline (delegates to `pipeline.create_default_pipeline`).
      - Set `founder.organization_id`, `founder.team_id`, `founder.role = admin`.

    The caller is expected to have already verified `founder.organization_id is None`.
    """
    organization = Organization(name=name)
    session.add(organization)
    await session.flush()

    default_team = Team(
        organization_id=organization.id,
        name=DEFAULT_TEAM_NAME,
        is_default=True,
    )
    session.add(default_team)
    await session.flush()

    await create_default_pipeline(session, organization.id)

    founder.organization_id = organization.id
    founder.team_id = default_team.id
    founder.role = UserRole.admin
    await session.flush()

    return organization
