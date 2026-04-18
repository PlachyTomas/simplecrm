"""Smoke tests for the Phase 2 company + ownership-history models."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Activity,
    ActivityEntityType,
    ActivityType,
    Company,
    Contact,
    Deal,
    Organization,
    OwnershipChangeReason,
    OwnershipHistory,
    Stage,
    User,
    UserRole,
)
from app.db.models.company import OWNERSHIP_WINDOW
from app.services.pipeline import create_default_pipeline


async def _seed_org_and_user(db_session: AsyncSession) -> tuple[Organization, User]:
    org = Organization(name="Alfa Test s.r.o.")
    db_session.add(org)
    await db_session.flush()
    user = User(
        email=f"owner-{org.id.hex[:8]}@alfa.cz",
        name="Majitel",
        role=UserRole.admin,
        organization_id=org.id,
    )
    db_session.add(user)
    await db_session.flush()
    return org, user


async def test_company_default_ownership_expires_in_365_days(
    db_session: AsyncSession,
) -> None:
    org, owner = await _seed_org_and_user(db_session)
    before = datetime.now(tz=UTC)
    company = Company(
        organization_id=org.id,
        name="Alza.cz a.s.",
        ico="27082440",
        owner_user_id=owner.id,
    )
    db_session.add(company)
    await db_session.flush()
    await db_session.refresh(company)
    after = datetime.now(tz=UTC)

    # Default kicks in the client; the window is 365 days from insertion time.
    assert before + OWNERSHIP_WINDOW - timedelta(seconds=1) <= company.ownership_expires_at
    assert company.ownership_expires_at <= after + OWNERSHIP_WINDOW + timedelta(seconds=1)


async def test_company_ico_unique_per_organization(db_session: AsyncSession) -> None:
    org, _ = await _seed_org_and_user(db_session)
    db_session.add_all(
        [
            Company(organization_id=org.id, name="A", ico="27082440"),
            Company(organization_id=org.id, name="A duplikát", ico="27082440"),
        ]
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_same_ico_allowed_across_organizations(
    db_session: AsyncSession,
) -> None:
    first_org = Organization(name="First")
    second_org = Organization(name="Second")
    db_session.add_all([first_org, second_org])
    await db_session.flush()

    db_session.add_all(
        [
            Company(organization_id=first_org.id, name="Alza v First", ico="27082440"),
            Company(organization_id=second_org.id, name="Alza v Second", ico="27082440"),
        ]
    )
    await db_session.flush()  # should not raise


async def test_ownership_history_records_event(db_session: AsyncSession) -> None:
    org, owner = await _seed_org_and_user(db_session)
    company = Company(
        organization_id=org.id,
        name="Beta s.r.o.",
        owner_user_id=owner.id,
    )
    db_session.add(company)
    await db_session.flush()

    history = OwnershipHistory(
        company_id=company.id,
        user_id=owner.id,
        reason=OwnershipChangeReason.initial,
    )
    db_session.add(history)
    await db_session.flush()

    rows = (
        (
            await db_session.execute(
                select(OwnershipHistory).where(OwnershipHistory.company_id == company.id)
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1
    assert rows[0].reason is OwnershipChangeReason.initial
    assert rows[0].released_at is None


async def test_contact_links_to_company(db_session: AsyncSession) -> None:
    org, _ = await _seed_org_and_user(db_session)
    company = Company(organization_id=org.id, name="Alza.cz a.s.")
    db_session.add(company)
    await db_session.flush()

    contact = Contact(
        organization_id=org.id,
        company_id=company.id,
        first_name="Jan",
        last_name="Novák",
        email="jan.novak@alza.cz",
        position="CFO",
    )
    db_session.add(contact)
    await db_session.flush()
    await db_session.refresh(contact, attribute_names=["company"])
    assert contact.company is not None
    assert contact.company.name == "Alza.cz a.s."


async def test_contact_email_unique_per_organization(
    db_session: AsyncSession,
) -> None:
    org, _ = await _seed_org_and_user(db_session)
    db_session.add_all(
        [
            Contact(
                organization_id=org.id,
                first_name="Jan",
                last_name="Novák",
                email="duplicate@example.cz",
            ),
            Contact(
                organization_id=org.id,
                first_name="Jana",
                last_name="Nová",
                email="duplicate@example.cz",
            ),
        ]
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_contact_email_shared_across_organizations(
    db_session: AsyncSession,
) -> None:
    first = Organization(name="First ct")
    second = Organization(name="Second ct")
    db_session.add_all([first, second])
    await db_session.flush()

    db_session.add_all(
        [
            Contact(
                organization_id=first.id,
                first_name="Jan",
                last_name="Novák",
                email="shared@example.cz",
            ),
            Contact(
                organization_id=second.id,
                first_name="Jana",
                last_name="Nová",
                email="shared@example.cz",
            ),
        ]
    )
    await db_session.flush()  # should not raise


async def test_deleting_company_nulls_contact_company_id(
    db_session: AsyncSession,
) -> None:
    org, _ = await _seed_org_and_user(db_session)
    company = Company(organization_id=org.id, name="Brzy smazaná a.s.")
    db_session.add(company)
    await db_session.flush()

    contact = Contact(
        organization_id=org.id,
        company_id=company.id,
        first_name="Petr",
        last_name="Svoboda",
        email="petr.svoboda@example.cz",
    )
    db_session.add(contact)
    await db_session.flush()

    contact_id = contact.id
    await db_session.execute(delete(Company).where(Company.id == company.id))
    await db_session.flush()
    await db_session.refresh(contact)
    refreshed = await db_session.get(Contact, contact_id)
    assert refreshed is not None
    assert refreshed.company_id is None


async def _seed_pipeline_and_company(
    db_session: AsyncSession,
) -> tuple[Organization, Company, Stage, User]:
    org, owner = await _seed_org_and_user(db_session)
    pipeline = await create_default_pipeline(db_session, org.id)
    await db_session.refresh(pipeline, attribute_names=["stages"])
    company = Company(organization_id=org.id, name="DealCo s.r.o.")
    db_session.add(company)
    await db_session.flush()
    return org, company, pipeline.stages[0], owner


async def test_deal_round_trip(db_session: AsyncSession) -> None:
    org, company, stage, owner = await _seed_pipeline_and_company(db_session)
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=stage.id,
        owner_user_id=owner.id,
        name="Pilotní obchod",
        value=Decimal("42500.00"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.flush()
    await db_session.refresh(deal)
    assert deal.value == Decimal("42500.00")
    assert deal.currency == "CZK"
    assert deal.closed_at is None


async def test_deleting_stage_with_deals_fails(db_session: AsyncSession) -> None:
    org, company, stage, _owner = await _seed_pipeline_and_company(db_session)
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=stage.id,
        name="Bloker",
        value=Decimal("0.00"),
        currency="CZK",
    )
    db_session.add(deal)
    await db_session.flush()

    with pytest.raises(IntegrityError):
        await db_session.execute(delete(Stage).where(Stage.id == stage.id))
        await db_session.flush()


async def test_deal_probability_override_check(db_session: AsyncSession) -> None:
    org, company, stage, _owner = await _seed_pipeline_and_company(db_session)
    bad = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=stage.id,
        name="Nevalidní",
        value=Decimal("0.00"),
        currency="CZK",
        probability_override=150,
    )
    db_session.add(bad)
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_deleting_company_cascades_deals(db_session: AsyncSession) -> None:
    org, company, stage, _owner = await _seed_pipeline_and_company(db_session)
    db_session.add(
        Deal(
            organization_id=org.id,
            company_id=company.id,
            stage_id=stage.id,
            name="Zmizí s firmou",
            value=Decimal("0.00"),
            currency="CZK",
        )
    )
    await db_session.flush()

    await db_session.execute(delete(Company).where(Company.id == company.id))
    await db_session.flush()
    remaining = (
        (await db_session.execute(select(Deal).where(Deal.company_id == company.id)))
        .scalars()
        .all()
    )
    assert remaining == []


async def test_activity_round_trip_with_jsonb_payload(
    db_session: AsyncSession,
) -> None:
    org, user = await _seed_org_and_user(db_session)
    company = Company(organization_id=org.id, name="Aktivity s.r.o.")
    db_session.add(company)
    await db_session.flush()

    activity = Activity(
        organization_id=org.id,
        entity_type=ActivityEntityType.company,
        entity_id=company.id,
        user_id=user.id,
        activity_type=ActivityType.note,
        payload={"text": "Zavolat zítra", "priority": "high"},
    )
    db_session.add(activity)
    await db_session.flush()
    await db_session.refresh(activity)

    assert activity.payload == {"text": "Zavolat zítra", "priority": "high"}
    assert activity.entity_type is ActivityEntityType.company
    assert activity.created_at is not None


async def test_activity_query_by_entity(db_session: AsyncSession) -> None:
    org, user = await _seed_org_and_user(db_session)
    contact = Contact(
        organization_id=org.id,
        first_name="Eva",
        last_name="Nováková",
        email="eva@ex.cz",
    )
    db_session.add(contact)
    await db_session.flush()
    db_session.add_all(
        [
            Activity(
                organization_id=org.id,
                entity_type=ActivityEntityType.contact,
                entity_id=contact.id,
                user_id=user.id,
                activity_type=ActivityType.note,
                payload={"text": f"poznámka {i}"},
            )
            for i in range(3)
        ]
    )
    await db_session.flush()

    rows = (
        (
            await db_session.execute(
                select(Activity).where(
                    Activity.entity_type == ActivityEntityType.contact,
                    Activity.entity_id == contact.id,
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 3


async def test_activity_user_delete_nulls_user_id(
    db_session: AsyncSession,
) -> None:
    org, user = await _seed_org_and_user(db_session)
    company = Company(organization_id=org.id, name="Keep me a.s.")
    db_session.add(company)
    await db_session.flush()

    activity = Activity(
        organization_id=org.id,
        entity_type=ActivityEntityType.company,
        entity_id=company.id,
        user_id=user.id,
        activity_type=ActivityType.note,
        payload={},
    )
    db_session.add(activity)
    await db_session.flush()
    activity_id = activity.id

    await db_session.execute(delete(User).where(User.id == user.id))
    await db_session.flush()
    db_session.expire_all()
    refreshed = await db_session.get(Activity, activity_id)
    assert refreshed is not None
    assert refreshed.user_id is None
