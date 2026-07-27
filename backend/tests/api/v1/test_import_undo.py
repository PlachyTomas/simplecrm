"""Import history + undo (phase 2 of the Pipedrive migration).

The contract under test: undo deletes exactly the rows the run **created**,
in FK-safe order, and refuses to touch anything that has been worked on
since. Every test seeds unrelated data alongside the import and asserts it
survives — an undo that over-deletes is worse than one that under-deletes.
"""

from __future__ import annotations

import io
import json
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import (
    Activity,
    ActivityEntityType,
    ActivityType,
    CalendarEvent,
    Company,
    Contact,
    Deal,
    ImportRun,
    ImportRunStatus,
    Organization,
    Pipeline,
    Stage,
    User,
    UserRole,
)
from app.db.session import AsyncSessionLocal
from app.services.pipeline import create_default_pipeline


@pytest.fixture
async def owned_cleanup() -> AsyncIterator[dict[str, list[uuid.UUID | str]]]:
    tracked: dict[str, list[uuid.UUID | str]] = {"orgs": [], "emails": []}
    yield tracked
    async with AsyncSessionLocal() as session:
        if tracked["emails"]:
            await session.execute(delete(User).where(User.email.in_(tracked["emails"])))
        if tracked["orgs"]:
            org_ids = tracked["orgs"]
            await session.execute(delete(Activity).where(Activity.organization_id.in_(org_ids)))
            await session.execute(delete(Deal).where(Deal.organization_id.in_(org_ids)))
            await session.execute(delete(Pipeline).where(Pipeline.organization_id.in_(org_ids)))
            await session.execute(delete(Contact).where(Contact.organization_id.in_(org_ids)))
            await session.execute(delete(Company).where(Company.organization_id.in_(org_ids)))
            await session.execute(delete(ImportRun).where(ImportRun.organization_id.in_(org_ids)))
            await session.execute(delete(Organization).where(Organization.id.in_(org_ids)))
        await session.commit()


async def _seed_org(
    session: AsyncSession, owned_cleanup: dict[str, list[uuid.UUID | str]]
) -> Organization:
    org = Organization(name=f"Org-{uuid.uuid4().hex[:6]}")
    session.add(org)
    await session.commit()
    await session.refresh(org)
    owned_cleanup["orgs"].append(org.id)
    return org


async def _seed_user(
    session: AsyncSession,
    owned_cleanup: dict[str, list[uuid.UUID | str]],
    org: Organization,
    role: UserRole,
) -> User:
    email = f"u-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    user = User(email=email, name="U", role=role, organization_id=org.id)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


def _auth(user: User) -> dict[str, str]:
    token = create_access_token(user.id, user.organization_id, user.role)
    return {"Authorization": f"Bearer {token}"}


def _csv(content: str, filename: str) -> tuple[str, io.BytesIO, str]:
    return (filename, io.BytesIO(content.encode("utf-8")), "text/csv")


async def _seed_pipeline(org: Organization) -> dict[str, uuid.UUID]:
    async with AsyncSessionLocal() as s:
        pipeline = await create_default_pipeline(s, org.id)
        await s.commit()
        stages = (
            (await s.execute(select(Stage).where(Stage.pipeline_id == pipeline.id))).scalars().all()
        )
        return {stage.name: stage.id for stage in stages}


COMPANIES_CSV = "Název,IČO\nAcme s.r.o.,12345678\nBeta a.s.,87654321\n"
CONTACTS_CSV = "Jméno,Příjmení,E-mail,FirmaIČO\nAnna,Nováková,anna@acme.cz,12345678\n"
DEALS_CSV = "Název,Firma,Fáze\nVelký obchod,Acme s.r.o.,Lead\n"

_COMPANY_MAPPING = {"Název": "name", "IČO": "ico"}
_CONTACT_MAPPING = {"Jméno": "first_name", "Příjmení": "last_name", "E-mail": "email"}
_DEAL_MAPPING = {"Název": "name", "Firma": "company", "Fáze": "stage"}


async def _commit_full_import(
    client: AsyncClient,
    admin: User,
    stages: dict[str, uuid.UUID],
    *,
    provider: str | None = None,
) -> dict:
    """Companies + contacts + deals in one commit — the realistic migration."""
    files = [
        ("files", _csv(COMPANIES_CSV, "companies.csv")),
        ("files", _csv(CONTACTS_CSV, "contacts.csv")),
        ("files", _csv(DEALS_CSV, "deals.csv")),
    ]
    data = {
        "file_specs_json": json.dumps(
            [
                {"role": "companies", "mapping_company": _COMPANY_MAPPING},
                {
                    "role": "contacts",
                    "mapping_contact": _CONTACT_MAPPING,
                    "match_key_contact": "FirmaIČO",
                },
                {"role": "deals", "mapping_deal": _DEAL_MAPPING},
            ]
        ),
        "match_source": "ico",
        "stage_mapping_json": json.dumps({"Lead": str(stages["Nový lead"])}),
    }
    if provider is not None:
        data["provider"] = provider
    r = await client.post(
        "/api/v1/admin/imports/commit", headers=_auth(admin), files=files, data=data
    )
    assert r.status_code == 200, r.text
    body: dict = r.json()
    assert body["import_run_id"] is not None
    return body


async def _undo(client: AsyncClient, admin: User, run_id: str) -> tuple[int, dict]:
    r = await client.post(f"/api/v1/admin/imports/runs/{run_id}/undo", headers=_auth(admin))
    return r.status_code, r.json()


async def test_undo_removes_only_what_the_import_created(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    stages = await _seed_pipeline(org)

    # Unrelated, hand-made data that must be untouched by the undo.
    async with AsyncSessionLocal() as s:
        native = Company(organization_id=org.id, name="Ruční firma", ico="11111111")
        s.add(native)
        await s.flush()
        s.add(Contact(organization_id=org.id, company_id=native.id, first_name="R", last_name="U"))
        s.add(
            Deal(
                organization_id=org.id,
                company_id=native.id,
                stage_id=stages["Nový lead"],
                name="Ruční obchod",
            )
        )
        await s.commit()
        native_id = native.id

    body = await _commit_full_import(client, admin, stages)
    run_id = body["import_run_id"]

    status_code, undo = await _undo(client, admin, run_id)
    assert status_code == 200, undo
    assert undo["deleted"] == {"companies": 2, "contacts": 1, "deals": 1}
    assert undo["skipped"] == {"companies": 0, "contacts": 0, "deals": 0}
    assert undo["skipped_reasons"] == []
    assert undo["status"] == "undone"
    # Nothing was updated by this import, so nothing is left unreverted.
    assert undo["updates_not_reverted"] == {"companies": 0, "contacts": 0, "deals": 0}

    async with AsyncSessionLocal() as s:
        companies = (
            (await s.execute(select(Company).where(Company.organization_id == org.id)))
            .scalars()
            .all()
        )
        assert [c.id for c in companies] == [native_id]
        contacts = (
            (await s.execute(select(Contact).where(Contact.organization_id == org.id)))
            .scalars()
            .all()
        )
        assert [c.last_name for c in contacts] == ["U"]
        deals = (
            (await s.execute(select(Deal).where(Deal.organization_id == org.id))).scalars().all()
        )
        assert [d.name for d in deals] == ["Ruční obchod"]
        run = await s.get(ImportRun, uuid.UUID(run_id))
        assert run is not None
        assert run.status is ImportRunStatus.undone
        assert run.undone_at is not None
        assert run.undone_by_user_id == admin.id


async def test_row_edited_after_the_import_is_skipped_and_reported(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    stages = await _seed_pipeline(org)

    body = await _commit_full_import(client, admin, stages)
    run_id = body["import_run_id"]

    # Edit one imported company by hand (ORM write → `updated_at` bumps).
    async with AsyncSessionLocal() as s:
        beta = (
            (
                await s.execute(
                    select(Company).where(
                        Company.organization_id == org.id, Company.name == "Beta a.s."
                    )
                )
            )
            .scalars()
            .one()
        )
        beta.phone = "+420111222333"
        await s.commit()
        beta_id = beta.id

    status_code, undo = await _undo(client, admin, run_id)
    assert status_code == 200, undo
    assert undo["status"] == "partially_undone"
    assert undo["skipped"]["companies"] == 1
    assert undo["deleted"]["companies"] == 1
    reasons = undo["skipped_reasons"]
    assert [r["code"] for r in reasons] == ["modified_after_import"]
    assert reasons[0]["entity_id"] == str(beta_id)
    assert reasons[0]["entity_type"] == "company"
    assert "Beta a.s." in reasons[0]["message"]

    async with AsyncSessionLocal() as s:
        survivor = await s.get(Company, beta_id)
        assert survivor is not None
        assert survivor.phone == "+420111222333"
        # The edited row keeps its provenance stamp — it was still created by
        # that import, we simply refused to delete it.
        assert survivor.import_run_id == uuid.UUID(run_id)


async def test_company_with_a_hand_made_deal_is_skipped_not_cascaded(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """`deals.company_id` is ON DELETE CASCADE — deleting the company would
    take a deal the user built after the import with it."""
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    stages = await _seed_pipeline(org)

    body = await _commit_full_import(client, admin, stages)
    run_id = body["import_run_id"]

    async with AsyncSessionLocal() as s:
        beta = (
            (
                await s.execute(
                    select(Company).where(
                        Company.organization_id == org.id, Company.name == "Beta a.s."
                    )
                )
            )
            .scalars()
            .one()
        )
        s.add(
            Deal(
                organization_id=org.id,
                company_id=beta.id,
                stage_id=stages["Nový lead"],
                name="Poimportní obchod",
            )
        )
        await s.commit()
        beta_id = beta.id

    status_code, undo = await _undo(client, admin, run_id)
    assert status_code == 200, undo
    assert undo["status"] == "partially_undone"
    assert undo["skipped"]["companies"] == 1
    codes = {(r["entity_id"], r["code"]) for r in undo["skipped_reasons"]}
    assert (str(beta_id), "has_other_records") in codes

    async with AsyncSessionLocal() as s:
        assert await s.get(Company, beta_id) is not None
        names = set(
            (await s.execute(select(Deal.name).where(Deal.organization_id == org.id)))
            .scalars()
            .all()
        )
        # The hand-made deal survived; the imported one is gone.
        assert names == {"Poimportní obchod"}


async def test_deal_with_a_meeting_and_entity_with_activity_are_skipped(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """Two more "someone worked on this" signals: a calendar event (which
    would CASCADE away with the deal) and a logged activity (which has no FK
    to protect it and would dangle)."""
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    stages = await _seed_pipeline(org)

    body = await _commit_full_import(client, admin, stages)
    run_id = body["import_run_id"]

    async with AsyncSessionLocal() as s:
        deal = (await s.execute(select(Deal).where(Deal.organization_id == org.id))).scalars().one()
        starts = datetime.now(tz=UTC) + timedelta(days=1)
        s.add(
            CalendarEvent(
                organization_id=org.id,
                deal_id=deal.id,
                owner_user_id=admin.id,
                title="Schůzka",
                starts_at=starts,
                ends_at=starts + timedelta(hours=1),
            )
        )
        contact = (
            (await s.execute(select(Contact).where(Contact.organization_id == org.id)))
            .scalars()
            .one()
        )
        s.add(
            Activity(
                organization_id=org.id,
                entity_type=ActivityEntityType.contact,
                entity_id=contact.id,
                user_id=admin.id,
                activity_type=ActivityType.note,
                payload={"text": "Volali jsme."},
            )
        )
        await s.commit()
        deal_id, contact_id = deal.id, contact.id

    status_code, undo = await _undo(client, admin, run_id)
    assert status_code == 200, undo
    by_id = {r["entity_id"]: r["code"] for r in undo["skipped_reasons"]}
    assert by_id[str(deal_id)] == "has_calendar_events"
    assert by_id[str(contact_id)] == "has_activity"
    assert undo["deleted"]["deals"] == 0
    assert undo["deleted"]["contacts"] == 0
    # Acme keeps both of them, so it survives too; Beta has nothing left.
    assert undo["deleted"]["companies"] == 1

    async with AsyncSessionLocal() as s:
        assert await s.get(Deal, deal_id) is not None
        assert await s.get(Contact, contact_id) is not None


async def test_undo_deletes_in_fk_safe_order_for_a_deals_only_import(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """A deal, its contact and the company all created by the same run: the
    deletes must go deals → contacts → companies or Postgres raises."""
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    stages = await _seed_pipeline(org)

    body = await _commit_full_import(client, admin, stages)
    # The deal points at the imported company AND the imported contact is on
    # that same company, so every FK direction is exercised.
    async with AsyncSessionLocal() as s:
        deal = (await s.execute(select(Deal).where(Deal.organization_id == org.id))).scalars().one()
        assert deal.company_id is not None
        assert deal.import_run_id == uuid.UUID(body["import_run_id"])

    status_code, undo = await _undo(client, admin, body["import_run_id"])
    assert status_code == 200, undo
    assert undo["deleted"] == {"companies": 2, "contacts": 1, "deals": 1}

    async with AsyncSessionLocal() as s:
        assert (
            await s.execute(select(Company).where(Company.organization_id == org.id))
        ).scalars().all() == []


async def test_second_undo_is_a_409(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    stages = await _seed_pipeline(org)

    body = await _commit_full_import(client, admin, stages)
    run_id = body["import_run_id"]

    assert (await _undo(client, admin, run_id))[0] == 200
    status_code, again = await _undo(client, admin, run_id)
    assert status_code == 409
    assert "already been undone" in again["detail"]


async def test_another_orgs_run_is_a_404(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    stages = await _seed_pipeline(org)
    body = await _commit_full_import(client, admin, stages)

    other_org = await _seed_org(db_session, owned_cleanup)
    other_admin = await _seed_user(db_session, owned_cleanup, other_org, UserRole.admin)

    status_code, payload = await _undo(client, other_admin, body["import_run_id"])
    assert status_code == 404
    # And it is genuinely still there for its owner.
    async with AsyncSessionLocal() as s:
        run = await s.get(ImportRun, uuid.UUID(body["import_run_id"]))
        assert run is not None
        assert run.status is ImportRunStatus.committed
    assert payload["detail"] == "Import run not found."

    # An id that exists nowhere behaves the same way.
    assert (await _undo(client, admin, str(uuid.uuid4())))[0] == 404


async def test_salesperson_can_neither_list_nor_undo(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    rep = await _seed_user(db_session, owned_cleanup, org, UserRole.salesperson)
    stages = await _seed_pipeline(org)
    body = await _commit_full_import(client, admin, stages)

    assert (await client.get("/api/v1/admin/imports/runs", headers=_auth(rep))).status_code == 403
    assert (await _undo(client, rep, body["import_run_id"]))[0] == 403


async def test_history_lists_runs_with_the_counts_commit_reported(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    stages = await _seed_pipeline(org)

    body = await _commit_full_import(client, admin, stages, provider="pipedrive")

    r = await client.get("/api/v1/admin/imports/runs", headers=_auth(admin))
    assert r.status_code == 200, r.text
    page = r.json()
    assert page["total"] == 1
    item = page["items"][0]
    assert item["id"] == body["import_run_id"]
    assert item["provider"] == "pipedrive"
    assert item["status"] == "committed"
    assert item["undoable"] is True
    assert item["created_by_user_id"] == str(admin.id)
    assert item["created_by_email"] == admin.email
    # The stored counts are the same object commit answered with — one source
    # of truth for the history UI.
    assert item["counts"] == body["counts"]

    assert (await _undo(client, admin, body["import_run_id"]))[0] == 200
    after = (await client.get("/api/v1/admin/imports/runs", headers=_auth(admin))).json()["items"][
        0
    ]
    assert after["status"] == "undone"
    assert after["undoable"] is False
    assert after["undone_at"] is not None
    assert after["undone_by_user_id"] == str(admin.id)
    # Counts still describe the original import, not the undo.
    assert after["counts"] == body["counts"]


async def test_history_is_org_scoped_and_newest_first(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    stages = await _seed_pipeline(org)
    first = await _commit_full_import(client, admin, stages)
    second = await _commit_full_import(client, admin, stages)

    other_org = await _seed_org(db_session, owned_cleanup)
    other_admin = await _seed_user(db_session, owned_cleanup, other_org, UserRole.admin)
    other_stages = await _seed_pipeline(other_org)
    await _commit_full_import(client, other_admin, other_stages)

    page = (await client.get("/api/v1/admin/imports/runs?limit=1", headers=_auth(admin))).json()
    assert page["total"] == 2
    assert [i["id"] for i in page["items"]] == [second["import_run_id"]]

    page2 = (
        await client.get("/api/v1/admin/imports/runs?limit=1&offset=1", headers=_auth(admin))
    ).json()
    assert [i["id"] for i in page2["items"]] == [first["import_run_id"]]


async def test_updates_are_not_reverted_and_are_reported(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """A row the import UPDATED is neither deleted nor restored: it predates
    the run, and no before-image is stored."""
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)

    async with AsyncSessionLocal() as s:
        existing = Company(
            organization_id=org.id, name="Acme s.r.o.", ico="12345678", phone="+420000000000"
        )
        s.add(existing)
        await s.commit()
        existing_id = existing.id

    files = [("files", _csv("Název,IČO,Telefon\nAcme s.r.o.,12345678,+420999888777\n", "c.csv"))]
    data = {
        "file_specs_json": json.dumps(
            [
                {
                    "role": "companies",
                    "mapping_company": {"Název": "name", "IČO": "ico", "Telefon": "phone"},
                }
            ]
        ),
    }
    r = await client.post(
        "/api/v1/admin/imports/commit", headers=_auth(admin), files=files, data=data
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["counts"]["companies_to_update"] == 1
    assert body["created_company_ids"] == []

    status_code, undo = await _undo(client, admin, body["import_run_id"])
    assert status_code == 200, undo
    assert undo["deleted"] == {"companies": 0, "contacts": 0, "deals": 0}
    assert undo["updates_not_reverted"] == {"companies": 1, "contacts": 0, "deals": 0}

    async with AsyncSessionLocal() as s:
        company = await s.get(Company, existing_id)
        assert company is not None
        # Still there, still carrying the imported value, still unstamped.
        assert company.phone == "+420999888777"
        assert company.import_run_id is None


async def test_a_failed_commit_leaves_no_orphan_run_row(
    client: AsyncClient,
    db_session: AsyncSession,
    owned_cleanup: dict[str, list],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The run row and the rows it stamps share one transaction."""
    org = await _seed_org(db_session, owned_cleanup)
    admin = await _seed_user(db_session, owned_cleanup, org, UserRole.admin)
    stages = await _seed_pipeline(org)

    class _Boom:
        def __init__(self, **_kwargs: object) -> None:
            raise RuntimeError("write phase exploded")

    # The deals write is the last step, so companies, contacts and the run row
    # are already in the transaction when this blows up.
    monkeypatch.setattr("app.services.imports.runner.Deal", _Boom)

    with pytest.raises(RuntimeError):
        await _commit_full_import(client, admin, stages)

    async with AsyncSessionLocal() as s:
        runs = (
            (await s.execute(select(ImportRun).where(ImportRun.organization_id == org.id)))
            .scalars()
            .all()
        )
        assert runs == []
        companies = (
            (await s.execute(select(Company).where(Company.organization_id == org.id)))
            .scalars()
            .all()
        )
        assert companies == []
