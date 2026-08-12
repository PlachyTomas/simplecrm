"""Integration tests for /api/v1/todo-lists, /api/v1/todos and the
deal-scoped todo endpoints.

Todo lists are **personal**: `todo_lists.user_id` is the sole owner and no
endpoint ever returns another user's row, even inside the same org — a
foreign id answers 404, never 403.

Endpoint commits escape the rollback fixture, so each test seeds
UUID-suffixed data and tears down via `owned_cleanup` (deleting the org
cascades to its users, lists and todos).

Coverage: list ordering + open_count, per-user isolation, todo ordering
(open before done), the list-link-wins rule and its 422 backstop, the
two-path deal query, default-list creation on the deal-scoped POST,
deal deletion nulling links, and list deletion cascading.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import Company, Deal, Organization, Stage, Todo, TodoList, User, UserRole
from app.db.session import AsyncSessionLocal
from app.services.pipeline import create_default_pipeline

LISTS = "/api/v1/todo-lists"
TODOS = "/api/v1/todos"


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


async def _seed_org(
    session: AsyncSession, owned_cleanup: dict[str, list], *, locale: str = "cs-CZ"
) -> tuple[Organization, Stage]:
    org = Organization(name=f"TdOrg-{uuid.uuid4().hex[:6]}", locale=locale)
    session.add(org)
    await session.commit()
    owned_cleanup["orgs"].append(org.id)
    pipeline = await create_default_pipeline(session, org.id)
    await session.commit()
    await session.refresh(pipeline, attribute_names=["stages"])
    return org, pipeline.stages[0]


async def _seed_user(
    session: AsyncSession,
    owned_cleanup: dict[str, list],
    org: Organization,
    role: UserRole = UserRole.admin,
) -> User:
    email = f"u-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    user = User(email=email, name="U", role=role, organization_id=org.id)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def _seed_deal(session: AsyncSession, org: Organization, stage: Stage) -> Deal:
    company = Company(organization_id=org.id, name=f"Co-{uuid.uuid4().hex[:4]}")
    session.add(company)
    await session.commit()
    deal = Deal(
        organization_id=org.id,
        company_id=company.id,
        stage_id=stage.id,
        name=f"Deal-{uuid.uuid4().hex[:4]}",
    )
    session.add(deal)
    await session.commit()
    await session.refresh(deal)
    return deal


async def _seed_list(
    session: AsyncSession,
    user: User,
    name: str,
    deal: Deal | None = None,
) -> TodoList:
    row = TodoList(
        organization_id=user.organization_id,
        user_id=user.id,
        name=name,
        deal_id=deal.id if deal else None,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


async def _seed_todo(
    session: AsyncSession,
    todo_list: TodoList,
    text: str,
    *,
    position: int = 0,
    is_done: bool = False,
    deal: Deal | None = None,
) -> Todo:
    row = Todo(
        list_id=todo_list.id,
        text=text,
        position=position,
        is_done=is_done,
        deal_id=deal.id if deal else None,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


def _auth(user: User) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {create_access_token(user.id, user.organization_id, user.role)}"
    }


# lists ---------------------------------------------------------------------


async def test_list_returns_own_lists_oldest_first_with_open_counts(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _ = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    first = await _seed_list(db_session, user, "Dnes")
    second = await _seed_list(db_session, user, "Později")
    await _seed_todo(db_session, first, "Otevřený")
    await _seed_todo(db_session, first, "Hotový", position=1, is_done=True)

    response = await client.get(LISTS, headers=_auth(user))

    assert response.status_code == 200, response.text
    body = response.json()
    assert [row["name"] for row in body] == ["Dnes", "Později"]
    assert body[0]["id"] == str(first.id)
    # Done todos don't count as open.
    assert body[0]["open_count"] == 1
    assert body[1]["id"] == str(second.id)
    assert body[1]["open_count"] == 0


async def test_list_excludes_another_users_lists_in_the_same_org(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _ = await _seed_org(db_session, owned_cleanup)
    mine = await _seed_user(db_session, owned_cleanup, org)
    theirs = await _seed_user(db_session, owned_cleanup, org, role=UserRole.salesperson)
    await _seed_list(db_session, mine, "Moje")
    await _seed_list(db_session, theirs, "Cizí")

    response = await client.get(LISTS, headers=_auth(mine))

    assert response.status_code == 200, response.text
    assert [row["name"] for row in response.json()] == ["Moje"]


async def test_create_list_with_deal_link_returns_deal_name(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    deal = await _seed_deal(db_session, org, stage)

    response = await client.post(
        LISTS, json={"name": "  Nákup  ", "deal_id": str(deal.id)}, headers=_auth(user)
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "Nákup"  # trimmed
    assert body["deal_id"] == str(deal.id)
    assert body["deal_name"] == deal.name
    assert body["open_count"] == 0


async def test_create_list_rejects_blank_name(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _ = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)

    response = await client.post(LISTS, json={"name": "   "}, headers=_auth(user))

    assert response.status_code == 422, response.text


async def test_create_list_rejects_a_deal_from_another_org(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org_a, _ = await _seed_org(db_session, owned_cleanup)
    org_b, stage_b = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org_a)
    foreign_deal = await _seed_deal(db_session, org_b, stage_b)

    response = await client.post(
        LISTS, json={"name": "X", "deal_id": str(foreign_deal.id)}, headers=_auth(user)
    )

    assert response.status_code == 400, response.text


async def test_patch_list_clears_the_deal_link_with_an_explicit_null(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    deal = await _seed_deal(db_session, org, stage)
    todo_list = await _seed_list(db_session, user, "Vázaný", deal=deal)

    response = await client.patch(
        f"{LISTS}/{todo_list.id}", json={"deal_id": None}, headers=_auth(user)
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["deal_id"] is None
    assert body["deal_name"] is None
    assert body["name"] == "Vázaný"  # untouched by the partial update


async def test_patch_another_users_list_is_404_not_403(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _ = await _seed_org(db_session, owned_cleanup)
    mine = await _seed_user(db_session, owned_cleanup, org)
    theirs = await _seed_user(db_session, owned_cleanup, org, role=UserRole.salesperson)
    foreign = await _seed_list(db_session, theirs, "Cizí")

    response = await client.patch(
        f"{LISTS}/{foreign.id}", json={"name": "Ukradeno"}, headers=_auth(mine)
    )

    assert response.status_code == 404, response.text


async def test_delete_list_cascades_its_todos(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _ = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    todo_list = await _seed_list(db_session, user, "Ke smazání")
    todo = await _seed_todo(db_session, todo_list, "Zmizí")

    response = await client.delete(f"{LISTS}/{todo_list.id}", headers=_auth(user))

    assert response.status_code == 204, response.text
    async with AsyncSessionLocal() as session:
        remaining = (
            await session.execute(select(Todo).where(Todo.id == todo.id))
        ).scalar_one_or_none()
    assert remaining is None


# todos ---------------------------------------------------------------------


async def test_todos_are_ordered_open_first_then_by_position(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _ = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    todo_list = await _seed_list(db_session, user, "Dnes")
    await _seed_todo(db_session, todo_list, "Hotovo", position=0, is_done=True)
    await _seed_todo(db_session, todo_list, "Druhý", position=2)
    await _seed_todo(db_session, todo_list, "První", position=1)

    response = await client.get(f"{LISTS}/{todo_list.id}/todos", headers=_auth(user))

    assert response.status_code == 200, response.text
    assert [row["text"] for row in response.json()] == ["První", "Druhý", "Hotovo"]


async def test_create_todo_appends_after_the_last_position(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _ = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    todo_list = await _seed_list(db_session, user, "Dnes")
    await _seed_todo(db_session, todo_list, "Existující", position=7)

    response = await client.post(
        f"{LISTS}/{todo_list.id}/todos", json={"text": "Nový"}, headers=_auth(user)
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["position"] == 8
    assert body["is_done"] is False
    assert body["list_id"] == str(todo_list.id)
    assert body["list_name"] == "Dnes"


async def test_create_todo_in_another_users_list_is_404(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _ = await _seed_org(db_session, owned_cleanup)
    mine = await _seed_user(db_session, owned_cleanup, org)
    theirs = await _seed_user(db_session, owned_cleanup, org, role=UserRole.salesperson)
    foreign = await _seed_list(db_session, theirs, "Cizí")

    response = await client.post(
        f"{LISTS}/{foreign.id}/todos", json={"text": "Vloudil jsem se"}, headers=_auth(mine)
    )

    assert response.status_code == 404, response.text


async def test_patch_todo_ticks_it_done(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _ = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    todo_list = await _seed_list(db_session, user, "Dnes")
    todo = await _seed_todo(db_session, todo_list, "Zavolat")

    response = await client.patch(f"{TODOS}/{todo.id}", json={"is_done": True}, headers=_auth(user))

    assert response.status_code == 200, response.text
    assert response.json()["is_done"] is True


async def test_patch_todo_deal_link_is_422_when_its_list_is_deal_linked(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """The list link wins, so a per-todo link would be dead config. The UI
    disables the control; this is the server-side backstop."""
    org, stage = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    list_deal = await _seed_deal(db_session, org, stage)
    other_deal = await _seed_deal(db_session, org, stage)
    todo_list = await _seed_list(db_session, user, "Vázaný", deal=list_deal)
    todo = await _seed_todo(db_session, todo_list, "Zavolat")

    response = await client.patch(
        f"{TODOS}/{todo.id}", json={"deal_id": str(other_deal.id)}, headers=_auth(user)
    )

    assert response.status_code == 422, response.text


async def test_patch_todo_text_still_works_inside_a_deal_linked_list(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    deal = await _seed_deal(db_session, org, stage)
    todo_list = await _seed_list(db_session, user, "Vázaný", deal=deal)
    todo = await _seed_todo(db_session, todo_list, "Zavolat")

    response = await client.patch(
        f"{TODOS}/{todo.id}", json={"text": "Zavolat zítra"}, headers=_auth(user)
    )

    assert response.status_code == 200, response.text
    assert response.json()["text"] == "Zavolat zítra"


async def test_patch_another_users_todo_is_404(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _ = await _seed_org(db_session, owned_cleanup)
    mine = await _seed_user(db_session, owned_cleanup, org)
    theirs = await _seed_user(db_session, owned_cleanup, org, role=UserRole.salesperson)
    foreign_list = await _seed_list(db_session, theirs, "Cizí")
    foreign_todo = await _seed_todo(db_session, foreign_list, "Tajné")

    response = await client.patch(
        f"{TODOS}/{foreign_todo.id}", json={"is_done": True}, headers=_auth(mine)
    )

    assert response.status_code == 404, response.text


async def test_delete_todo_removes_only_that_row(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, _ = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    todo_list = await _seed_list(db_session, user, "Dnes")
    doomed = await _seed_todo(db_session, todo_list, "Smazat")
    keeper = await _seed_todo(db_session, todo_list, "Nechat", position=1)

    response = await client.delete(f"{TODOS}/{doomed.id}", headers=_auth(user))

    assert response.status_code == 204, response.text
    listing = await client.get(f"{LISTS}/{todo_list.id}/todos", headers=_auth(user))
    assert [row["id"] for row in listing.json()] == [str(keeper.id)]


# deal-scoped ---------------------------------------------------------------


async def test_deal_todos_include_both_link_paths(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    deal = await _seed_deal(db_session, org, stage)
    other_deal = await _seed_deal(db_session, org, stage)

    linked_list = await _seed_list(db_session, user, "Vázaný", deal=deal)
    inherited = await _seed_todo(db_session, linked_list, "Zděděný")

    loose_list = await _seed_list(db_session, user, "Volný")
    direct = await _seed_todo(db_session, loose_list, "Přímý", deal=deal)
    await _seed_todo(db_session, loose_list, "Cizí deal", position=1, deal=other_deal)
    await _seed_todo(db_session, loose_list, "Bez dealu", position=2)

    # A todo whose own link points here but whose list is linked elsewhere:
    # the list wins, so it belongs to `other_deal`, not this one.
    elsewhere_list = await _seed_list(db_session, user, "Jinam", deal=other_deal)
    await _seed_todo(db_session, elsewhere_list, "Přebitý", deal=deal)

    response = await client.get(f"/api/v1/deals/{deal.id}/todos", headers=_auth(user))

    assert response.status_code == 200, response.text
    body = response.json()
    assert {row["id"] for row in body} == {str(inherited.id), str(direct.id)}
    assert {row["list_name"] for row in body} == {"Vázaný", "Volný"}


async def test_deal_todos_exclude_another_users_todos(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org(db_session, owned_cleanup)
    mine = await _seed_user(db_session, owned_cleanup, org)
    theirs = await _seed_user(db_session, owned_cleanup, org, role=UserRole.salesperson)
    deal = await _seed_deal(db_session, org, stage)
    their_list = await _seed_list(db_session, theirs, "Jejich", deal=deal)
    await _seed_todo(db_session, their_list, "Soukromé")

    response = await client.get(f"/api/v1/deals/{deal.id}/todos", headers=_auth(mine))

    assert response.status_code == 200, response.text
    assert response.json() == []


async def test_deal_todos_for_a_deal_in_another_org_is_404(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org_a, _ = await _seed_org(db_session, owned_cleanup)
    org_b, stage_b = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org_a)
    foreign_deal = await _seed_deal(db_session, org_b, stage_b)

    response = await client.get(f"/api/v1/deals/{foreign_deal.id}/todos", headers=_auth(user))

    assert response.status_code == 404, response.text


async def test_post_deal_todo_creates_a_default_list_when_the_user_has_none(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org(db_session, owned_cleanup, locale="cs-CZ")
    user = await _seed_user(db_session, owned_cleanup, org)
    deal = await _seed_deal(db_session, org, stage)

    response = await client.post(
        f"/api/v1/deals/{deal.id}/todos", json={"text": "Poslat nabídku"}, headers=_auth(user)
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["deal_id"] == str(deal.id)
    assert body["list_name"] == "Úkoly"
    listing = await client.get(LISTS, headers=_auth(user))
    assert [row["name"] for row in listing.json()] == ["Úkoly"]


async def test_post_deal_todo_default_list_name_follows_an_english_org_locale(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org(db_session, owned_cleanup, locale="en-US")
    user = await _seed_user(db_session, owned_cleanup, org)
    deal = await _seed_deal(db_session, org, stage)

    response = await client.post(
        f"/api/v1/deals/{deal.id}/todos", json={"text": "Send quote"}, headers=_auth(user)
    )

    assert response.status_code == 201, response.text
    assert response.json()["list_name"] == "To-do"


async def test_post_deal_todo_appends_to_the_oldest_existing_list(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org, stage = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    deal = await _seed_deal(db_session, org, stage)
    oldest = await _seed_list(db_session, user, "Nejstarší")
    await _seed_list(db_session, user, "Novější")

    response = await client.post(
        f"/api/v1/deals/{deal.id}/todos", json={"text": "Poslat nabídku"}, headers=_auth(user)
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["list_id"] == str(oldest.id)
    assert body["deal_id"] == str(deal.id)


async def test_deleting_a_deal_keeps_its_todos_and_clears_the_links(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """A todo is a personal note — deleting a deal must not destroy it."""
    org, stage = await _seed_org(db_session, owned_cleanup)
    user = await _seed_user(db_session, owned_cleanup, org)
    deal = await _seed_deal(db_session, org, stage)
    linked_list = await _seed_list(db_session, user, "Vázaný", deal=deal)
    inherited = await _seed_todo(db_session, linked_list, "Zděděný")
    loose_list = await _seed_list(db_session, user, "Volný")
    direct = await _seed_todo(db_session, loose_list, "Přímý", deal=deal)

    response = await client.delete(f"/api/v1/deals/{deal.id}", headers=_auth(user))
    assert response.status_code in (200, 204), response.text

    async with AsyncSessionLocal() as session:
        surviving = (
            (await session.execute(select(Todo).where(Todo.id.in_([inherited.id, direct.id]))))
            .scalars()
            .all()
        )
        parent = (
            await session.execute(select(TodoList).where(TodoList.id == linked_list.id))
        ).scalar_one()
    assert {row.id for row in surviving} == {inherited.id, direct.id}
    assert all(row.deal_id is None for row in surviving)
    assert parent.deal_id is None
