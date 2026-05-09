"""Seed a richly-populated demo organization for browser testing.

Creates "Demo s.r.o." with three teams (Praha, Brno, Bratislava), an
admin + three managers + three salespeople, ~12 companies and ~36
deals spread across stages and timeframes so every Reports widget
has something to render.

Idempotent: re-running deletes the org plus its users / companies /
deals / activities / subscriptions / pipelines and rebuilds from
scratch. Safe to run repeatedly while iterating.

Usage:
    cd backend
    uv run python scripts/seed_demo_org.py

Seeded users (Eva is the admin, plus three managers + three salespeople):
    eva@demo.cz            (admin — sees everything)
    adam@demo.cz           (manager — Praha)
    bara@demo.cz           (manager — Brno)
    cyril@demo.cz          (manager — Bratislava)
    jakub@demo.cz          (salesperson — Praha)
    tereza@demo.cz         (salesperson — Brno)
    petr@demo.cz           (salesperson — Bratislava)

Sign-in is Google-only — to use these accounts you'd need to swap their
emails for real Google identities (or temporarily set `users.google_id`
via psql to a Google ID you can authenticate with).
"""

from __future__ import annotations

import asyncio
import random
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db import AsyncSessionLocal
from app.db.models import (
    Activity,
    Company,
    Deal,
    Organization,
    Pipeline,
    Plan,
    Stage,
    Subscription,
    Team,
    User,
)
from app.db.models.enums import (
    ActivityEntityType,
    ActivityType,
    UserRole,
)
from app.services.pipeline import create_default_pipeline

ORG_NAME = "Demo s.r.o."

USERS = [
    {"email": "eva@demo.cz", "name": "Eva Nováková", "role": UserRole.admin, "team": None},
    {"email": "adam@demo.cz", "name": "Adam Procházka", "role": UserRole.manager, "team": "Praha"},
    {"email": "bara@demo.cz", "name": "Bára Dvořáková", "role": UserRole.manager, "team": "Brno"},
    {
        "email": "cyril@demo.cz",
        "name": "Cyril Marek",
        "role": UserRole.manager,
        "team": "Bratislava",
    },
    {
        "email": "jakub@demo.cz",
        "name": "Jakub Veselý",
        "role": UserRole.salesperson,
        "team": "Praha",
    },
    {
        "email": "tereza@demo.cz",
        "name": "Tereza Horáková",
        "role": UserRole.salesperson,
        "team": "Brno",
    },
    {
        "email": "petr@demo.cz",
        "name": "Petr Černý",
        "role": UserRole.salesperson,
        "team": "Bratislava",
    },
]

COMPANY_NAMES = [
    "ALK Logistics",
    "Brno IT",
    "Praha Studios",
    "Plzeň Tech",
    "Ostrava Steel",
    "Liberec Cloud",
    "Hradec Energy",
    "Olomouc Print",
    "Karlovy Vary Resort",
    "Zlín Manufactura",
    "Pardubice Foods",
    "České Budějovice Brew",
]

DEAL_NAMES = [
    "Modernizace skladu",
    "Roční licence",
    "Cloud audit",
    "Refresh hardwaru",
    "ERP migrace",
    "Bezpečnostní revize",
    "Marketingová kampaň",
    "B2B partnerství",
    "Zákaznický portál",
    "Datová analytika",
]

LOST_REASONS = [
    "Cena",
    "Konkurence",
    "Časování",
    "Bez rozpočtu",
    "Špatný produkt",
]


async def _wipe_existing(session) -> None:
    """Remove the demo org and everything that points at it.

    Uses a raw `DELETE FROM organizations WHERE name=...` so Postgres-level
    `ON DELETE CASCADE` resolves the User⇄Team cycle (Users FK to Teams,
    Teams optionally FK to manager Users). The ORM cascade can't see
    through DB-level CASCADE and raises CircularDependencyError on the
    re-run of an already-seeded DB.
    """
    from sqlalchemy import text

    await session.execute(
        text("DELETE FROM organizations WHERE name = :name"),
        {"name": ORG_NAME},
    )
    await session.flush()


async def _create_org_with_subscription(session) -> Organization:
    org = Organization(name=ORG_NAME)
    session.add(org)
    await session.flush()

    # Demo org runs on the `comp` plan with `is_comp=True` so the paygate
    # never fires regardless of trial expiry or future billing changes
    # (see services/billing.is_app_access_allowed). Keeps the demo org
    # usable without wiring up the ComGate sandbox.
    comp_plan_id = (await session.execute(select(Plan.id).where(Plan.code == "comp"))).scalar_one()
    now = datetime.now(tz=UTC)
    sub = Subscription(
        organization_id=org.id,
        plan_id=comp_plan_id,
        status="active",
        is_comp=True,
        comp_reason="demo seed (auto)",
        started_at=now,
        current_period_starts_at=now,
        # Open-ended comp; no `current_period_ends_at` boundary.
        current_period_ends_at=None,
        seat_count=10,
    )
    session.add(sub)
    await session.flush()
    return org


async def _create_teams(session, org_id: uuid.UUID) -> dict[str, Team]:
    teams: dict[str, Team] = {}
    for i, name in enumerate(["Praha", "Brno", "Bratislava"]):
        t = Team(
            organization_id=org_id,
            name=name,
            is_default=(i == 0),
        )
        session.add(t)
        teams[name] = t
    await session.flush()
    return teams


async def _create_users(session, org_id: uuid.UUID, teams: dict[str, Team]) -> dict[str, User]:
    users: dict[str, User] = {}
    for spec in USERS:
        team_id = teams[spec["team"]].id if spec["team"] else None
        u = User(
            email=spec["email"],
            name=spec["name"],
            role=spec["role"],
            organization_id=org_id,
            team_id=team_id,
            is_active=True,
        )
        session.add(u)
        users[spec["email"]] = u
    await session.flush()
    # Wire managers to their teams.
    for email, u in users.items():
        if u.role is UserRole.manager:
            spec = next(s for s in USERS if s["email"] == email)
            teams[spec["team"]].manager_user_id = u.id
    await session.flush()
    return users


async def _get_stages(session, org_id: uuid.UUID) -> dict[str, Stage]:
    """Pull the default pipeline's 4 stages (Nový lead, Osloveno, Jednání, Vyhráno)."""
    pipeline = (
        await session.execute(
            select(Pipeline)
            .where(Pipeline.organization_id == org_id)
            .options(selectinload(Pipeline.stages))
        )
    ).scalar_one()
    return {s.name: s for s in pipeline.stages}


def _pick_owner(rng: random.Random, users: dict[str, User]) -> User:
    """Pick an active sales-y owner — managers + salespeople. Admins
    don't typically own deals; excluding them makes the leaderboard
    interesting."""
    pool = [u for u in users.values() if u.role is not UserRole.admin]
    return rng.choice(pool)


async def _create_companies(
    session, org_id: uuid.UUID, users: dict[str, User], rng: random.Random
) -> list[Company]:
    now = datetime.now(tz=UTC)
    companies: list[Company] = []
    for i, name in enumerate(COMPANY_NAMES):
        owner = _pick_owner(rng, users)
        # Create some companies whose ownership expires soon so the
        # `companies_at_risk` widget has something to display:
        # 2 expire ≤ 7 days, 1 ≤ 14 days, 1 ≤ 30 days, rest far out.
        if i == 0:
            expires = now + timedelta(days=4)
        elif i == 1:
            expires = now + timedelta(days=6)
        elif i == 2:
            expires = now + timedelta(days=12)
        elif i == 3:
            expires = now + timedelta(days=22)
        else:
            expires = now + timedelta(days=rng.randint(80, 360))

        # Stagger company creation across the past 90 days so
        # `new_companies` and `lead_to_deal_conversion` have a
        # meaningful sample.
        created_at = now - timedelta(days=rng.randint(0, 90))
        c = Company(
            organization_id=org_id,
            name=name,
            ico=f"{1000_0000 + i:08d}",
            owner_user_id=owner.id,
            ownership_expires_at=expires,
            created_at=created_at,
            updated_at=created_at,
        )
        session.add(c)
        companies.append(c)
    await session.flush()
    return companies


async def _create_deals(
    session,
    org_id: uuid.UUID,
    users: dict[str, User],
    stages: dict[str, Stage],
    companies: list[Company],
    rng: random.Random,
) -> list[Deal]:
    """Spread deals across stages, owners, and timeframes:
    - 18 open deals across the four open-ish stages (3 are stale: updated_at > 60 days ago).
    - 12 won deals with closed_at scattered across the past 90 days.
    - 6 lost deals (closed_at + lost_reason set, stage stays in an open stage).
    """
    now = datetime.now(tz=UTC)
    deals: list[Deal] = []
    open_stages = [stages["Nový lead"], stages["Osloveno"], stages["Jednání"]]
    won_stage = stages["Vyhráno"]

    # Open deals.
    for i in range(18):
        owner = _pick_owner(rng, users)
        company = rng.choice(companies)
        stage = rng.choice(open_stages)
        is_stale = i < 3  # 3 stale deals that haven't moved in > 60 days.
        if is_stale:
            updated_at = now - timedelta(days=rng.randint(65, 110))
            created_at = updated_at - timedelta(days=rng.randint(10, 40))
        else:
            updated_at = now - timedelta(days=rng.randint(0, 25))
            created_at = updated_at - timedelta(days=rng.randint(0, 30))
        d = Deal(
            organization_id=org_id,
            company_id=company.id,
            stage_id=stage.id,
            owner_user_id=owner.id,
            name=f"{rng.choice(DEAL_NAMES)} – {company.name}",
            value=Decimal(rng.choice([45000, 80000, 120000, 180000, 240000, 320000])),
            currency="CZK",
            created_at=created_at,
            updated_at=updated_at,
        )
        session.add(d)
        deals.append(d)

    # Won deals.
    for _ in range(12):
        owner = _pick_owner(rng, users)
        company = rng.choice(companies)
        # closed_at scattered across the past 90 days.
        closed_at = now - timedelta(days=rng.randint(0, 89))
        created_at = closed_at - timedelta(days=rng.randint(7, 60))
        d = Deal(
            organization_id=org_id,
            company_id=company.id,
            stage_id=won_stage.id,
            owner_user_id=owner.id,
            name=f"{rng.choice(DEAL_NAMES)} – {company.name}",
            value=Decimal(rng.choice([60000, 95000, 150000, 210000, 295000, 410000])),
            currency="CZK",
            created_at=created_at,
            updated_at=closed_at,
            closed_at=closed_at,
        )
        session.add(d)
        deals.append(d)

    # Lost deals (closed_at + lost_reason set; per the brief lost
    # deals stay in their original open-type stage).
    for _ in range(6):
        owner = _pick_owner(rng, users)
        company = rng.choice(companies)
        stage = rng.choice(open_stages)
        closed_at = now - timedelta(days=rng.randint(0, 60))
        created_at = closed_at - timedelta(days=rng.randint(5, 45))
        d = Deal(
            organization_id=org_id,
            company_id=company.id,
            stage_id=stage.id,
            owner_user_id=owner.id,
            name=f"{rng.choice(DEAL_NAMES)} – {company.name}",
            value=Decimal(rng.choice([30000, 75000, 120000, 200000])),
            currency="CZK",
            created_at=created_at,
            updated_at=closed_at,
            closed_at=closed_at,
            lost_reason=rng.choice(LOST_REASONS),
        )
        session.add(d)
        deals.append(d)

    await session.flush()
    return deals


async def _create_activity_history(
    session,
    org_id: uuid.UUID,
    deals: list[Deal],
    rng: random.Random,
) -> None:
    """Backfill stage_change activities so the `stale_deals` widget can
    distinguish "no movement in 60 days" deals from "moved last week"
    deals. Open non-stale deals get a recent stage_change activity;
    stale ones don't (their `updated_at` is the only signal)."""
    now = datetime.now(tz=UTC)
    for d in deals:
        if d.closed_at is not None:
            # Won / lost — drop a single closing activity.
            session.add(
                Activity(
                    organization_id=org_id,
                    entity_type=ActivityEntityType.deal,
                    entity_id=d.id,
                    user_id=d.owner_user_id,
                    activity_type=(
                        ActivityType.deal_won if d.lost_reason is None else ActivityType.deal_lost
                    ),
                    payload={},
                    created_at=d.closed_at,
                )
            )
            continue
        # Open deal: only the non-stale ones get a recent stage_change.
        days_since_update = (now - d.updated_at).days if d.updated_at else 0
        if days_since_update <= 60:
            session.add(
                Activity(
                    organization_id=org_id,
                    entity_type=ActivityEntityType.deal,
                    entity_id=d.id,
                    user_id=d.owner_user_id,
                    activity_type=ActivityType.stage_change,
                    payload={"to_stage_id": str(d.stage_id)},
                    created_at=d.updated_at or now - timedelta(days=rng.randint(1, 14)),
                )
            )
    await session.flush()


async def main() -> None:
    rng = random.Random(0xC0FFEE)  # noqa: S311 — deterministic seed, demo data only
    async with AsyncSessionLocal() as session:
        await _wipe_existing(session)

        org = await _create_org_with_subscription(session)
        teams = await _create_teams(session, org.id)
        users = await _create_users(session, org.id, teams)
        await create_default_pipeline(session, org.id)
        stages = await _get_stages(session, org.id)
        companies = await _create_companies(session, org.id, users, rng)
        deals = await _create_deals(session, org.id, users, stages, companies, rng)
        await _create_activity_history(session, org.id, deals, rng)

        await session.commit()

    print(f"Seeded {ORG_NAME}: {len(users)} users, {len(companies)} companies, {len(deals)} deals.")
    print("Logins:")
    for spec in USERS:
        team = f" ({spec['team']})" if spec["team"] else ""
        print(f"  {spec['email']:<22}  {spec['role'].value:<12} {spec['name']}{team}")


if __name__ == "__main__":
    asyncio.run(main())
